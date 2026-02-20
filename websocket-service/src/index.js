// ============================================================
// 📡 WEBSOCKET SERVICE - Real-time Notifications
// ============================================================
//
// CONCEPT: WebSocket Protocol
// 
// HTTP = ONE-WAY conversation per request
//   Client: "Give me data" → Server: "Here's data" → Connection CLOSED
//   Client: "Give me data" → Server: "Here's data" → Connection CLOSED
//   (Client has to keep asking)
//
// WebSocket = PERSISTENT TWO-WAY conversation
//   Client ←→ Server (connection stays OPEN)
//   Server: "Hey! Update for you!" (server can push anytime)
//   Client: "Send a message" (client can send anytime)
//
// REAL-WORLD USES:
// - Chat applications (WhatsApp, Slack)
// - Live notifications (Facebook, Twitter)
// - Real-time dashboards (stock prices, analytics)
// - Online gaming (multiplayer)
// - Collaborative editing (Google Docs)
//
// MENTAL MODEL: WebSocket vs HTTP
// HTTP = Sending letters back and forth (slow, one at a time)
// WebSocket = Making a phone call (instant, both can talk anytime)
//
// HOW IT WORKS:
// 1. Client makes HTTP request with "Upgrade: websocket" header
// 2. Server agrees → Connection is "upgraded" to WebSocket
// 3. Both sides can now send messages freely
// 4. Connection stays open until either side closes it
//
// INTERVIEW TOPICS:
// - WebSocket vs HTTP Polling vs SSE (Server-Sent Events)
// - Socket.IO vs native WebSocket
// - WebSocket authentication
// - Scaling WebSockets (sticky sessions, Redis adapter)
//
// SOCKET.IO:
// Socket.IO is a library that makes WebSockets easy. It provides:
// - Auto-reconnection (if connection drops, it reconnects)
// - Fallback to HTTP polling (if WebSocket not supported)
// - Room support (send to specific groups of users)
// - Namespace support (organize by feature)
// - Acknowledgments (confirm message received)
//
// SOCKET.IO vs NATIVE WEBSOCKET:
// Native WebSocket: Raw, lower-level, more control
// Socket.IO: Higher-level, more features, easier to use
// Socket.IO is NOT pure WebSocket. It has its own protocol on top.
// A native WebSocket client CANNOT connect to a Socket.IO server!
// ============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Import RabbitMQ utilities
const { connectRabbitMQ, subscribeToMessages } = require('../../shared/rabbitmq');

const PORT = process.env.PORT || 5003;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

const app = express();

// ═══════════════════════════════════════════════════════════
// STEP 1: Create HTTP server + Socket.IO
// ═══════════════════════════════════════════════════════════
//
// IMPORTANT: Socket.IO needs a raw HTTP server, not Express directly.
// We create an HTTP server and attach BOTH Express and Socket.IO to it.
//
// Express handles: Regular HTTP requests (health checks)
// Socket.IO handles: WebSocket connections
// ═══════════════════════════════════════════════════════════

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',  // In production, restrict this!
    methods: ['GET', 'POST'],
  },
  // Ping/Pong configuration
  // Socket.IO periodically pings clients to check if they're alive
  pingTimeout: 60000,   // Wait 60s for pong before disconnecting
  pingInterval: 25000,  // Send ping every 25s
});

// ═══════════════════════════════════════════════════════════
// STEP 2: WebSocket Authentication Middleware
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: WebSocket Authentication
// Unlike HTTP where you send headers with every request,
// WebSocket authenticates ONCE during the initial handshake.
//
// FLOW:
// 1. Client connects with token: io.connect(url, { auth: { token: "..." } })
// 2. Server middleware verifies token
// 3. If valid → Allow connection, store user data on socket
// 4. If invalid → Reject connection with error
// 5. All subsequent messages are authenticated (connection is persistent)
//
// INTERVIEW: "How do you authenticate WebSocket connections?"
// Answer: During the handshake using middleware. The token is sent
// either in the auth option (Socket.IO) or as a query parameter.
// ═══════════════════════════════════════════════════════════

io.use((socket, next) => {
  try {
    // Socket.IO auth comes from: io.connect(url, { auth: { token } })
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      // Allow unauthenticated connections (for public notifications)
      // In production, you might want to reject them
      socket.user = null;
      return next();
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;  // Attach user to socket for future use
    
    console.log(`🔐 Authenticated WebSocket: ${decoded.email}`);
    next();
  } catch (error) {
    console.log(`⚠️ WebSocket auth failed: ${error.message}`);
    // Still allow connection but without user data
    socket.user = null;
    next();
  }
});

