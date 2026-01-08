/**
 * Exemplos de Uso - Gestão de Concorrência
 * Demonstra como integrar os middlewares nas rotas existentes
 */

// =============================================================================
// EXEMPLO 1: Atualizar Nome do Projeto (com validação de versão)
// =============================================================================

const { RetryBuilder, isConcurrencyError } = require("../middleware/retryManager");
const { validateETag } = require("../middleware/versioning");
const Project = require("../models/project");

/**
 * Rota: PUT /:user/:project
 * Objetivo: Atualizar nome do projeto
 * Segurança: Validação de versão (optimistic locking)
 */
async function updateProjectName(req, res) {
  const { user, project } = req.params;
  const { name, __version__ } = req.body;

  console.log(`[UPDATE] Utilizador: ${user}, Projeto: ${project}, Versão: ${__version__}`);

  try {
    // 1. Buscar projeto atual
    const currentProject = await Project.getOne(user, project);
    if (!currentProject) {
      return res.status(404).json({ error: "Projeto não encontrado" });
    }

    // 2. Validar versão do cliente
    if (__version__ !== currentProject.__version__) {
      // Versão desatualizada - Notificar cliente
      req.notifyStaleVersion(project, user, __version__, currentProject.__version__);

      return res.status(409).json({
        error: "CONCURRENT_MODIFICATION",
        message: "Sua versão está desatualizada",
        serverVersion: currentProject.__version__,
        clientVersion: __version__,
        currentData: currentProject,
      });
    }

    // 3. Atualizar com versão validada
    const updatedProject = {
      ...currentProject,
      name,
    };

    const result = await Project.update(
      user,
      project,
      updatedProject,
      currentProject.__version__  // Valida que versão não mudou
    );

    if (!result.modifiedCount) {
      throw new Error("CONCURRENT_MODIFICATION: Conflito ao atualizar");
    }

    // 4. Notificar clientes via WebSocket
    req.notifyProjectUpdate(project, user, {
      field: "name",
      value: name,
      __version__: currentProject.__version__ + 1,
    });

    // 5. Retornar sucesso
    res.status(204).send();

  } catch (error) {
    console.error("[UPDATE ERROR]", error.message);

    if (error.code === "CONCURRENT_MODIFICATION") {
      return res.status(409).json({
        error: "CONCURRENT_MODIFICATION",
        message: error.message,
      });
    }

    res.status(500).json({ error: "Erro ao atualizar projeto" });
  }
}

// =============================================================================
// EXEMPLO 2: Adicionar Ferramenta (com retry automático e transação)
// =============================================================================

const { TransactionManager } = require("../middleware/transactions");

/**
 * Rota: POST /:user/:project/tool
 * Objetivo: Adicionar ferramenta ao projeto
 * Segurança: Retry automático + Transação ACID
 */
