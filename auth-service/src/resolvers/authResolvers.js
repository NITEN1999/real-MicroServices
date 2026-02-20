// ============================================================
// 🔐 AUTH SERVICE - GraphQL Resolvers
// ============================================================
//
// CONCEPT: Resolvers
// Resolvers are the FUNCTIONS that handle GraphQL queries/mutations.
// They are where the ACTUAL LOGIC lives.
//
// MENTAL MODEL: Think of a restaurant
// - Schema (typeDefs) = The MENU (what's available)
// - Resolvers = The KITCHEN (how to make it)
//
// STRUCTURE:
// const resolvers = {
//   Query: {
//     fieldName: (parent, args, context, info) => { ... }
//   },
//   Mutation: {
//     fieldName: (parent, args, context, info) => { ... }
//   }
// }
//
// RESOLVER ARGUMENTS (INTERVIEW!):
// 1. parent  - Result of the parent resolver (for nested queries)
// 2. args    - Arguments passed by the client (e.g., { input: { email, password } })
// 3. context - Shared data for all resolvers (req, user, etc.)
// 4. info    - Information about the query (rarely used)
//
// INTERVIEW: "What are the 4 arguments of a GraphQL resolver?"
// Answer: parent, args, context, info
// ============================================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { publishUserRegistered, publishUserLoggedIn, publishUserLoggedOut } = require('../rabbitmq/publisher');

// ----- JWT Configuration -----
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Generate JWT Access Token
 * 
 * CONCEPT: JWT (JSON Web Token)
 * 
 * A JWT has 3 parts separated by dots:
 * xxxxx.yyyyy.zzzzz
 * 
 * 1. HEADER (xxxxx):
 *    { "alg": "HS256", "typ": "JWT" }
 *    Tells what algorithm was used to sign
 * 
 * 2. PAYLOAD (yyyyy):
 *    { "userId": "123", "role": "user", "iat": 1234567890, "exp": 1234571490 }
 *    Contains the claims (data). NOT encrypted, just Base64 encoded!
 *    Anyone can read it. So NEVER put sensitive data here.
 * 
 * 3. SIGNATURE (zzzzz):
 *    HMACSHA256(base64(header) + "." + base64(payload), SECRET_KEY)
 *    This proves the token hasn't been tampered with.
 * 
 * INTERVIEW: "Is JWT encrypted?"
 * Answer: NO! It's SIGNED, not encrypted. Anyone can READ the payload.
 * The signature only ensures it hasn't been MODIFIED.
 * If you need encryption, use JWE (JSON Web Encryption).
 * 
 * INTERVIEW: "Access Token vs Refresh Token"
 * Access Token:  Short-lived (15min - 1h), used for API requests
 * Refresh Token: Long-lived (7d - 30d), used ONLY to get new access tokens
 * 
 * WHY two tokens?
 * If access token is stolen → attacker has access for only 1 hour
 * Refresh token is stored more securely and rotated on use
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id || user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate Refresh Token
 * Longer expiration, used to get new access tokens
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user._id || user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

// ═══════════════════════════════════════════════════════════
// RESOLVERS
// ═══════════════════════════════════════════════════════════

