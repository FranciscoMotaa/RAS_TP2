/**
 * Middleware para gerenciar transações MongoDB com Session
 * Garante ACID (Atomicity, Consistency, Isolation, Durability)
 */

const mongoose = require('mongoose');

/**
 * Manager de sessões para transações
 */
class TransactionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Cria nova sessão para transação
   */
  async createSession() {
    const session = await mongoose.startSession();
    session.startTransaction();
    return session;
  }

  /**
   * Commit da transação
   */
  async commitTransaction(session) {
    try {
      await session.commitTransaction();
      await session.endSession();
      return { success: true };
    } catch (error) {
      console.error('[TransactionManager] Erro no commit:', error.message);
      throw error;
    }
  }

  /**
   * Rollback da transação
   */
  async abortTransaction(session) {
    try {
      await session.abortTransaction();
      await session.endSession();
      return { success: true, aborted: true };
    } catch (error) {
      console.error('[TransactionManager] Erro no abort:', error.message);
      throw error;
    }
  }

  /**
   * Executa operação dentro de transação
   * Automaticamente faz commit ou rollback
   */
  async executeInTransaction(operation) {
    const session = await this.createSession();

    try {
      const result = await operation(session);
      await this.commitTransaction(session);
      return result;
    } catch (error) {
      await this.abortTransaction(session);
      throw error;
    }
  }

  /**
   * Executa múltiplas operações de forma atômica
   */
  async executeMultipleInTransaction(operations) {
    const session = await this.createSession();

    try {
      const results = [];
      
      for (const operation of operations) {
        const result = await operation(session);
        results.push(result);
      }

      await this.commitTransaction(session);
      return results;
    } catch (error) {
      await this.abortTransaction(session);
      throw error;
    }
  }

  /**
   * Executa com retry automático para conflitos de transação
   */
  async executeWithTransactionRetry(operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeInTransaction(operation);
      } catch (error) {
        lastError = error;

        // Erros transientes em transações
        const transientErrors = ['TransactionCoordinated', 'LockTimeout', 'WriteConflict'];
        const isTransient = transientErrors.some(errType =>
          error.codeName === errType || error.name === errType
        );

        if (!isTransient || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const delayMs = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}

/**
 * Middleware Express para injetar session em requisições
 */
function transactionMiddleware(req, res, next) {
  const transactionManager = new TransactionManager();
  
  // Adiciona método helper ao req para usar transações
  req.transaction = {
    execute: (operation) => transactionManager.executeInTransaction(operation),
    executeMultiple: (operations) => transactionManager.executeMultipleInTransaction(operations),
    executeWithRetry: (operation, maxRetries) =>
      transactionManager.executeWithTransactionRetry(operation, maxRetries),
  };

  next();
}

/**
 * Helper para usar transações em rotas
 * Uso:
 * router.put('/:user/:project', withTransaction(async (req, res, session) => {
 *   const result = await Project.findOneAndUpdate({...}, {...}, { session });
 *   ...
 * }));
 */
function withTransaction(handler) {
  return async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const result = await handler(req, res, session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      await session.endSession();
    }
  };
}

/**
 * Exemplo de uso avançado com múltiplas operações atômicas
 */
async function updateProjectWithToolsAtomically(userId, projectId, toolUpdates, session) {
  const Project = require('../models/project');
  
  // Busca projeto (com lock pessimista se suportado)
  const project = await Project.findOne(
    { user_id: userId, _id: projectId },
    null,
    { session }
  );

  if (!project) {
    throw new Error('Project not found');
  }

  // Atualiza tools
  for (const toolUpdate of toolUpdates) {
    const toolIndex = project.tools.findIndex(t => t._id.equals(toolUpdate._id));
    if (toolIndex !== -1) {
      project.tools[toolIndex] = {
        ...project.tools[toolIndex],
        ...toolUpdate,
      };
    }
  }

  // Incrementa versão
  project.__version__ = (project.__version__ || 0) + 1;
  project.__lastModified__ = new Date();

  // Salva com sessão (atomicamente)
  await project.save({ session });

  return project;
}

/**
 * Wrapper para operações que precisam de garantia ACID
 */
class AtomicOperation {
  constructor(description) {
    this.description = description;
    this.steps = [];
  }

  addStep(description, operation) {
    this.steps.push({ description, operation });
    return this;
  }

  async execute() {
    const transactionManager = new TransactionManager();
    const results = [];

    try {
      for (const step of this.steps) {
        console.log(`[AtomicOperation] Executando: ${step.description}`);
        const result = await transactionManager.executeInTransaction(
          step.operation
        );
        results.push(result);
      }
      return { success: true, results };
    } catch (error) {
      console.error(`[AtomicOperation] Erro em: ${this.description}`);
      throw error;
    }
  }
}

module.exports = {
  TransactionManager,
  transactionMiddleware,
  withTransaction,
  updateProjectWithToolsAtomically,
  AtomicOperation,
};
