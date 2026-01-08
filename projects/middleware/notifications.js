/**
 * Sistema de notificações em tempo real via WebSocket
 * Alertas sobre edições simultâneas e atualizações de projeto
 */

const EventEmitter = require('events');

/**
 * Gerenciador de eventos para projetos
 */
class ProjectEventManager extends EventEmitter {
  constructor() {
    super();
    this.activeConnections = new Map(); // userId -> Set de conexões
    this.projectSubscriptions = new Map(); // projectId -> Set de usuarios inscritos
    this.conflictNotifications = new Map(); // projectId -> Lista de conflitos
  }

  /**
   * Registra novo cliente
   */
  registerClient(userId, projectId, socket) {
    if (!this.activeConnections.has(userId)) {
      this.activeConnections.set(userId, new Set());
    }
    this.activeConnections.get(userId).add(socket);

    // Subscrever a atualizações do projeto
    if (!this.projectSubscriptions.has(projectId)) {
      this.projectSubscriptions.set(projectId, new Set());
    }
    this.projectSubscriptions.get(projectId).add(userId);

    console.log(
      `[ProjectEventManager] Cliente ${userId} registado para projeto ${projectId}`
    );
  }

  /**
   * Remove cliente
   */
  unregisterClient(userId, projectId, socket) {
    if (this.activeConnections.has(userId)) {
      this.activeConnections.get(userId).delete(socket);
      if (this.activeConnections.get(userId).size === 0) {
        this.activeConnections.delete(userId);
      }
    }

    if (this.projectSubscriptions.has(projectId)) {
      this.projectSubscriptions.get(projectId).delete(userId);
    }
  }

  /**
   * Notifica atualização de projeto
   */
  notifyProjectUpdate(projectId, userId, updateData) {
    const event = {
      type: 'PROJECT_UPDATED',
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      data: updateData,
    };

    this.broadcastToProject(projectId, event, userId);
  }

  /**
   * Notifica conflito detectado
   */
  notifyConflict(projectId, userId, conflictData) {
    const event = {
      type: 'CONCURRENT_MODIFICATION',
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      conflict: conflictData,
      message: 'Conflito detectado: outro utilizador está a editar este projeto',
    };

    // Armazena conflito
    if (!this.conflictNotifications.has(projectId)) {
      this.conflictNotifications.set(projectId, []);
    }
    this.conflictNotifications.get(projectId).push(event);

    // Notifica todos exceto o autor do conflito
    this.broadcastToProject(projectId, event, userId);
  }

  /**
   * Notifica lock do projeto
   */
  notifyProjectLocked(projectId, userId, reason) {
    const event = {
      type: 'PROJECT_LOCKED',
      projectId,
      lockedBy: userId,
      timestamp: new Date().toISOString(),
      reason,
      message: `Projeto bloqueado por ${userId}: ${reason}`,
    };

    this.broadcastToProject(projectId, event);
  }

  /**
   * Notifica unlock do projeto
   */
  notifyProjectUnlocked(projectId) {
    const event = {
      type: 'PROJECT_UNLOCKED',
      projectId,
      timestamp: new Date().toISOString(),
      message: 'Projeto desbloqueado',
    };

    this.broadcastToProject(projectId, event);
  }

  /**
   * Notifica versão desatualizada (stale)
   */
  notifyStaleVersion(projectId, userId, localVersion, serverVersion) {
    const event = {
      type: 'STALE_VERSION',
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      localVersion,
      serverVersion,
      message: `Sua versão (${localVersion}) está desatualizada. Versão atual: ${serverVersion}`,
    };

    this.sendToUser(userId, projectId, event);
  }

  /**
   * Notifica sucesso de merge automático
   */
  notifyMergeSuccess(projectId, userId, mergeDetails) {
    const event = {
      type: 'MERGE_SUCCESS',
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      details: mergeDetails,
      message: 'Conflito resolvido automaticamente via three-way merge',
    };

    this.broadcastToProject(projectId, event);
  }

  /**
   * Notifica erro de merge
   */
  notifyMergeError(projectId, userId, error) {
    const event = {
      type: 'MERGE_ERROR',
      projectId,
      userId,
      timestamp: new Date().toISOString(),
      error: error.message,
      message: 'Erro ao tentar resolver conflito automaticamente',
    };

    this.sendToUser(userId, projectId, event);
  }

