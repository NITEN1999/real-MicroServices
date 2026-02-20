// ============================================================
// 👤 ACCOUNT SERVICE - GraphQL Schema
// ============================================================

const { gql } = require('graphql-tag');

const typeDefs = gql`
  # ═══════════════════════════════════════════════════
  # TYPES
  # ═══════════════════════════════════════════════════

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

  # ═══════════════════════════════════════════════════
  # INPUT TYPES
  # ═══════════════════════════════════════════════════

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

  # ═══════════════════════════════════════════════════
  # QUERIES
  # ═══════════════════════════════════════════════════

  type Query {
    # Get the profile of the currently authenticated user
    myProfile: Profile

    # Get any user's profile by their userId (admin or public)
    getProfile(userId: String!): Profile

    # Get all profiles (admin only)
    getAllProfiles(limit: Int, offset: Int): [Profile!]!
  }

  # ═══════════════════════════════════════════════════
  # MUTATIONS
  # ═══════════════════════════════════════════════════

  type Mutation {
    # Update the current user's profile
    updateProfile(input: UpdateProfileInput!): Profile!

    # Delete the current user's profile
    deleteProfile: ProfileMessageResponse!
  }
`;

module.exports = typeDefs;
