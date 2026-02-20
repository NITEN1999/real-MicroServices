// ============================================================
// 🔐 AUTH SERVICE - Main Entry Point
// ============================================================
//
// CONCEPT: Each microservice is a STANDALONE application
// It has its own:
// - Server (Express)
// - Database connection (MongoDB)
// - GraphQL schema
// - Message queue connection (RabbitMQ)
//
// This service ONLY handles authentication:
// - User registration
// - User login
// - JWT token management
// - Password hashing
//
// It does NOT handle:
// - User profiles (that's Account Service)
// - Notifications (that's WebSocket Service)
// - Routing (that's API Gateway)
// ============================================================

require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const typeDefs = require('./schema/typeDefs');
const resolvers = require('./resolvers/authResolvers');
const { connectRabbitMQ } = require('../../shared/rabbitmq');

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_db';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

async function startServer() {
  const app = express();

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Connect to MongoDB
  // ═══════════════════════════════════════════════════════════
  //
  // NOTICE: We connect to "auth_db" - our OWN database
  // Account Service will connect to "account_db"
  // This is the "Database per Service" pattern
  // ═══════════════════════════════════════════════════════════

  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Auth Service connected to MongoDB: ${MONGODB_URI}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Connect to RabbitMQ
  // ═══════════════════════════════════════════════════════════
  //
  // Auth Service is a PRODUCER (publisher)
  // It publishes events when users register, login, logout
  // ═══════════════════════════════════════════════════════════

  try {
    await connectRabbitMQ();
    console.log('✅ Auth Service connected to RabbitMQ');
  } catch (error) {
    console.error('⚠️ RabbitMQ connection failed (continuing without it):', error.message);
    // We don't exit - service can work without RabbitMQ
    // Events will just not be published
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Create Apollo GraphQL Server
  // ═══════════════════════════════════════════════════════════
  //
  // CONCEPT: Apollo Server
  // Apollo Server is the most popular GraphQL server for Node.js.
  // It takes our typeDefs (schema) and resolvers (logic) and
  // creates a fully functional GraphQL API.
  //
  // INTERVIEW: "What is Apollo Server?"
  // It's a production-ready GraphQL server that integrates
  // with Express, provides playground, caching, error handling,
  // and federation support.
  // ═══════════════════════════════════════════════════════════

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    // Format errors for cleaner client responses
    formatError: (error) => {
      console.error('❌ GraphQL Error:', error.message);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
      };
    },
  });

  // Start Apollo Server (must be started before using as middleware)
  await apolloServer.start();
  console.log('✅ Apollo Server started for Auth Service');

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Mount GraphQL on Express
  // ═══════════════════════════════════════════════════════════
  //
  // CONCEPT: Context Function
  // The context function runs for EVERY request.
  // It creates the "context" object that all resolvers can access.
  //
  // We use it to:
  // 1. Extract JWT token from Authorization header
  // 2. Verify the token
  // 3. Put the user data in context
  // 4. Resolvers can then access context.user
  //
  // FLOW:
  // Client sends: Authorization: Bearer eyJhbG...
  // Context extracts: "eyJhbG..."
  // Context verifies: jwt.verify(token, secret)
  // Context sets: context.user = { userId, email, role }
  // Resolver reads: context.user.userId
  // ═══════════════════════════════════════════════════════════

  app.use(express.json());
  app.use(cors());

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // Extract token from "Bearer <token>" header
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;

        let user = null;

        if (token) {
          try {
            // Verify and decode the token
            user = jwt.verify(token, JWT_SECRET);
          } catch (error) {
            // Token is invalid or expired - that's OK
            // The resolver will handle unauthorized access
            console.log('⚠️ Invalid token received');
          }
        }

        // Return context object accessible by all resolvers
        return { user, token };
      },
    })
  );

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      service: 'auth-service',
      status: 'healthy',
      port: PORT,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Start the server
  // ═══════════════════════════════════════════════════════════

  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║       🔐 AUTH SERVICE RUNNING             ║
    ║                                           ║
    ║   GraphQL: http://localhost:${PORT}/graphql  ║
    ║   Health:  http://localhost:${PORT}/health   ║
    ║   MongoDB: ${MONGODB_URI}                    
    ╚═══════════════════════════════════════════╝
    `);
  });
}

// ----- GRACEFUL SHUTDOWN -----
// CONCEPT: When the server is stopped (Ctrl+C), we want to
// close all connections properly instead of just dying.
// This prevents data corruption and resource leaks.
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Auth Service...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down Auth Service...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
startServer().catch((err) => {
  console.error('💥 Failed to start Auth Service:', err);
  process.exit(1);
});
