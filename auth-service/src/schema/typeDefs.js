// ============================================================
// 🔐 AUTH SERVICE - GraphQL Schema (Type Definitions)
// ============================================================
//
// CONCEPT: GraphQL Schema Definition Language (SDL)
// SDL is how you define the "contract" of your API.
// It tells clients EXACTLY what data they can ask for.
//
// MENTAL MODEL: Think of GraphQL Schema as a RESTAURANT MENU
// - The menu lists everything available
// - You pick exactly what you want
// - Kitchen (resolver) prepares only what you ordered
//
// KEY CONCEPTS:
// 1. TYPE     = Shape of data (like a class/interface)
// 2. QUERY    = Read operations (GET in REST)
// 3. MUTATION = Write operations (POST/PUT/DELETE in REST)
// 4. INPUT    = Shape of input data for mutations
// 5. !        = Required (non-nullable)
// 6. [Type]   = Array of Type
//
// INTERVIEW: "GraphQL Types"
// - Scalar Types: String, Int, Float, Boolean, ID
// - Object Types: Custom types (User, AuthPayload)
// - Input Types: For mutation arguments
// - Enum Types: Fixed set of values
// ============================================================

const { gql } = require('graphql-tag');

const typeDefs = gql`
  # ═══════════════════════════════════════════════════
  # CUSTOM TYPES - Define the shape of our data
  # ═══════════════════════════════════════════════════

  # User type - What a user looks like in our system
  # Note: NO password field! We never expose passwords via API
  type User {
    id: ID!           # ! means required (never null)
    email: String!
    role: String!
    isActive: Boolean!
    lastLogin: String
    createdAt: String!
    updatedAt: String!
  }

  # AuthPayload - Returned after login/register
  # Contains the JWT token + user data
  type AuthPayload {
    token: String!        # JWT access token
    refreshToken: String! # Refresh token (for getting new access tokens)
    user: User!           # The authenticated user's data
  }

  # Simple message response
  type MessageResponse {
    success: Boolean!
    message: String!
  }

  # ═══════════════════════════════════════════════════
  # INPUT TYPES - Shape of data sent BY the client
  # ═══════════════════════════════════════════════════
  #
  # WHY Input Types?
  # Instead of listing every argument in the mutation,
  # we group them into an Input type. Cleaner syntax.
  #
  # WITHOUT Input Type:
  #   register(email: String!, password: String!, role: String): User
  #
  # WITH Input Type:
  #   register(input: RegisterInput!): User
  #
  # Benefits: Easier to extend, cleaner code, reusable

  input RegisterInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  # ═══════════════════════════════════════════════════
  # QUERIES - Read operations (like GET requests)
  # ═══════════════════════════════════════════════════
  #
  # CONCEPT: Query vs Mutation
  # - Query = "I want to READ data" (safe, no side effects)
  # - Mutation = "I want to CHANGE data" (creates, updates, deletes)
  #
  # INTERVIEW: "Are GraphQL queries and mutations technically different?"
  # Answer: Technically, both can do anything. But by CONVENTION:
  # - Queries should only READ
  # - Mutations should WRITE
  # The key difference: Mutations run SEQUENTIALLY, Queries run in PARALLEL

  type Query {
    # Get the currently authenticated user's info
    # Requires: Valid JWT token in Authorization header
    me: User

    # Verify if a token is valid (used by other services)
    verifyToken(token: String!): User
  }

  # ═══════════════════════════════════════════════════
  # MUTATIONS - Write operations (like POST/PUT/DELETE)
  # ═══════════════════════════════════════════════════

  type Mutation {
    # Register a new user
    # Returns: AuthPayload (token + user)
    register(input: RegisterInput!): AuthPayload!

    # Login with email + password
    # Returns: AuthPayload (token + user)
    login(input: LoginInput!): AuthPayload!

    # Get a new access token using refresh token
    refreshToken(refreshToken: String!): AuthPayload!

    # Logout (invalidate refresh token)
    logout: MessageResponse!
  }
`;

module.exports = typeDefs;
