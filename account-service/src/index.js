// ============================================================
// 👤 ACCOUNT SERVICE - Main Entry Point
// ============================================================
//
// This service manages user PROFILES, not authentication.
// It has its own:
// - MongoDB database (account_db)
// - GraphQL schema
// - RabbitMQ consumer (listens for auth events)
// ============================================================

require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const typeDefs = require('./schema/typeDefs');
const resolvers = require('./resolvers/accountResolvers');
const { startConsuming } = require('./rabbitmq/consumer');
const { connectRabbitMQ } = require('../../shared/rabbitmq');

const PORT = process.env.PORT || 5002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/account_db';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

async function startServer() {
  const app = express();

  // Connect to MongoDB (account_db - separate from auth_db!)
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Account Service connected to MongoDB: ${MONGODB_URI}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }

  // Connect to RabbitMQ and start consuming events
  try {
    await connectRabbitMQ();
    await startConsuming();
    console.log('✅ Account Service connected to RabbitMQ and consuming events');
  } catch (error) {
    console.error('⚠️ RabbitMQ connection failed:', error.message);
  }

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (error) => {
      console.error('❌ GraphQL Error:', error.message);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
      };
    },
  });

  await apolloServer.start();

  app.use(express.json());
  app.use(cors());

  // Mount GraphQL with auth context
  // SAME JWT verification as Auth Service
  // The token was issued by Auth Service, but ANY service can verify it
  // because they all share the same JWT_SECRET
  //
  // INTERVIEW: "How do you share JWT across microservices?"
  // Answer: All services use the same JWT secret to verify tokens.
  // In production, use asymmetric keys (public/private) where
  // Auth Service signs with private key and others verify with public key.
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;

        let user = null;
        if (token) {
          try {
            user = jwt.verify(token, JWT_SECRET);
          } catch (error) {
            console.log('⚠️ Invalid token received');
          }
        }

        return { user, token };
      },
    })
  );

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      service: 'account-service',
      status: 'healthy',
      port: PORT,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║     👤 ACCOUNT SERVICE RUNNING            ║
    ║                                           ║
    ║   GraphQL: http://localhost:${PORT}/graphql  ║
    ║   Health:  http://localhost:${PORT}/health   ║
    ║   MongoDB: ${MONGODB_URI}
    ╚═══════════════════════════════════════════╝
    `);
  });
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Account Service...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer().catch((err) => {
  console.error('💥 Failed to start Account Service:', err);
  process.exit(1);
});
