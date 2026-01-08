/**
 * Observer Pattern Implementation for Project Sharing
 * 
 * Subject: Shared Project
 * Observers: Users with access to the shared project (via share token)
 * Notifications: Project updates, image additions, tool changes, processing status
 */

class ProjectSubject {
    constructor(projectId, ownerId) {
        this.projectId = projectId;
        this.ownerId = ownerId;
        this.observers = new Map(); // userId -> observer data
    }

    /**
     * Attach an observer (user) to this project
     * @param {string} userId - The user ID
     * @param {object} observerData - Observer metadata (socketId, permissions, etc.)
     */
    attach(userId, observerData) {
        console.log(`[Observer] User ${userId} subscribed to project ${this.projectId}`);
        this.observers.set(userId, {
            ...observerData,
            subscribedAt: new Date(),
        });
    }

    /**
     * Detach an observer (user) from this project
     * @param {string} userId - The user ID
     */
    detach(userId) {
        if (this.observers.has(userId)) {
            console.log(`[Observer] User ${userId} unsubscribed from project ${this.projectId}`);
            this.observers.delete(userId);
        }
    }

    /**
     * Notify all observers of a change
     * @param {string} eventType - Type of event (e.g., 'image-added', 'tool-updated', 'processing-complete')
     * @param {object} data - Event data
     * @param {object} io - Socket.IO instance
     */
    notify(eventType, data, io) {
        console.log(`[Observer] Notifying ${this.observers.size} observers of ${eventType} on project ${this.projectId}`);
        
        this.observers.forEach((observer, userId) => {
            // Check permissions before notifying
            if (this._hasPermission(observer, eventType)) {
                io.to(userId).emit('project-update', {
                    projectId: this.projectId,
                    ownerId: this.ownerId,
                    eventType,
                    data,
                    timestamp: new Date().toISOString(),
                });
            }
        });
    }

    /**
     * Notify specific observer
     * @param {string} userId - User to notify
     * @param {string} eventType - Event type
     * @param {object} data - Event data
     * @param {object} io - Socket.IO instance
     */
    notifyOne(userId, eventType, data, io) {
        const observer = this.observers.get(userId);
        if (observer && this._hasPermission(observer, eventType)) {
            console.log(`[Observer] Notifying user ${userId} of ${eventType} on project ${this.projectId}`);
            io.to(userId).emit('project-update', {
                projectId: this.projectId,
                ownerId: this.ownerId,
                eventType,
                data,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Check if observer has permission for this event type
     * @param {object} observer - Observer data
     * @param {string} eventType - Event type
     * @returns {boolean}
     */
    _hasPermission(observer, eventType) {
        const permission = observer.permission || 'view';
        
        // View-only observers can see all updates but not modify
        if (permission === 'view') {
            return true;
        }
        
        // Edit permission allows all notifications
        if (permission === 'edit') {
            return true;
        }
        
        return false;
    }

    /**
     * Get all observers
     * @returns {Map}
     */
    getObservers() {
        return this.observers;
    }

    /**
     * Get observer count
     * @returns {number}
     */
    getObserverCount() {
        return this.observers.size;
    }
}

/**
 * Manager for all project subjects (shared projects)
 */
class ProjectObserverManager {
    constructor() {
        this.subjects = new Map(); // projectId -> ProjectSubject
    }

    /**
     * Get or create a subject for a project
     * @param {string} projectId - Project ID
     * @param {string} ownerId - Owner ID
     * @returns {ProjectSubject}
     */
    getSubject(projectId, ownerId) {
        if (!this.subjects.has(projectId)) {
            this.subjects.set(projectId, new ProjectSubject(projectId, ownerId));
        }
        return this.subjects.get(projectId);
    }

    /**
     * Remove a subject (when project is deleted or no more observers)
     * @param {string} projectId
     */
    removeSubject(projectId) {
        if (this.subjects.has(projectId)) {
            console.log(`[Observer] Removing subject for project ${projectId}`);
            this.subjects.delete(projectId);
        }
    }

    /**
     * Subscribe a user to a project
     * @param {string} projectId - Project ID
     * @param {string} ownerId - Owner ID
     * @param {string} userId - User ID
     * @param {object} observerData - Observer metadata
     */
    subscribe(projectId, ownerId, userId, observerData) {
        const subject = this.getSubject(projectId, ownerId);
        subject.attach(userId, observerData);
    }

    /**
     * Unsubscribe a user from a project
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID
     */
    unsubscribe(projectId, userId) {
        const subject = this.subjects.get(projectId);
        if (subject) {
            subject.detach(userId);
            
            // Clean up subject if no more observers
            if (subject.getObserverCount() === 0) {
                this.removeSubject(projectId);
            }
        }
    }

    /**
     * Notify all observers of a project
     * @param {string} projectId - Project ID
     * @param {string} eventType - Event type
     * @param {object} data - Event data
     * @param {object} io - Socket.IO instance
     */
    notifyProject(projectId, eventType, data, io) {
        const subject = this.subjects.get(projectId);
        if (subject) {
            subject.notify(eventType, data, io);
        }
    }

    /**
     * Notify specific user in a project
     * @param {string} projectId - Project ID
     * @param {string} userId - User ID
     * @param {string} eventType - Event type
     * @param {object} data - Event data
     * @param {object} io - Socket.IO instance
     */
    notifyUser(projectId, userId, eventType, data, io) {
        const subject = this.subjects.get(projectId);
        if (subject) {
            subject.notifyOne(userId, eventType, data, io);
        }
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        const stats = {
            totalProjects: this.subjects.size,
            projects: [],
        };

        this.subjects.forEach((subject, projectId) => {
            stats.projects.push({
                projectId,
                ownerId: subject.ownerId,
                observerCount: subject.getObserverCount(),
            });
        });

        return stats;
    }
}

module.exports = {
    ProjectSubject,
    ProjectObserverManager,
};