// ═══════════════════════════════════════════════════════════
// STEP 3: Handle WebSocket Connections
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Socket.IO Events
// Communication happens through EVENTS (like DOM events in browser)
// 
// SERVER EMITS → CLIENT LISTENS:
//   server: socket.emit('notification', data)
//   client: socket.on('notification', (data) => { ... })
//
// CLIENT EMITS → SERVER LISTENS:
//   client: socket.emit('joinRoom', roomName)
//   server: socket.on('joinRoom', (roomName) => { ... })
//
// BROADCAST TO ALL:
//   io.emit('event', data)           → ALL connected clients
//   socket.broadcast.emit('event')   → All EXCEPT sender
//
// ROOMS:
//   socket.join('room1')             → Join a room
//   io.to('room1').emit('event')     → Send to room members only
//
// INTERVIEW: "What are Socket.IO rooms?"
// Rooms are a way to group sockets. You can send messages to
// all sockets in a room without sending to everyone.
// Example: A chat app where each chat group is a room.
// ═══════════════════════════════════════════════════════════

// Track online users
const onlineUsers = new Map(); // userId → socketId

io.on('connection', (socket) => {
  console.log(`🔌 New WebSocket connection: ${socket.id}`);

  // If user is authenticated, track them
  if (socket.user) {
    onlineUsers.set(socket.user.userId, socket.id);
    
    // Join a personal room (so we can send targeted notifications)
    socket.join(`user:${socket.user.userId}`);
    
    // Notify others that this user came online
    socket.broadcast.emit('user:online', {
      userId: socket.user.userId,
      email: socket.user.email,
    });

    console.log(`👤 User online: ${socket.user.email} (Total: ${onlineUsers.size})`);
  }

  // ─── CLIENT EVENTS ───

  // Client requests list of online users
  socket.on('getOnlineUsers', () => {
    socket.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });

  // Client joins a specific room (e.g., chat room, notification channel)
  socket.on('joinRoom', (roomName) => {
    socket.join(roomName);
    console.log(`📥 ${socket.user?.email || socket.id} joined room: ${roomName}`);
    socket.emit('roomJoined', { room: roomName, message: `Joined ${roomName}` });
  });

  // Client sends a direct message to another user
  socket.on('directMessage', ({ targetUserId, message }) => {
    io.to(`user:${targetUserId}`).emit('directMessage', {
      from: socket.user?.email || 'anonymous',
      message,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── DISCONNECT ───
  socket.on('disconnect', (reason) => {
    if (socket.user) {
      onlineUsers.delete(socket.user.userId);
      
      // Notify others
      socket.broadcast.emit('user:offline', {
        userId: socket.user.userId,
        email: socket.user.email,
      });

      console.log(`👋 User offline: ${socket.user.email} (Reason: ${reason})`);
    }
    console.log(`🔌 WebSocket disconnected: ${socket.id} (Reason: ${reason})`);
  });

  // ─── ERROR HANDLING ───
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error.message);
  });
});

// ═══════════════════════════════════════════════════════════
// STEP 4: Listen to RabbitMQ Events → Push to WebSocket
// ═══════════════════════════════════════════════════════════
//
// THIS IS THE KEY INTEGRATION!
// 
// FLOW:
// 1. User registers via Auth Service
// 2. Auth publishes "user.registered" to RabbitMQ
// 3. WebSocket Service receives the event (this section)
// 4. WebSocket Service pushes notification to connected clients
//
// This means connected users get REAL-TIME notifications
// about events happening in OTHER microservices!
//
// Without this, the client would need to keep polling:
//   Client: "Any new users?" → Server: "No" (every 5 seconds)
//
// With this:
//   Server pushes: "Hey! New user just registered!" (instant)
// ═══════════════════════════════════════════════════════════

async function setupRabbitMQConsumer() {
  try {
    await connectRabbitMQ();

    // Subscribe to ALL user events
    await subscribeToMessages('websocket_service_queue', 'user.*', (message, routingKey) => {
      console.log(`📨 WebSocket Service received [${routingKey}]:`, message);

      switch (routingKey) {
        case 'user.registered':
          // Broadcast to ALL connected clients
          io.emit('notification', {
            type: 'USER_REGISTERED',
            message: `New user registered: ${message.email}`,
            data: message,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'user.logged_in':
          // Notify specific user they're logged in successfully
          io.to(`user:${message.userId}`).emit('notification', {
            type: 'LOGIN_SUCCESS',
            message: 'You have logged in successfully',
            timestamp: new Date().toISOString(),
          });
          
          // Broadcast to others
          io.emit('user:online', {
            userId: message.userId,
            email: message.email,
          });
          break;

        case 'user.logged_out':
          io.emit('user:offline', {
            userId: message.userId,
          });
          break;

        default:
          console.log(`⚠️ Unhandled event: ${routingKey}`);
      }
    });

    console.log('✅ WebSocket Service consuming RabbitMQ events');
  } catch (error) {
    console.error('⚠️ RabbitMQ setup failed:', error.message);
    // Service can still work without RabbitMQ
    // It just won't push notifications from other services
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 5: Express Routes (Health Check)
// ═══════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    service: 'websocket-service',
    status: 'healthy',
    port: PORT,
    onlineUsers: onlineUsers.size,
    totalConnections: io.engine.clientsCount,
  });
});

// Simple test page for WebSocket
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WebSocket Service - Test Page</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
        h1 { color: #00d2ff; }
        #messages { height: 400px; overflow-y: auto; border: 1px solid #333; padding: 10px; margin: 10px 0; background: #16213e; border-radius: 8px; }
        .msg { padding: 5px 0; border-bottom: 1px solid #333; }
        .msg.notification { color: #00d2ff; }
        .msg.system { color: #888; }
        .msg.error { color: #ff4757; }
        input, button { padding: 10px; margin: 5px; border-radius: 4px; border: 1px solid #333; background: #16213e; color: #e0e0e0; }
        button { background: #00d2ff; color: #1a1a2e; cursor: pointer; font-weight: bold; }
        button:hover { background: #00a5cc; }
        .status { color: #2ecc71; font-weight: bold; }
        .status.offline { color: #ff4757; }
      </style>
    </head>
    <body>
      <h1>📡 WebSocket Service Test</h1>
      <p>Status: <span id="status" class="status offline">Disconnected</span></p>
      <p>Online Users: <span id="onlineCount">0</span></p>
      
      <div>
        <input type="text" id="token" placeholder="JWT Token (optional)" style="width: 400px;" />
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
      </div>
      
      <div id="messages"></div>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        let socket;
        const messagesDiv = document.getElementById('messages');
        
        function addMessage(text, type = '') {
          const div = document.createElement('div');
          div.className = 'msg ' + type;
          div.textContent = new Date().toLocaleTimeString() + ' - ' + text;
          messagesDiv.appendChild(div);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function connect() {
          const token = document.getElementById('token').value;
          
          socket = io({
            auth: { token: token || undefined }
          });
          
          socket.on('connect', () => {
            document.getElementById('status').textContent = 'Connected (' + socket.id + ')';
            document.getElementById('status').className = 'status';
            addMessage('Connected to WebSocket server', 'system');
          });
          
          socket.on('notification', (data) => {
            addMessage('NOTIFICATION: ' + data.message + ' [' + data.type + ']', 'notification');
          });
          
          socket.on('user:online', (data) => {
            addMessage('User came online: ' + data.email, 'system');
          });
          
          socket.on('user:offline', (data) => {
            addMessage('User went offline: ' + data.userId, 'system');
          });
          
          socket.on('disconnect', (reason) => {
            document.getElementById('status').textContent = 'Disconnected (' + reason + ')';
            document.getElementById('status').className = 'status offline';
            addMessage('Disconnected: ' + reason, 'error');
          });
          
          socket.on('connect_error', (error) => {
            addMessage('Connection error: ' + error.message, 'error');
          });
        }
        
        function disconnect() {
          if (socket) socket.disconnect();
        }
      </script>
    </body>
    </html>
  `);
});

// ═══════════════════════════════════════════════════════════
// STEP 6: Start Server
// ═══════════════════════════════════════════════════════════

server.listen(PORT, async () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║    📡 WEBSOCKET SERVICE RUNNING           ║
  ║                                           ║
  ║   HTTP:   http://localhost:${PORT}           ║
  ║   WS:     ws://localhost:${PORT}             ║
  ║   Health: http://localhost:${PORT}/health     ║
  ║   Test:   http://localhost:${PORT}/           ║
  ║                                           ║
  ║   Listening for RabbitMQ events...        ║
  ╚═══════════════════════════════════════════╝
  `);

  // Setup RabbitMQ consumer after server is ready
  await setupRabbitMQConsumer();
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket Service...');
  io.close();
  server.close();
  process.exit(0);
});
