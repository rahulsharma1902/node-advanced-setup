const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logInfo, logError, logWarning } = require('./logger');
const { cache } = require('./cache');
const { config } = require('../config');
const { i18nManager } = require('./i18n');

/**
 * WebSocket Manager
 * Handles real-time communication with Socket.IO
 */
class WebSocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socket mapping
    this.userSockets = new Map(); // socketId -> userId mapping
    this.rooms = new Map(); // roomId -> Set of userIds
    this.activeRooms = new Map(); // roomId -> room metadata
    this.messageHistory = new Map(); // roomId -> messages array
    this.isInitialized = false;
    this.connectionStats = {
      totalConnections: 0,
      activeUsers: 0,
      totalRooms: 0,
      messagesCount: 0,
    };
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server) {
    try {
      this.io = new Server(server, {
        cors: {
          origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
          methods: ['GET', 'POST'],
          credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 1e6, // 1MB
        allowEIO3: true,
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
          skipMiddlewares: true,
        },
      });

      // Authentication middleware
      this.io.use(this.authenticateSocket.bind(this));

      // Connection handling
      this.io.on('connection', this.handleConnection.bind(this));

      // Setup periodic cleanup
      this.setupPeriodicCleanup();

      this.isInitialized = true;
      logInfo('WebSocket server initialized successfully');
    } catch (error) {
      logError(error, { context: 'Failed to initialize WebSocket server' });
      throw error;
    }
  }

  /**
   * Authenticate socket connection
   */
  async authenticateSocket(socket, next) {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '') ||
        socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.jwt.secret);

      // Check if token is blacklisted
      const isBlacklisted = await cache.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return next(new Error('Token is blacklisted'));
      }

      // Get user language preference
      const userLanguage = decoded.language || 'en';

      // Add user info to socket
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.userLanguage = userLanguage;
      socket.authenticated = true;
      socket.connectedAt = new Date();

      logInfo('Socket authenticated', {
        socketId: socket.id,
        userId: decoded.userId,
        role: decoded.role,
        language: userLanguage,
      });

      next();
    } catch (error) {
      logError(error, { context: 'Socket authentication failed', socketId: socket.id });
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;

    // Update connection stats
    this.connectionStats.totalConnections++;
    this.connectionStats.activeUsers = this.connectedUsers.size + 1;

    logInfo('User connected via WebSocket', {
      socketId: socket.id,
      userId,
      totalConnections: this.io.engine.clientsCount,
      activeUsers: this.connectionStats.activeUsers,
    });

    // Store user-socket mapping
    this.connectedUsers.set(userId, socket);
    this.userSockets.set(socket.id, userId);

    // Join user to their personal room
    socket.join(`user:${userId}`);
    socket.join(`role:${socket.userRole}`);

    // Send welcome message with localization
    const welcomeMessage = i18nManager.translate('websocket.connected', {}, socket.userLanguage);
    socket.emit('connected', {
      message: welcomeMessage,
      userId,
      socketId: socket.id,
      language: socket.userLanguage,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    });

    // Send user their active rooms
    this.sendUserActiveRooms(socket);

    // Register event handlers
    this.registerEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', reason => this.handleDisconnection(socket, reason));

    // Update user's online status
    this.updateUserOnlineStatus(userId, true);
  }

  /**
   * Register event handlers for socket
   */
  registerEventHandlers(socket) {
    const userId = socket.userId;

    // Join room
    socket.on('join_room', data => {
      this.handleJoinRoom(socket, data);
    });

    // Leave room
    socket.on('leave_room', data => {
      this.handleLeaveRoom(socket, data);
    });

    // Send message
    socket.on('send_message', data => {
      this.handleSendMessage(socket, data);
    });

    // Send private message
    socket.on('send_private_message', data => {
      this.handlePrivateMessage(socket, data);
    });

    // Typing indicators
    socket.on('typing_start', data => {
      this.handleTypingStart(socket, data);
    });

    socket.on('typing_stop', data => {
      this.handleTypingStop(socket, data);
    });

    // File sharing
    socket.on('share_file', data => {
      this.handleFileShare(socket, data);
    });

    // Voice/Video call signaling
    socket.on('call_user', data => {
      this.handleCallUser(socket, data);
    });

    socket.on('call_response', data => {
      this.handleCallResponse(socket, data);
    });

    socket.on('call_end', data => {
      this.handleCallEnd(socket, data);
    });

    // Screen sharing
    socket.on('screen_share_start', data => {
      this.handleScreenShareStart(socket, data);
    });

    socket.on('screen_share_stop', data => {
      this.handleScreenShareStop(socket, data);
    });

    // Presence updates
    socket.on('update_presence', data => {
      this.handlePresenceUpdate(socket, data);
    });

    // Get online users
    socket.on('get_online_users', data => {
      this.handleGetOnlineUsers(socket, data);
    });

    // Message reactions
    socket.on('add_reaction', data => {
      this.handleAddReaction(socket, data);
    });

    socket.on('remove_reaction', data => {
      this.handleRemoveReaction(socket, data);
    });

    // Message editing/deletion
    socket.on('edit_message', data => {
      this.handleEditMessage(socket, data);
    });

    socket.on('delete_message', data => {
      this.handleDeleteMessage(socket, data);
    });

    // Room management
    socket.on('create_room', data => {
      this.handleCreateRoom(socket, data);
    });

    socket.on('update_room', data => {
      this.handleUpdateRoom(socket, data);
    });

    socket.on('delete_room', data => {
      this.handleDeleteRoom(socket, data);
    });

    // Error handling
    socket.on('error', error => {
      logError(error, { context: 'Socket error', socketId: socket.id, userId });
    });
  }

  /**
   * Handle joining a room
   */
  async handleJoinRoom(socket, data) {
    try {
      const { roomId, password } = data;
      const userId = socket.userId;

      // Validate room access
      const canJoin = await this.validateRoomAccess(userId, roomId, password);
      if (!canJoin.allowed) {
        socket.emit('join_room_error', {
          error: canJoin.reason,
          roomId,
        });
        return;
      }

      // Join the room
      socket.join(roomId);

      // Update room membership
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId).add(userId);

      // Update room metadata
      await this.updateRoomMetadata(roomId, userId, 'joined');

      // Send confirmation to user
      socket.emit('joined_room', {
        roomId,
        message: i18nManager.translate('websocket.joined_room', { roomId }, socket.userLanguage),
        timestamp: new Date().toISOString(),
      });

      // Notify other room members
      socket.to(roomId).emit('user_joined_room', {
        userId,
        roomId,
        message: i18nManager.translate('websocket.user_joined', { userId }, socket.userLanguage),
        timestamp: new Date().toISOString(),
      });

      // Send recent message history
      await this.sendMessageHistory(socket, roomId);

      logInfo('User joined room', { userId, roomId, socketId: socket.id });
    } catch (error) {
      logError(error, {
        context: 'Failed to join room',
        userId: socket.userId,
        roomId: data.roomId,
      });
      socket.emit('join_room_error', {
        error: 'Failed to join room',
        roomId: data.roomId,
      });
    }
  }

  /**
   * Handle leaving a room
   */
  async handleLeaveRoom(socket, data) {
    try {
      const { roomId } = data;
      const userId = socket.userId;

      // Leave the room
      socket.leave(roomId);

      // Update room membership
      if (this.rooms.has(roomId)) {
        this.rooms.get(roomId).delete(userId);

        // Clean up empty rooms
        if (this.rooms.get(roomId).size === 0) {
          this.rooms.delete(roomId);
          this.activeRooms.delete(roomId);
        }
      }

      // Update room metadata
      await this.updateRoomMetadata(roomId, userId, 'left');

      // Send confirmation to user
      socket.emit('left_room', {
        roomId,
        message: i18nManager.translate('websocket.left_room', { roomId }, socket.userLanguage),
        timestamp: new Date().toISOString(),
      });

      // Notify other room members
      socket.to(roomId).emit('user_left_room', {
        userId,
        roomId,
        message: i18nManager.translate('websocket.user_left', { userId }, socket.userLanguage),
        timestamp: new Date().toISOString(),
      });

      logInfo('User left room', { userId, roomId, socketId: socket.id });
    } catch (error) {
      logError(error, {
        context: 'Failed to leave room',
        userId: socket.userId,
        roomId: data.roomId,
      });
    }
  }

  /**
   * Handle sending a message
   */
  async handleSendMessage(socket, data) {
    try {
      const { roomId, message, messageType = 'text', metadata = {} } = data;
      const userId = socket.userId;

      // Validate message
      if (!message || message.trim().length === 0) {
        socket.emit('message_error', {
          error: i18nManager.translate('websocket.empty_message', {}, socket.userLanguage),
        });
        return;
      }

      // Check if user is in the room
      if (!socket.rooms.has(roomId)) {
        socket.emit('message_error', {
          error: i18nManager.translate('websocket.not_in_room', {}, socket.userLanguage),
        });
        return;
      }

      // Create message object
      const messageObj = {
        id: this.generateMessageId(),
        userId,
        roomId,
        message: message.trim(),
        messageType,
        metadata,
        timestamp: new Date().toISOString(),
        edited: false,
        reactions: {},
      };

      // Store message in history
      await this.storeMessage(messageObj);

      // Update stats
      this.connectionStats.messagesCount++;

      // Broadcast message to room
      this.io.to(roomId).emit('new_message', messageObj);

      // Send delivery confirmation to sender
      socket.emit('message_sent', {
        messageId: messageObj.id,
        timestamp: messageObj.timestamp,
      });

      logInfo('Message sent', {
        messageId: messageObj.id,
        userId,
        roomId,
        messageType,
      });
    } catch (error) {
      logError(error, { context: 'Failed to send message', userId: socket.userId });
      socket.emit('message_error', {
        error: i18nManager.translate('websocket.message_failed', {}, socket.userLanguage),
      });
    }
  }

  /**
   * Handle private message
   */
  async handlePrivateMessage(socket, data) {
    try {
      const { targetUserId, message, messageType = 'text' } = data;
      const userId = socket.userId;

      // Check if target user is online
      const targetSocket = this.connectedUsers.get(targetUserId);
      if (!targetSocket) {
        socket.emit('private_message_error', {
          error: i18nManager.translate(
            'websocket.user_offline',
            { userId: targetUserId },
            socket.userLanguage,
          ),
        });
        return;
      }

      // Create message object
      const messageObj = {
        id: this.generateMessageId(),
        fromUserId: userId,
        toUserId: targetUserId,
        message: message.trim(),
        messageType,
        timestamp: new Date().toISOString(),
        private: true,
      };

      // Send to target user
      targetSocket.emit('private_message', messageObj);

      // Send confirmation to sender
      socket.emit('private_message_sent', {
        messageId: messageObj.id,
        targetUserId,
        timestamp: messageObj.timestamp,
      });

      // Store in cache for offline delivery
      await this.storePrivateMessage(messageObj);

      logInfo('Private message sent', {
        messageId: messageObj.id,
        fromUserId: userId,
        toUserId: targetUserId,
      });
    } catch (error) {
      logError(error, { context: 'Failed to send private message', userId: socket.userId });
    }
  }

  /**
   * Handle typing indicators
   */
  handleTypingStart(socket, data) {
    const { roomId } = data;
    const userId = socket.userId;

    socket.to(roomId).emit('user_typing', {
      userId,
      roomId,
      typing: true,
      timestamp: new Date().toISOString(),
    });
  }

  handleTypingStop(socket, data) {
    const { roomId } = data;
    const userId = socket.userId;

    socket.to(roomId).emit('user_typing', {
      userId,
      roomId,
      typing: false,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle disconnection
   */
  async handleDisconnection(socket, reason) {
    const userId = socket.userId;

    logInfo('User disconnected from WebSocket', {
      socketId: socket.id,
      userId,
      reason,
      connectedDuration: Date.now() - socket.connectedAt.getTime(),
    });

    // Clean up user mappings
    this.connectedUsers.delete(userId);
    this.userSockets.delete(socket.id);

    // Update connection stats
    this.connectionStats.activeUsers = this.connectedUsers.size;

    // Update user's online status
    await this.updateUserOnlineStatus(userId, false);

    // Notify rooms about user going offline
    const userRooms = Array.from(socket.rooms).filter(room => room !== socket.id);
    userRooms.forEach(roomId => {
      socket.to(roomId).emit('user_offline', {
        userId,
        roomId,
        timestamp: new Date().toISOString(),
      });
    });

    // Clean up empty rooms
    this.cleanupEmptyRooms();
  }

  /**
   * Send notification to user
   */
  async sendNotificationToUser(userId, notification) {
    try {
      const socket = this.connectedUsers.get(userId);
      if (socket) {
        // User is online, send immediately
        socket.emit('notification', {
          ...notification,
          timestamp: new Date().toISOString(),
        });
        return true;
      } else {
        // User is offline, store for later delivery
        await this.storeOfflineNotification(userId, notification);
        return false;
      }
    } catch (error) {
      logError(error, { context: 'Failed to send notification', userId });
      return false;
    }
  }

  /**
   * Broadcast to all users
   */
  broadcastToAll(event, data) {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      activeUsers: this.connectedUsers.size,
      totalRooms: this.rooms.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Helper methods
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async validateRoomAccess(userId, roomId, password) {
    // Implement room access validation logic
    // This is a placeholder - implement based on your requirements
    return { allowed: true };
  }

  async updateRoomMetadata(roomId, userId, action) {
    // Update room metadata in cache/database
    const key = `room:${roomId}:metadata`;
    const metadata = (await cache.get(key)) || { members: [], activity: [] };

    if (action === 'joined' && !metadata.members.includes(userId)) {
      metadata.members.push(userId);
    } else if (action === 'left') {
      metadata.members = metadata.members.filter(id => id !== userId);
    }

    metadata.activity.push({
      userId,
      action,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 100 activities
    if (metadata.activity.length > 100) {
      metadata.activity = metadata.activity.slice(-100);
    }

    await cache.set(key, metadata, 86400); // 24 hours
  }

  async storeMessage(messageObj) {
    // Store message in cache for recent history
    const key = `room:${messageObj.roomId}:messages`;
    const messages = (await cache.get(key)) || [];
    messages.push(messageObj);

    // Keep only last 50 messages in cache
    if (messages.length > 50) {
      messages.shift();
    }

    await cache.set(key, messages, 3600); // 1 hour
  }

  async sendMessageHistory(socket, roomId) {
    const key = `room:${roomId}:messages`;
    const messages = (await cache.get(key)) || [];

    socket.emit('message_history', {
      roomId,
      messages: messages.slice(-20), // Send last 20 messages
      timestamp: new Date().toISOString(),
    });
  }

  async updateUserOnlineStatus(userId, isOnline) {
    await cache.set(`user:${userId}:online`, isOnline, 300); // 5 minutes

    // Broadcast status to user's contacts/friends
    this.broadcastToRoom(`user:${userId}`, 'user_status_changed', {
      userId,
      online: isOnline,
      lastSeen: new Date().toISOString(),
    });
  }

  async sendUserActiveRooms(socket) {
    const userId = socket.userId;
    // Get user's active rooms from database/cache
    // This is a placeholder - implement based on your requirements
    const activeRooms = [];

    socket.emit('active_rooms', {
      rooms: activeRooms,
      timestamp: new Date().toISOString(),
    });
  }

  cleanupEmptyRooms() {
    for (const [roomId, members] of this.rooms.entries()) {
      if (members.size === 0) {
        this.rooms.delete(roomId);
        this.activeRooms.delete(roomId);
        this.messageHistory.delete(roomId);
      }
    }
  }

  setupPeriodicCleanup() {
    // Clean up every 5 minutes
    setInterval(
      () => {
        this.cleanupEmptyRooms();

        // Clean up old message history
        for (const [roomId, messages] of this.messageHistory.entries()) {
          const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
          this.messageHistory.set(
            roomId,
            messages.filter(msg => new Date(msg.timestamp).getTime() > cutoff),
          );
        }
      },
      5 * 60 * 1000,
    );
  }

  async storePrivateMessage(messageObj) {
    // Store private message for offline delivery
    const key = `private_messages:${messageObj.toUserId}`;
    const messages = (await cache.get(key)) || [];
    messages.push(messageObj);

    // Keep only last 100 private messages
    if (messages.length > 100) {
      messages.shift();
    }

    await cache.set(key, messages, 86400 * 7); // 7 days
  }

  async storeOfflineNotification(userId, notification) {
    const key = `offline_notifications:${userId}`;
    const notifications = (await cache.get(key)) || [];
    notifications.push({
      ...notification,
      timestamp: new Date().toISOString(),
    });

    // Keep only last 50 notifications
    if (notifications.length > 50) {
      notifications.shift();
    }

    await cache.set(key, notifications, 86400 * 3); // 3 days
  }

  // Additional handler methods for other events...
  handleFileShare(socket, data) {
    // Implement file sharing logic
    logInfo('File share request', { userId: socket.userId, data });
  }

  handleCallUser(socket, data) {
    // Implement voice/video call logic
    logInfo('Call user request', { userId: socket.userId, data });
  }

  handleCallResponse(socket, data) {
    // Implement call response logic
    logInfo('Call response', { userId: socket.userId, data });
  }

  handleCallEnd(socket, data) {
    // Implement call end logic
    logInfo('Call ended', { userId: socket.userId, data });
  }

  handleScreenShareStart(socket, data) {
    // Implement screen sharing logic
    logInfo('Screen share started', { userId: socket.userId, data });
  }

  handleScreenShareStop(socket, data) {
    // Implement screen sharing stop logic
    logInfo('Screen share stopped', { userId: socket.userId, data });
  }

  handlePresenceUpdate(socket, data) {
    // Implement presence update logic
    logInfo('Presence updated', { userId: socket.userId, data });
  }

  handleGetOnlineUsers(socket, data) {
    // Send list of online users
    const onlineUsers = Array.from(this.connectedUsers.keys());
    socket.emit('online_users', {
      users: onlineUsers,
      count: onlineUsers.length,
      timestamp: new Date().toISOString(),
    });
  }

  handleAddReaction(socket, data) {
    // Implement message reaction logic
    logInfo('Reaction added', { userId: socket.userId, data });
  }

  handleRemoveReaction(socket, data) {
    // Implement reaction removal logic
    logInfo('Reaction removed', { userId: socket.userId, data });
  }

  handleEditMessage(socket, data) {
    // Implement message editing logic
    logInfo('Message edited', { userId: socket.userId, data });
  }

  handleDeleteMessage(socket, data) {
    // Implement message deletion logic
    logInfo('Message deleted', { userId: socket.userId, data });
  }

  handleCreateRoom(socket, data) {
    // Implement room creation logic
    logInfo('Room creation request', { userId: socket.userId, data });
  }

  handleUpdateRoom(socket, data) {
    // Implement room update logic
    logInfo('Room update request', { userId: socket.userId, data });
  }

  handleDeleteRoom(socket, data) {
    // Implement room deletion logic
    logInfo('Room deletion request', { userId: socket.userId, data });
  }
}

// Create WebSocket manager instance
const webSocketManager = new WebSocketManager();

module.exports = {
  webSocketManager,
  WebSocketManager,
};
