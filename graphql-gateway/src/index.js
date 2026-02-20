// ============================================================
// 🌐 GraphQL GATEWAY - Schema Stitching / Federation
// ============================================================
//
// CONCEPT: GraphQL Gateway (Schema Stitching)
// 
// THE BIG PICTURE:
// Each microservice has its OWN GraphQL schema.
// - Auth Service: login, register, me
// - Account Service: getProfile, updateProfile
// 
// The GraphQL Gateway COMBINES them into ONE unified schema.
// The client only talks to the Gateway and gets ONE schema
// with ALL operations available.
//
// TWO APPROACHES:
// 
// 1. SCHEMA STITCHING (What we use here)
//    - Gateway fetches schemas from each service
//    - Merges them into one
//    - Delegates queries to the right service
//    - Simpler to set up
//
// 2. APOLLO FEDERATION (Production approach)
//    - Each service declares which types it owns
//    - Gateway automatically composes schemas
//    - Better for large teams
//    - Supports references between services' types
//
// INTERVIEW: "Schema Stitching vs Federation"
// Stitching: Manual, gateway controls merging. Good for small systems.
// Federation: Automatic, services control their own types. Good for large systems.
//
// MENTAL MODEL: 
// Think of a SHOPPING MALL DIRECTORY
// Each store (service) has its own catalog (schema)
// The mall directory (gateway) combines all catalogs into one
// Customer looks at ONE directory and finds everything
//
// ============================================================
//
// WHY NOT JUST CALL SERVICES DIRECTLY?
// 
// WITHOUT Gateway:
//   Client → Auth Service  (port 5001) for login
//   Client → Account Service (port 5002) for profile
//   Client needs to know about EVERY service!
//
// WITH Gateway:
//   Client → Gateway (port 4001) for EVERYTHING
//   Client only knows ONE endpoint!
//   Gateway routes to the right service internally
// ============================================================

require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const fetch = require('node-fetch');
const { authenticateToken } = require('./middleware/auth');

const PORT = process.env.PORT || 4001;

// ═══════════════════════════════════════════════════════════
// SERVICE ENDPOINTS
// ═══════════════════════════════════════════════════════════
// These are the URLs where our microservices are running.
// In production, these would be service discovery URLs
// or Kubernetes service names like http://auth-service:5001

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001/graphql';
const ACCOUNT_SERVICE_URL = process.env.ACCOUNT_SERVICE_URL || 'http://localhost:5002/graphql';

// ═══════════════════════════════════════════════════════════
// COMBINED SCHEMA - Merging Auth + Account schemas
// ═══════════════════════════════════════════════════════════
//
// We define the UNIFIED schema here that includes types from
// ALL services. The resolvers then delegate to the right service.

const typeDefs = `
  # ═══════ Auth Service Types ═══════
  type User {
    id: ID!
    email: String!
    role: String!
    isActive: Boolean!
    lastLogin: String
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  type MessageResponse {
    success: Boolean!
    message: String!
  }

  input RegisterInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  # ═══════ Account Service Types ═══════
  type Address {
    street: String
    city: String
    state: String
    country: String
    zipCode: String
  }

  type Preferences {
    language: String
    theme: String
    notifications: Boolean
  }

  type Profile {
    id: ID!
    userId: String!
    email: String!
    firstName: String
    lastName: String
    fullName: String
    avatar: String
    bio: String
    phone: String
    address: Address
    preferences: Preferences
    isOnline: Boolean
    lastSeen: String
    createdAt: String!
    updatedAt: String!
  }

  type ProfileMessageResponse {
    success: Boolean!
    message: String!
  }

  input AddressInput {
    street: String
    city: String
    state: String
    country: String
    zipCode: String
  }

  input PreferencesInput {
    language: String
    theme: String
    notifications: Boolean
  }

  input UpdateProfileInput {
    firstName: String
    lastName: String
    avatar: String
    bio: String
    phone: String
    address: AddressInput
    preferences: PreferencesInput
  }

  # ═══════ UNIFIED Query - Combines BOTH services ═══════
  type Query {
    # Auth Service queries
    me: User
    verifyToken(token: String!): User

    # Account Service queries
    myProfile: Profile
    getProfile(userId: String!): Profile
    getAllProfiles(limit: Int, offset: Int): [Profile!]!
  }

  # ═══════ UNIFIED Mutation - Combines BOTH services ═══════
  type Mutation {
    # Auth Service mutations
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    logout: MessageResponse!

    # Account Service mutations
    updateProfile(input: UpdateProfileInput!): Profile!
    deleteProfile: ProfileMessageResponse!
  }
`;

// ═══════════════════════════════════════════════════════════
// DELEGATING RESOLVERS
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Delegation
// The Gateway doesn't have business logic. It DELEGATES
// (forwards) each query to the correct microservice.
//
// HOW?
// 1. Client sends GraphQL query to Gateway
// 2. Gateway identifies which service handles it
// 3. Gateway forwards the SAME query to that service
// 4. Service processes and returns the result
// 5. Gateway returns the result to the client
//
// This is done via HTTP fetch calls to each service's
// GraphQL endpoint.
// ═══════════════════════════════════════════════════════════