  /**
   * Envia evento para todos inscritos no projeto (exceto autor)
   */
  broadcastToProject(projectId, event, excludeUserId = null) {
    const subscribers = this.projectSubscriptions.get(projectId);
    if (!subscribers) return;

    subscribers.forEach(userId => {
      if (excludeUserId && userId === excludeUserId) return;

      const connections = this.activeConnections.get(userId);
      if (!connections) return;

      connections.forEach(socket => {
        try {
          socket.emit('project:event', event);
        } catch (error) {
          console.error(
            `[ProjectEventManager] Erro ao enviar para ${userId}:`,
            error.message
          );
        }
      });
    });
  }

  /**
   * Envia evento para utilizador específico
   */
  sendToUser(userId, projectId, event) {
    const connections = this.activeConnections.get(userId);
    if (!connections) return;

    connections.forEach(socket => {
      try {
        socket.emit('project:event', event);
      } catch (error) {
        console.error(
          `[ProjectEventManager] Erro ao enviar para ${userId}:`,
          error.message
        );
      }
    });
  }

  /**
   * Obtém histórico de conflitos
   */
  getConflictHistory(projectId, limit = 10) {
    const conflicts = this.conflictNotifications.get(projectId) || [];
    return conflicts.slice(-limit);
  }

  /**
   * Limpa histórico de conflitos
   */
  clearConflictHistory(projectId) {
    this.conflictNotifications.delete(projectId);
  }

  /**
   * Estatísticas de conexões
   */
  getStats() {
    return {
      totalUsers: this.activeConnections.size,
      totalConnections: Array.from(this.activeConnections.values()).reduce(
        (sum, set) => sum + set.size,
        0
      ),
      projectsWithSubscribers: this.projectSubscriptions.size,
      pendingConflicts: Array.from(this.conflictNotifications.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
    };
  }
}

/**
 * Instância global (ou pode usar em padrão singleton)
 */
let eventManager = null;

function getProjectEventManager() {
  if (!eventManager) {
    eventManager = new ProjectEventManager();
  }
  return eventManager;
}

/**
 * Middleware Socket.io para integração
 */
function setupProjectWebSocket(io) {
  const manager = getProjectEventManager();

  io.on('connection', (socket) => {
    console.log(`[WebSocket] Novo cliente: ${socket.id}`);

    // Cliente subscreve a atualizações de um projeto
    socket.on('project:subscribe', (data) => {
      const { userId, projectId } = data;

      socket.join(`project:${projectId}`);
      manager.registerClient(userId, projectId, socket);

      // Envia histórico de conflitos
      const conflictHistory = manager.getConflictHistory(projectId);
      if (conflictHistory.length > 0) {
        socket.emit('project:conflict-history', conflictHistory);
      }

      socket.emit('project:subscribed', {
        projectId,
        message: `Subscrito a atualizações de ${projectId}`,
      });
    });

    // Cliente desinscreve
    socket.on('project:unsubscribe', (data) => {
      const { userId, projectId } = data;

      socket.leave(`project:${projectId}`);
      manager.unregisterClient(userId, projectId, socket);

      socket.emit('project:unsubscribed', {
        projectId,
        message: `Desinscrito de ${projectId}`,
      });
    });

    // Heartbeat para manter conexão viva
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Obter estatísticas
    socket.on('stats', () => {
      socket.emit('stats', manager.getStats());
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
    });

    // Erro
    socket.on('error', (error) => {
      console.error(`[WebSocket] Erro no socket ${socket.id}:`, error);
    });
  });

  return manager;
}

/**
 * Express middleware para integração com HTTP
 */
function projectEventNotificationMiddleware(req, res, next) {
  const manager = getProjectEventManager();

  // Adiciona métodos de notificação ao req
  req.notifyProjectUpdate = (projectId, userId, updateData) => {
    manager.notifyProjectUpdate(projectId, userId, updateData);
  };

  req.notifyConflict = (projectId, userId, conflictData) => {
    manager.notifyConflict(projectId, userId, conflictData);
  };

  req.notifyProjectLocked = (projectId, userId, reason) => {
    manager.notifyProjectLocked(projectId, userId, reason);
  };

  req.notifyProjectUnlocked = (projectId) => {
    manager.notifyProjectUnlocked(projectId);
  };

  req.notifyStaleVersion = (projectId, userId, localVersion, serverVersion) => {
    manager.notifyStaleVersion(projectId, userId, localVersion, serverVersion);
  };

  req.notifyMergeSuccess = (projectId, userId, mergeDetails) => {
    manager.notifyMergeSuccess(projectId, userId, mergeDetails);
  };

  req.notifyMergeError = (projectId, userId, error) => {
    manager.notifyMergeError(projectId, userId, error);
  };

  next();
}

module.exports = {
  ProjectEventManager,
  getProjectEventManager,
  setupProjectWebSocket,
  projectEventNotificationMiddleware,
};