const authResolvers = {
  // ----- QUERIES (Read operations) -----
  Query: {
    /**
     * ME - Get the currently authenticated user
     * 
     * HOW IT WORKS:
     * 1. Client sends: Authorization: Bearer <JWT_TOKEN>
     * 2. GraphQL Gateway extracts user from token → puts in context
     * 3. This resolver reads context.user
     * 4. Fetches full user data from database
     * 
     * EXAMPLE GraphQL Query:
     * query {
     *   me {
     *     id
     *     email
     *     role
     *   }
     * }
     */
    me: async (_, __, context) => {
      // context.user is set by the auth middleware in GraphQL Gateway
      if (!context.user) {
        throw new Error('Authentication required. Please login first.');
      }

      const user = await User.findById(context.user.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    },

    /**
     * VERIFY TOKEN - Check if a token is valid
     * Used internally by other services to verify authentication
     * 
     * CONCEPT: Service-to-Service Authentication
     * When Account Service receives a request, it needs to know
     * if the user is authenticated. It can call this resolver
     * to verify the token.
     */
    verifyToken: async (_, { token }) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
          throw new Error('Invalid token or user inactive');
        }
        return user;
      } catch (error) {
        throw new Error('Invalid or expired token');
      }
    },
  },

  // ----- MUTATIONS (Write operations) -----
  Mutation: {
    /**
     * REGISTER - Create a new user account
     * 
     * FLOW:
     * 1. Client sends email + password
     * 2. Validate email isn't already taken
     * 3. Create user (password is auto-hashed by Mongoose pre-save hook)
     * 4. Generate JWT tokens
     * 5. Publish "user.registered" event to RabbitMQ
     * 6. Return tokens + user data
     * 
     * EXAMPLE GraphQL Mutation:
     * mutation {
     *   register(input: { email: "test@test.com", password: "password123" }) {
     *     token
     *     user {
     *       id
     *       email
     *     }
     *   }
     * }
     */
    register: async (_, { input }) => {
      const { email, password } = input;

      // Step 1: Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('An account with this email already exists');
      }

      // Step 2: Create user (password hashed automatically by pre-save hook)
      const user = await User.create({
        email,
        password,
      });

      // Step 3: Generate tokens
      const token = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Step 4: Save refresh token in database
      user.refreshToken = refreshToken;
      await user.save();

      // Step 5: Publish event to RabbitMQ
      // This is ASYNCHRONOUS - we don't wait for other services
      // We use try-catch so registration succeeds even if RabbitMQ is down
      try {
        await publishUserRegistered(user);
      } catch (error) {
        console.error('⚠️ Failed to publish registration event:', error.message);
        // Don't fail registration if event publishing fails
        // The account service will eventually catch up
      }

      console.log(`✅ User registered: ${email}`);

      return {
        token,
        refreshToken,
        user,
      };
    },

    /**
     * LOGIN - Authenticate a user
     * 
     * FLOW:
     * 1. Find user by email
     * 2. Compare password with hash
     * 3. Generate new tokens
     * 4. Update last login time
     * 5. Publish "user.logged_in" event
     * 6. Return tokens + user data
     * 
     * SECURITY NOTES:
     * - We use generic error messages ("Invalid credentials")
     *   instead of "Email not found" or "Wrong password"
     *   This prevents attackers from knowing which emails exist
     */
    login: async (_, { input }) => {
      const { email, password } = input;

      // Step 1: Find user (explicitly include password field)
      // Remember: password has select: false in the schema
      const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

      if (!user) {
        throw new Error('Invalid credentials'); // Generic message on purpose
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated. Please contact support.');
      }

      // Step 2: Compare passwords
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials'); // Same generic message
      }

      // Step 3: Generate tokens
      const token = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Step 4: Update user
      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      // Step 5: Publish event
      try {
        await publishUserLoggedIn(user);
      } catch (error) {
        console.error('⚠️ Failed to publish login event:', error.message);
      }

      console.log(`✅ User logged in: ${email}`);

      return {
        token,
        refreshToken,
        user,
      };
    },

    /**
     * REFRESH TOKEN - Get a new access token
     * 
     * WHY?
     * Access tokens expire after 1 hour. Instead of making
     * the user login again, the client can use the refresh token
     * to get a new access token silently.
     * 
     * FLOW:
     * 1. Client sends refresh token
     * 2. Verify refresh token is valid
     * 3. Check it matches the one in database
     * 4. Generate new pair of tokens
     * 5. Return new tokens
     * 
     * INTERVIEW: "Token Rotation"
     * When a refresh token is used, we issue a NEW refresh token
     * and invalidate the old one. This limits the damage if a
     * refresh token is stolen.
     */
    refreshToken: async (_, { refreshToken: token }) => {
      try {
        // Step 1: Verify the refresh token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Step 2: Find user and verify stored refresh token matches
        const user = await User.findById(decoded.userId).select('+refreshToken');
        if (!user || user.refreshToken !== token) {
          throw new Error('Invalid refresh token');
        }

        // Step 3: Generate new tokens (token rotation)
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        // Step 4: Save new refresh token
        user.refreshToken = newRefreshToken;
        await user.save();

        return {
          token: newAccessToken,
          refreshToken: newRefreshToken,
          user,
        };
      } catch (error) {
        throw new Error('Invalid or expired refresh token. Please login again.');
      }
    },

    /**
     * LOGOUT - Invalidate the refresh token
     * 
     * CONCEPT: Token Invalidation
     * Since JWTs are stateless, you can't truly "invalidate" an
     * access token. It will remain valid until it expires.
     * 
     * What we CAN do:
     * 1. Remove refresh token from database (so no new access tokens)
     * 2. (Advanced) Use a token blacklist in Redis
     * 3. (Advanced) Use short access token expiry (5-15 min)
     */
    logout: async (_, __, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Remove refresh token from database
      await User.findByIdAndUpdate(context.user.userId, {
        refreshToken: null,
      });

      try {
        await publishUserLoggedOut(context.user.userId);
      } catch (error) {
        console.error('⚠️ Failed to publish logout event:', error.message);
      }

      return {
        success: true,
        message: 'Logged out successfully',
      };
    },
  },
};

module.exports = authResolvers;
