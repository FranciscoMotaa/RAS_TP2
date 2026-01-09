/**
 * Observer Pattern Implementation for Project Sharing
 * 
<<<<<<< HEAD
 * Subject: Shared Project
 * Observers: Users with access to the shared project (via share token)
 * Notifications: Project updates, image additions, tool changes, processing status
 */

=======
 * This module implements the Observer Pattern to handle real-time notifications
 * for shared projects. When a project is shared, observers (users with access)
 * subscribe to the project and receive automatic updates when changes occur.
 */

/**
 * ProjectSubject - Represents a shared project (Subject in Observer Pattern)
 * Maintains a list of observers and notifies them of changes
 */
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
class ProjectSubject {
    constructor(projectId, ownerId) {
        this.projectId = projectId;
        this.ownerId = ownerId;
<<<<<<< HEAD
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
=======
        this.observers = new Map(); // userId -> observerData
    }

    /**
     * Attach an observer to this project
     * @param {string} userId - The user ID of the observer
     * @param {object} observerData - Observer metadata (permission, socketId, etc.)
     */
    attach(userId, observerData) {
        this.observers.set(userId, {
            ...observerData,
            subscribedAt: new Date()
        });
        console.log(`[Observer] User ${userId} subscribed to project ${this.projectId}`);
    }

    /**
     * Detach an observer from this project
     * @param {string} userId - The user ID of the observer to remove
     */
    detach(userId) {
        const removed = this.observers.delete(userId);
        if (removed) {
            console.log(`[Observer] User ${userId} unsubscribed from project ${this.projectId}`);
        }
        return removed;
    }

    /**
     * Check if user has permission for a specific event type
     * @param {object} observer - Observer data
     * @param {string} eventType - Type of event
     * @returns {boolean} - True if observer has permission
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
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
<<<<<<< HEAD
     * Get all observers
     * @returns {Map}
     */
    getObservers() {
        return this.observers;
    }

    /**
     * Get observer count
=======
     * Notify all observers of a change
     * @param {string} eventType - Type of event (preview-ready, process-update, etc.)
     * @param {object} data - Event data to send to observers
     * @param {object} io - Socket.io instance
     */
    notify(eventType, data, io) {
        const notifiedCount = this.observers.size;
        
        console.log(`[Observer] Notifying ${notifiedCount} observers of ${eventType} on project ${this.projectId}`);
        
        this.observers.forEach((observer, userId) => {
            if (this._hasPermission(observer, eventType)) {
                // Emit to the owner's room (where all observers are joined)
                io.to(this.ownerId).emit('project-update', {
                    eventType,
                    projectId: this.projectId,
                    data
                });
            }
        });
    }

    /**
     * Notify a specific observer
     * @param {string} userId - The user to notify
     * @param {string} eventType - Type of event
     * @param {object} data - Event data
     * @param {object} io - Socket.io instance
     */
    notifyOne(userId, eventType, data, io) {
        const observer = this.observers.get(userId);
        if (observer && this._hasPermission(observer, eventType)) {
            io.to(userId).emit('project-update', {
                eventType,
                projectId: this.projectId,
                data
            });
            console.log(`[Observer] Notified user ${userId} of ${eventType} on project ${this.projectId}`);
        }
    }

    /**
     * Get count of observers
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
     * @returns {number}
     */
    getObserverCount() {
        return this.observers.size;
    }
<<<<<<< HEAD
}

/**
 * Manager for all project subjects (shared projects)
=======

    /**
     * Get all observer IDs
     * @returns {string[]}
     */
    getObserverIds() {
        return Array.from(this.observers.keys());
    }
}

/**
 * ProjectObserverManager - Manages multiple ProjectSubjects
 * Singleton that handles subscription/unsubscription and notification routing
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
 */
class ProjectObserverManager {
    constructor() {
        this.subjects = new Map(); // projectId -> ProjectSubject
    }

    /**
<<<<<<< HEAD
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
=======
     * Get unique subject key for a project
     * @param {string} projectId
     * @param {string} ownerId
     * @returns {string}
     */
    _getSubjectKey(projectId, ownerId) {
        return `${ownerId}:${projectId}`;
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
    }

    /**
     * Subscribe a user to a project
<<<<<<< HEAD
     * @param {string} projectId - Project ID
     * @param {string} ownerId - Owner ID
     * @param {string} userId - User ID
     * @param {object} observerData - Observer metadata
     */
    subscribe(projectId, ownerId, userId, observerData) {
        const subject = this.getSubject(projectId, ownerId);
        subject.attach(userId, observerData);
=======
     * @param {string} projectId - The project ID
     * @param {string} ownerId - The owner of the project
     * @param {string} userId - The user subscribing
     * @param {object} observerData - Observer metadata
     */
    subscribe(projectId, ownerId, userId, observerData) {
        const key = this._getSubjectKey(projectId, ownerId);
        
        // Create subject if it doesn't exist
        if (!this.subjects.has(key)) {
            this.subjects.set(key, new ProjectSubject(projectId, ownerId));
            console.log(`[Observer] Created new subject for project ${projectId}`);
        }
        
        const subject = this.subjects.get(key);
        subject.attach(userId, observerData);
        
        return subject;
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
    }

    /**
     * Unsubscribe a user from a project
<<<<<<< HEAD
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
=======
     * @param {string} projectId
     * @param {string} ownerId
     * @param {string} userId
     */
    unsubscribe(projectId, ownerId, userId) {
        const key = this._getSubjectKey(projectId, ownerId);
        const subject = this.subjects.get(key);
        
        if (subject) {
            subject.detach(userId);
            
            // Remove subject if no more observers
            if (subject.getObserverCount() === 0) {
                this.subjects.delete(key);
                console.log(`[Observer] Removed subject for project ${projectId} (no more observers)`);
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
            }
        }
    }

    /**
     * Notify all observers of a project
<<<<<<< HEAD
     * @param {string} projectId - Project ID
     * @param {string} eventType - Event type
     * @param {object} data - Event data
     * @param {object} io - Socket.IO instance
     */
    notifyProject(projectId, eventType, data, io) {
        const subject = this.subjects.get(projectId);
=======
     * @param {string} projectId
     * @param {string} ownerId
     * @param {string} eventType
     * @param {object} data
     * @param {object} io
     */
    notifyProject(projectId, ownerId, eventType, data, io) {
        const key = this._getSubjectKey(projectId, ownerId);
        const subject = this.subjects.get(key);
        
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
        if (subject) {
            subject.notify(eventType, data, io);
        }
    }

    /**
<<<<<<< HEAD
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
=======
     * Get statistics about current observers
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
     * @returns {object}
     */
    getStats() {
        const stats = {
            totalProjects: this.subjects.size,
<<<<<<< HEAD
            projects: [],
        };

        this.subjects.forEach((subject, projectId) => {
            stats.projects.push({
                projectId,
                ownerId: subject.ownerId,
                observerCount: subject.getObserverCount(),
            });
        });

=======
            projects: []
        };
        
        this.subjects.forEach((subject, key) => {
            stats.projects.push({
                projectId: subject.projectId,
                ownerId: subject.ownerId,
                observerCount: subject.getObserverCount(),
                observers: subject.getObserverIds()
            });
        });
        
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
        return stats;
    }
}

<<<<<<< HEAD
module.exports = {
    ProjectSubject,
    ProjectObserverManager,
=======
// Export singleton instance
const observerManager = new ProjectObserverManager();

module.exports = {
    observerManager,
    ProjectSubject,
    ProjectObserverManager
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
};
