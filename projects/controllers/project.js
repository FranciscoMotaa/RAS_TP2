var Project = require("../models/project");
const {
  generateETag,
  validateETag,
  incrementVersion,
} = require("../middleware/versioning");
const {
  detectConflicts,
  resolveConflict_ThreeWayMerge,
  createConflictResponse,
} = require("../middleware/conflictResolution");
const {
  RetryBuilder,
  isConcurrencyError,
} = require("../middleware/retryManager");

/**
 * Helper para atualizar com retry automático
 */
async function updateWithRetry(userId, projectId, updateFn, maxRetries = 3) {
  const retryExecutor = new RetryBuilder()
    .withMaxRetries(maxRetries)
    .withInitialDelay(50)
    .build();

  return retryExecutor.executeWithRetry(
    () => updateFn(),
    (error) => isConcurrencyError(error),
    (retryInfo) => {
      console.log(
        `[projects-controller] Retry attempt ${retryInfo.attempt}/${retryInfo.maxRetries} após ${retryInfo.delayMs.toFixed(0)}ms: ${retryInfo.error}`
      );
    }
  );
}

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

module.exports.getOne = async (user_id, project_id) => {
  return await Project.findOne({ user_id: user_id, _id: project_id }).exec();
};

module.exports.create = async (project) => {
  return await Project.create({
    ...project,
    __version__: 0,
    __lastModified__: new Date(),
  });
};

/**
 * Update simples com validação de versão (optimistic locking)
 * Verifica se a versão corresponde antes de atualizar
 */
module.exports.update = (user_id, project_id, project, clientVersion = null) => {
  // Se há versão do cliente, usar optimistic locking
  if (clientVersion !== null && clientVersion !== undefined) {
    const newVersion = clientVersion + 1;
    
    return Project.updateOne(
      {
        user_id: user_id,
        _id: project_id,
        __version__: clientVersion, // Só atualiza se versão corresponde
      },
      {
        $set: {
          ...project,
          __version__: newVersion,
          __lastModified__: new Date(),
        },
      }
    ).then(result => {
      // Se nenhum documento foi atualizado, houve conflito
      if (result.matchedCount === 0 && result.modifiedCount === 0) {
        const error = new Error("CONCURRENT_MODIFICATION: Versão desatualizada");
        error.code = "CONCURRENT_MODIFICATION";
        error.expectedVersion = clientVersion;
        throw error;
      }
      return result;
    });
  }

  // Update sem validação de versão (fallback)
  return Project.updateOne(
    { user_id: user_id, _id: project_id },
    {
      $set: {
        ...project,
        __version__: (project.__version__ || 0) + 1,
        __lastModified__: new Date(),
      },
    }
  );
};

/**
 * Update atômico com Three-Way Merge para resolver conflitos
 */
module.exports.updateWithConflictResolution = async (
  user_id,
  project_id,
  clientChanges,
  clientVersion
) => {
  // Busca estado atual do servidor
  const serverProject = await Project.findOne({
    user_id: user_id,
    _id: project_id,
  });

  if (!serverProject) {
    throw new Error("Project not found");
  }

  // Se versões correspondem, é atualização simples
  if (serverProject.__version__ === clientVersion) {
    return module.exports.update(user_id, project_id, clientChanges, clientVersion);
  }

  // Há conflito - detectar
  const conflicts = detectConflicts(serverProject, serverProject, clientChanges);

  if (conflicts.length === 0) {
    // Sem conflitos, apenas versão diferente - permitir atualização
    return module.exports.update(
      user_id,
      project_id,
      clientChanges,
      serverProject.__version__
    );
  }

  // Há conflitos - resolver com three-way merge
  const mergedProject = resolveConflict_ThreeWayMerge(
    serverProject,
    serverProject,
    clientChanges,
    conflicts[0]
  );

  // Atualizar com versão do servidor + 1
  const result = await Project.updateOne(
    { user_id: user_id, _id: project_id },
    {
      $set: {
        ...mergedProject,
        __version__: serverProject.__version__ + 1,
        __lastModified__: new Date(),
      },
    }
  );

  return {
    ...result,
    hadConflicts: true,
    conflicts: conflicts,
    mergedProject: mergedProject,
  };
};

/**
 * Atomically append an image to the imgs array while preventing
 * duplicates by og_uri (derived from the original filename).
 * Usa versionamento para evitar race conditions.
 */
module.exports.appendImage = async (user_id, project_id, img) => {
  return await updateWithRetry(
    user_id,
    project_id,
    async () => {
      const project = await Project.findOne({
        user_id: user_id,
        _id: project_id,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      // Verifica se imagem já existe
      if (project.imgs.find(i => i.og_uri === img.og_uri)) {
        const error = new Error("Image with this name already exists");
        error.code = "DUPLICATE_IMAGE";
        throw error;
      }

      // Atualiza de forma atômica
      return Project.updateOne(
        {
          user_id: user_id,
          _id: project_id,
          "imgs.og_uri": { $ne: img.og_uri },
        },
        {
          $push: { imgs: img },
          $inc: { __version__: 1 },
          $set: { __lastModified__: new Date() },
        }
      );
    }
  );
};

/**
 * Remove imagem com retry e versionamento
 */
module.exports.removeImage = async (user_id, project_id, imageId) => {
  return await updateWithRetry(
    user_id,
    project_id,
    async () => {
      return Project.updateOne(
        {
          user_id: user_id,
          _id: project_id,
        },
        {
          $pull: { imgs: { _id: imageId } },
          $inc: { __version__: 1 },
          $set: { __lastModified__: new Date() },
        }
      );
    }
  );
};

/**
 * Adiciona ferramenta com versionamento
 */
module.exports.appendTool = async (user_id, project_id, tool) => {
  return await updateWithRetry(
    user_id,
    project_id,
    async () => {
      const project = await Project.findOne({
        user_id: user_id,
        _id: project_id,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const newTool = {
        position: project.tools.length,
        ...tool,
      };

      return Project.updateOne(
        {
          user_id: user_id,
          _id: project_id,
        },
        {
          $push: { tools: newTool },
          $inc: { __version__: 1 },
          $set: { __lastModified__: new Date() },
        }
      );
    }
  );
};

/**
 * Remove ferramenta com versionamento
 */
module.exports.removeTool = async (user_id, project_id, toolId) => {
  return await updateWithRetry(
    user_id,
    project_id,
    async () => {
      const project = await Project.findOne({
        user_id: user_id,
        _id: project_id,
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const toolToRemove = project.tools.find(t => t._id.toString() === toolId.toString());
      if (!toolToRemove) {
        throw new Error("Tool not found");
      }

      return Project.updateOne(
        {
          user_id: user_id,
          _id: project_id,
        },
        {
          $pull: { tools: { _id: toolId } },
          $inc: { __version__: 1 },
          $set: { __lastModified__: new Date() },
        }
      );
    }
  );
};

module.exports.delete = (user_id, project_id) => {
  return Project.deleteOne({ user_id: user_id, _id: project_id });
};
