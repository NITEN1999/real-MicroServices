// ============================================================
// 🔑 GraphQL GATEWAY - Auth Middleware
// ============================================================
//
// CONCEPT: Authentication Middleware in GraphQL
// 
// Unlike REST where each endpoint can have its own auth middleware,
// in GraphQL there's ONE endpoint (/graphql). So we verify auth
// in the CONTEXT function and let resolvers decide if they need it.
//
// TWO APPROACHES:
// 1. Context-level: Verify token in context, pass user to resolvers
//    (This is what we do - simpler, resolvers check context.user)
//
// 2. Directive-level: Create @auth directive on schema fields
//    (More advanced, declarative, used in production)
//
// Example of directive approach:
//   type Query {
//     me: User @auth
//     publicPosts: [Post]  # No @auth = public
//   }
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

/**
 * Extract and verify JWT from the Authorization header
 * 
 * @param {Object} req - Express request object
 * @returns {Object|null} - Decoded user data or null
 * 
 * FLOW:
 * 1. Client sends: Authorization: Bearer eyJhbGciOiJ...
 * 2. We extract: eyJhbGciOiJ...
 * 3. We verify: jwt.verify(token, secret) → { userId, email, role }
 * 4. We return: the decoded user object
 * 
 * If anything fails (no header, invalid token, expired), we return null
 * We DON'T throw an error here because some queries are public
 */
function authenticateToken(req) {
  try {
    const authHeader = req.headers.authorization || '';
    
    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    
    if (!token) {
      return null;
    }

    // jwt.verify both decodes AND validates the token
    // It checks:
    // 1. Is the signature valid? (not tampered with)
    // 2. Is the token expired? (exp claim)
    // 3. Is the token not yet valid? (nbf claim, if present)
    const decoded = jwt.verify(token, JWT_SECRET);
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('⚠️ Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      console.log('⚠️ Invalid token');
    }
    return null;
  }
}

module.exports = { authenticateToken };