/**
 * Make a GraphQL request to a microservice
 * 
 * This function sends a GraphQL query to a service and returns the result.
 * It's like a "mini GraphQL client" built into the gateway.
 * 
 * @param {string} serviceUrl - URL of the service's GraphQL endpoint
 * @param {string} query - GraphQL query string
 * @param {object} variables - Query variables
 * @param {string} token - JWT token to forward
 * @returns {object} - The data from the service
 */
async function delegateToService(serviceUrl, query, variables = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Forward the JWT token to the downstream service
  // This way, the service can verify the user's identity
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data;
  } catch (error) {
    console.error(`❌ Failed to delegate to ${serviceUrl}:`, error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// RESOLVERS - Route to correct service
// ═══════════════════════════════════════════════════════════

const resolvers = {
  Query: {
    // --- Auth Service Queries ---
    me: async (_, __, context) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `query { me { id email role isActive lastLogin createdAt updatedAt } }`,
        {},
        context.token
      );
      return data.me;
    },

    verifyToken: async (_, { token }) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `query VerifyToken($token: String!) { verifyToken(token: $token) { id email role isActive } }`,
        { token }
      );
      return data.verifyToken;
    },

    // --- Account Service Queries ---
    myProfile: async (_, __, context) => {
      const data = await delegateToService(
        ACCOUNT_SERVICE_URL,
        `query { myProfile { id userId email firstName lastName fullName avatar bio phone address { street city state country zipCode } preferences { language theme notifications } isOnline lastSeen createdAt updatedAt } }`,
        {},
        context.token
      );
      return data.myProfile;
    },

    getProfile: async (_, { userId }, context) => {
      const data = await delegateToService(
        ACCOUNT_SERVICE_URL,
        `query GetProfile($userId: String!) { getProfile(userId: $userId) { id userId email firstName lastName fullName avatar bio isOnline lastSeen createdAt updatedAt } }`,
        { userId },
        context.token
      );
      return data.getProfile;
    },

    getAllProfiles: async (_, { limit, offset }, context) => {
      const data = await delegateToService(
        ACCOUNT_SERVICE_URL,
        `query GetAllProfiles($limit: Int, $offset: Int) { getAllProfiles(limit: $limit, offset: $offset) { id userId email firstName lastName fullName avatar isOnline createdAt } }`,
        { limit, offset },
        context.token
      );
      return data.getAllProfiles;
    },
  },

  Mutation: {
    // --- Auth Service Mutations ---
    register: async (_, { input }) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `mutation Register($input: RegisterInput!) { register(input: $input) { token refreshToken user { id email role isActive createdAt updatedAt } } }`,
        { input }
      );
      return data.register;
    },

    login: async (_, { input }) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `mutation Login($input: LoginInput!) { login(input: $input) { token refreshToken user { id email role isActive lastLogin createdAt updatedAt } } }`,
        { input }
      );
      return data.login;
    },

    refreshToken: async (_, { refreshToken }) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `mutation RefreshToken($refreshToken: String!) { refreshToken(refreshToken: $refreshToken) { token refreshToken user { id email role } } }`,
        { refreshToken }
      );
      return data.refreshToken;
    },

    logout: async (_, __, context) => {
      const data = await delegateToService(
        AUTH_SERVICE_URL,
        `mutation { logout { success message } }`,
        {},
        context.token
      );
      return data.logout;
    },

    // --- Account Service Mutations ---
    updateProfile: async (_, { input }, context) => {
      const data = await delegateToService(
        ACCOUNT_SERVICE_URL,
        `mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { id userId email firstName lastName fullName avatar bio phone address { street city state country zipCode } preferences { language theme notifications } createdAt updatedAt } }`,
        { input },
        context.token
      );
      return data.updateProfile;
    },

    deleteProfile: async (_, __, context) => {
      const data = await delegateToService(
        ACCOUNT_SERVICE_URL,
        `mutation { deleteProfile { success message } }`,
        {},
        context.token
      );
      return data.deleteProfile;
    },
  },
};

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

async function startGateway() {
  const app = express();

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const apolloServer = new ApolloServer({
    schema,
    // Enable Apollo Sandbox (interactive GraphQL playground)
    introspection: true,
    formatError: (error) => {
      console.error('❌ Gateway GraphQL Error:', error.message);
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
      };
    },
  });

  await apolloServer.start();

  app.use(express.json());
  app.use(cors());

  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // Authenticate user and pass token/user to resolvers
        const user = authenticateToken(req);
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : null;

        return { user, token };
      },
    })
  );

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      service: 'graphql-gateway',
      status: 'healthy',
      port: PORT,
      services: {
        auth: AUTH_SERVICE_URL,
        account: ACCOUNT_SERVICE_URL,
      },
    });
  });

  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║    🌐 GraphQL GATEWAY RUNNING             ║
    ║                                           ║
    ║   GraphQL: http://localhost:${PORT}/graphql  ║
    ║   Health:  http://localhost:${PORT}/health   ║
    ║                                           ║
    ║   Delegating to:                          ║
    ║   → Auth:    ${AUTH_SERVICE_URL}
    ║   → Account: ${ACCOUNT_SERVICE_URL}
    ╚═══════════════════════════════════════════╝
    `);
  });
}

startGateway().catch((err) => {
  console.error('💥 Failed to start GraphQL Gateway:', err);
  process.exit(1);
});