async function addToolToProject(req, res) {
  const { user, project } = req.params;
  const { procedure, params } = req.body;

  console.log(`[ADD TOOL] Utilizador: ${user}, Projeto: ${project}, Ferramenta: ${procedure}`);

  const retryExecutor = new RetryBuilder()
    .withMaxRetries(3)
    .withInitialDelay(100)
    .withMaxDelay(1000)
    .build();

  try {
    // Usar retry automático em caso de conflito
    const result = await retryExecutor.executeWithRetry(
      async () => {
        // Executar dentro de transação para garantir atomicidade
        const transactionManager = new TransactionManager();

        return transactionManager.executeInTransaction(async (session) => {
          // 1. Buscar projeto atual com lock pessimista (via session)
          const currentProject = await Project.findOne(
            { user_id: user, _id: project },
            null,
            { session }
          );

          if (!currentProject) {
            throw new Error("Projeto não encontrado");
          }

          // 2. Criar nova ferramenta
          const newTool = {
            position: currentProject.tools.length,
            procedure,
            params,
            createdAt: new Date(),
          };

          // 3. Adicionar ferramenta com transação
          await Project.findOneAndUpdate(
            { user_id: user, _id: project },
            {
              $push: { tools: newTool },
              $inc: { __version__: 1 },
              $set: { __lastModified__: new Date() },
            },
            { session, new: true }
          );

          // 4. Atualizar processo (se houver)
          const Process = require("../models/process");
          await Process.create(
            [{
              user_id: user,
              project_id: project,
              status: "pending",
            }],
            { session }
          );

          return {
            success: true,
            newTool,
            message: "Ferramenta adicionada com sucesso",
          };
        });
      },
      (error) => isConcurrencyError(error),
      (retryInfo) => {
        console.log(
          `[RETRY] Tentativa ${retryInfo.attempt}/${retryInfo.maxRetries} em ${retryInfo.delayMs.toFixed(0)}ms`
        );
      }
    );

    // 5. Notificar clientes
    req.notifyProjectUpdate(project, user, {
      field: "tools",
      action: "added",
      tool: result.newTool,
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("[ADD TOOL ERROR]", error.message);
    res.status(500).json({ error: error.message });
  }
}

// =============================================================================
// EXEMPLO 3: Reordenar Ferramentas (com detecção de conflito)
// =============================================================================

const {
  detectConflicts,
  resolveConflict_ThreeWayMerge,
  createConflictResponse,
} = require("../middleware/conflictResolution");

/**
 * Rota: POST /:user/:project/reorder
 * Objetivo: Reordenar ferramentas (operação sensível a conflito)
 * Segurança: Detecção e resolução automática de conflitos
 */
async function reorderTools(req, res) {
  const { user, project } = req.params;
  const { tools: clientTools, __version__: clientVersion } = req.body;

  console.log(`[REORDER] Utilizador: ${user}, Projeto: ${project}, Versão: ${clientVersion}`);

  try {
    // 1. Buscar estado atual do servidor
    const serverProject = await Project.getOne(user, project);
    if (!serverProject) {
      return res.status(404).json({ error: "Projeto não encontrado" });
    }

    // 2. Se versões correspondem, é operação simples
    if (serverProject.__version__ === clientVersion) {
      const reorderedProject = {
        ...serverProject,
        tools: clientTools.map((tool, idx) => ({
          ...tool,
          position: idx,
        })),
      };

      await Project.update(user, project, reorderedProject, clientVersion);
      req.notifyProjectUpdate(project, user, {
        field: "tools",
        action: "reordered",
      });

      return res.status(204).send();
    }

    // 3. Versões não correspondem - Verificar conflitos
    const conflicts = detectConflicts(
      serverProject,
      serverProject,
      {
        ...serverProject,
        tools: clientTools,
      }
    );

    if (conflicts.length === 0) {
      // Sem conflitos nas ferramentas, apenas versão diferente
      // Permitir atualização com versão do servidor
      const reorderedProject = {
        ...serverProject,
        tools: clientTools.map((tool, idx) => ({
          ...tool,
          position: idx,
        })),
      };

      await Project.update(
        user,
        project,
        reorderedProject,
        serverProject.__version__
      );

      req.notifyProjectUpdate(project, user, {
        field: "tools",
        action: "reordered",
        __version__: serverProject.__version__ + 1,
      });

      return res.status(204).send();
    }

    // 4. Há conflitos - Tentar merge automático
    const conflictResponse = createConflictResponse(
      conflicts,
      clientVersion,
      serverProject.__version__
    );

    // Sugerir resolução via three-way merge
    const mergedProject = resolveConflict_ThreeWayMerge(
      serverProject,
      serverProject,
      { ...serverProject, tools: clientTools },
      conflicts[0]
    );

    // Atualizar com versão incrementada
    const result = await Project.update(
      user,
      project,
      mergedProject,
      serverProject.__version__
    );

    // Notificar sobre merge bem-sucedido
    req.notifyMergeSuccess(project, user, {
      conflictsDetected: conflicts.length,
      strategy: "three-way-merge",
      resolvedFields: conflicts.map(c => c.field),
    });

    res.status(200).json({
      message: "Conflito resolvido via merge automático",
      mergedProject,
      newVersion: serverProject.__version__ + 1,
    });

  } catch (error) {
    console.error("[REORDER ERROR]", error.message);
    req.notifyMergeError(project, user, error);
    res.status(500).json({ error: error.message });
  }
}

// =============================================================================
// EXEMPLO 4: Deletar Projeto (com limpeza de recursos)
// =============================================================================

/**
 * Rota: DELETE /:user/:project
 * Objetivo: Deletar projeto e todos seus recursos
 * Segurança: Transação ACID com rollback em caso de erro
 */
async function deleteProject(req, res) {
  const { user, project } = req.params;

  console.log(`[DELETE] Utilizador: ${user}, Projeto: ${project}`);

  const transactionManager = new TransactionManager();

  try {
    const result = await transactionManager.executeInTransaction(
      async (session) => {
        // 1. Buscar projeto
        const projectDoc = await Project.findOne(
          { user_id: user, _id: project },
          null,
          { session }
        );

        if (!projectDoc) {
          throw new Error("Projeto não encontrado");
        }

        // 2. Deletar imagens armazenadas
        const Result = require("../models/result");
        const results = await Result.find(
          { user_id: user, project_id: project },
          null,
          { session }
        );

        for (let r of results) {
          // Deletar do storage (MinIO)
          await delete_image(user, project, "out", r.img_key);
          await Result.deleteOne({ _id: r._id }, { session });
        }

        // 3. Deletar previews
        const Preview = require("../models/preview");
        const previews = await Preview.find(
          { user_id: user, project_id: project },
          null,
          { session }
        );

        for (let p of previews) {
          await delete_image(user, project, "preview", p.img_key);
          await Preview.deleteOne({ _id: p._id }, { session });
        }

        // 4. Deletar projeto
        await Project.deleteOne({ _id: project }, { session });

        return { deleted: true, project };
      }
    );

    // Se chegou aqui, tudo foi deletado (ou nada foi, se erro)
    req.notifyProjectUnlocked(project);

    res.status(204).send();

  } catch (error) {
    console.error("[DELETE ERROR]", error.message);
    res.status(500).json({ error: "Erro ao deletar projeto" });
  }
}

// =============================================================================
// EXEMPLO 5: Handler de Erro Global para Concorrência
// =============================================================================

/**
 * Middleware global de erro que trata conflitos de concorrência
 */
function concurrencyErrorHandler(err, req, res, next) {
  if (err.code === "CONCURRENT_MODIFICATION") {
    console.error("[CONCURRENCY ERROR]", {
      path: req.path,
      method: req.method,
      expectedVersion: err.expectedVersion,
      error: err.message,
    });

    return res.status(409).json({
      error: "CONCURRENT_MODIFICATION",
      message: "Conflito de edição simultânea. Tente novamente.",
      retryAfterMs: 100,
      suggestedAction: "Fetch dados atualizados e tente novamente",
    });
  }

  // Outros erros
  next(err);
}

// =============================================================================
// EXEMPLO 6: Cliente Frontend (React/Next.js)
// =============================================================================

/**
 * Hook React para atualizar projeto com retry automático
 */
const useProjectUpdate = (projectId) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [project, setProject] = React.useState(null);
  const [retryCount, setRetryCount] = React.useState(0);

  // Função helper para retry
  const updateWithRetry = async (updates, maxRetries = 3) => {
    setLoading(true);
    setError(null);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 1. Fetch versão atual
        const currentResponse = await fetch(`/api/projects/${projectId}`);
        const currentProject = await currentResponse.json();

        // 2. Tentar atualizar com versão atual
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...updates,
            __version__: currentProject.__version__,
          }),
        });

        if (response.ok) {
          // Sucesso!
          const updated = await response.json();
          setProject(updated);
          setRetryCount(0);
          return updated;
        }

        if (response.status === 409) {
          // Conflito - versão desatualizada
          if (attempt < maxRetries) {
            console.log(`Retry ${attempt}/${maxRetries}...`);
            setRetryCount(attempt);
            // Aguardar antes de retry
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
            continue;
          }
        }

        // Outro erro
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao atualizar");

      } catch (err) {
        setError(err.message);
        throw err;
      }
    }

    throw new Error("Falhou após múltiplas tentativas");
  };

  return { project, loading, error, retryCount, updateWithRetry };
};

// Uso:
// const { updateWithRetry } = useProjectUpdate(projectId);
// await updateWithRetry({ name: "Novo Nome" });

module.exports = {
  updateProjectName,
  addToolToProject,
  reorderTools,
  deleteProject,
  concurrencyErrorHandler,
};
