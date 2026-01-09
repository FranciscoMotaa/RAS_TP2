const http = require("http");
const socketIo = require('socket.io');
const jwt = require("jsonwebtoken");

const { read_rabbit_msg } = require("./utils/rabbit_mq.js");
<<<<<<< HEAD
const { ProjectObserverManager } = require("./observers/ProjectObserver.js");
=======
const { observerManager } = require("./observers/ProjectObserver.js");
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)

const httpServer = http.createServer();
httpServer.listen(4000);

// Initialize Observer Pattern Manager
const observerManager = new ProjectObserverManager();

const io = socketIo(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    // options
});

io.on("connection", (socket) => {
    console.log("a user connected");

    const auth = socket.handshake.auth || {};
    const token = auth.token;
    const roomId = auth.roomId;
    const shareToken = auth.shareToken;

    if (token != null) {
        jwt.verify(token, process.env.JWT_SECRET_KEY, (e, payload) => {
            if (e) {
                socket.emit('authError', e);
                return;
            }

            const userId = payload.id;
            console.log("Connecting to room:", userId);
            socket.join(userId);

            // Observer Pattern: Subscribe to shared project if shareToken is provided
            if (shareToken) {
                try {
                    const decoded = jwt.verify(shareToken, process.env.SHARE_SECRET_KEY);
                    if (decoded.owner && decoded.projectId) {
                        console.log(`[Observer] User ${userId} subscribing to shared project ${decoded.projectId}`);
                        
                        observerManager.subscribe(
                            decoded.projectId,
                            decoded.owner,
                            userId,
                            {
                                socketId: socket.id,
                                permission: decoded.permission || 'view',
                                shareToken: shareToken,
                            }
                        );

                        // Join the project owner's room to receive updates
                        socket.join(decoded.owner);
                        
                        // Notify project owner of new observer
                        observerManager.notifyUser(
                            decoded.projectId,
                            decoded.owner,
                            'observer-joined',
                            { observerId: userId, permission: decoded.permission },
                            io
                        );
                    }
                } catch (err) {
                    console.error('[Observer] Invalid share token:', err.message);
                }
            }

            // Legacy support: also join roomId if provided
            if (roomId && roomId !== userId) {
                console.log("Also joining shared room:", roomId);
                socket.join(roomId);
            }

<<<<<<< HEAD
            // Store userId in socket for later use
            socket.userId = userId;
            socket.currentProjectId = shareToken ? jwt.decode(shareToken)?.projectId : null;
=======
            // Observer Pattern: Subscribe to project if shareToken is present
            if (shareToken) {
                try {
                    const SHARE_SECRET = process.env.SHARE_SECRET || "share_secret_key";
                    const decoded = jwt.verify(shareToken, SHARE_SECRET);
                    
                    if (decoded && decoded.type === 'share_link') {
                        const projectId = decoded.projectId;
                        const ownerId = decoded.owner;
                        const permission = decoded.permission || 'view';
                        
                        // Subscribe user as observer of this project
                        observerManager.subscribe(projectId, ownerId, payload.id, {
                            socketId: socket.id,
                            permission: permission
                        });
                        
                        console.log(`[Observer] User ${payload.id} subscribed to project ${projectId} with ${permission} permission`);
                        
                        // Store subscription info for cleanup on disconnect
                        socket._observerSubscription = {
                            projectId,
                            ownerId,
                            userId: payload.id
                        };
                    }
                } catch (err) {
                    console.error('[Observer] Error processing shareToken:', err.message);
                }
            }
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
        });
    }

    socket.on("disconnect", () => {
        console.log("A user disconnected");
        
        // Observer Pattern: Unsubscribe from project on disconnect
<<<<<<< HEAD
        if (socket.userId && socket.currentProjectId) {
            console.log(`[Observer] User ${socket.userId} unsubscribing from project ${socket.currentProjectId}`);
            observerManager.unsubscribe(socket.currentProjectId, socket.userId);
        }
    });

    // Observer Pattern: Handle manual unsubscribe
    socket.on("unsubscribe-project", (projectId) => {
        if (socket.userId) {
            console.log(`[Observer] User ${socket.userId} manually unsubscribing from project ${projectId}`);
            observerManager.unsubscribe(projectId, socket.userId);
        }
    });

    // Observer Pattern: Get observer stats (for debugging)
=======
        if (socket._observerSubscription) {
            const { projectId, ownerId, userId } = socket._observerSubscription;
            observerManager.unsubscribe(projectId, ownerId, userId);
            console.log(`[Observer] User ${userId} unsubscribed from project ${projectId} on disconnect`);
        }
    });
    
    // Debug endpoint to get observer stats
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
    socket.on("get-observer-stats", () => {
        const stats = observerManager.getStats();
        socket.emit("observer-stats", stats);
    });
});

// id do user como room id

function process_msg() {
    read_rabbit_msg('ws_queue', (msg) => {
        const msg_content = JSON.parse(msg.content.toString());
        const msg_id = msg_content.messageId;
        const timestamp = msg_content.timestamp
        const status = msg_content.status;
        const user = msg_content.user;
<<<<<<< HEAD
        const projectId = msg_content.projectId;
=======
        const projectId = msg_content.projectId; // Added for Observer Pattern
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)

        console.log('Received msg:', JSON.stringify(msg_content));

        if (/update-client-preview/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                io.to(user).emit("preview-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                
                // Observer Pattern: Notify observers of preview error
                if (projectId) {
                    observerManager.notifyProject(projectId, user, 'preview-error', {
                        error_code,
                        error_msg
                    }, io);
                }

                // Observer Pattern: Notify all observers of preview error
                if (projectId) {
                    observerManager.notifyProject(
                        projectId,
                        'preview-error',
                        { error_code, error_msg },
                        io
                    );
                }

                return;
            }

            const img_url = msg_content.img_url;

            io.to(user).emit("preview-ready", img_url);
<<<<<<< HEAD

            // Observer Pattern: Notify all observers of preview ready
            if (projectId) {
                observerManager.notifyProject(
                    projectId,
                    'preview-ready',
                    { img_url },
                    io
                );
=======
            
            // Observer Pattern: Notify observers that preview is ready
            if (projectId) {
                observerManager.notifyProject(projectId, user, 'preview-ready', {
                    img_url
                }, io);
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
            }
        }

        else if (/update-client-process/.test(msg_id)) {
            if (status == "error") {
                const error_code = msg_content.errorCode;
                const error_msg = msg_content.errorMsg;

                io.to(user).emit("process-error", JSON.stringify({ 'error_code': error_code, 'error_msg': error_msg }));
                
                // Observer Pattern: Notify observers of process error
                if (projectId) {
                    observerManager.notifyProject(projectId, user, 'process-error', {
                        error_code,
                        error_msg,
                        messageId: msg_id
                    }, io);
                }

                // Observer Pattern: Notify all observers of process error
                if (projectId) {
                    observerManager.notifyProject(
                        projectId,
                        'process-error',
                        { error_code, error_msg, messageId: msg_id },
                        io
                    );
                }

                return;
            }

            io.to(user).emit("process-update", msg_id);
<<<<<<< HEAD

            // Observer Pattern: Notify all observers of process update
            if (projectId) {
                observerManager.notifyProject(
                    projectId,
                    'process-update',
                    { messageId: msg_id },
                    io
                );
=======
            
            // Observer Pattern: Notify observers of process update
            if (projectId) {
                observerManager.notifyProject(projectId, user, 'process-update', {
                    messageId: msg_id
                }, io);
>>>>>>> 1463640 (Comportamento de results mode e view mode corrigido e método observer implementado)
            }
        }

    })
}

process_msg();
