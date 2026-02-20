// ============================================================
//  🚪 API GATEWAY - The Front Door of Your System
// ============================================================
//
// CONCEPT: API Gateway Pattern
// ----------------------------
// The API Gateway is the SINGLE ENTRY POINT for all client requests.
// It sits between the client and all your microservices.
//
// WHY DO WE NEED IT?
// 1. Clients don't need to know about internal services
// 2. Cross-cutting concerns (security, logging, rate limiting)
//    are handled in ONE place
// 3. Can transform requests/responses
// 4. Can aggregate responses from multiple services
//
// REAL COMPANIES USING THIS:
// - Netflix uses Zuul as API Gateway
// - Amazon uses API Gateway (AWS service)
// - Uber uses their own custom gateway
//
// MENTAL MODEL: 
// Think of a HOTEL RECEPTION DESK
// - Guest (Client) talks ONLY to reception
// - Reception knows which department handles what
// - Reception checks guest ID (authentication)
// - Reception logs all guest requests
// - Guest never directly goes to kitchen or housekeeping
//
// INTERVIEW TIP: API Gateway vs Reverse Proxy
// - Reverse Proxy: Just forwards requests (like Nginx)
// - API Gateway: Forwards + Authentication + Rate Limiting + 
//   Logging + Request Transformation + Response Aggregation
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 4000;

// ═══════════════════════════════════════════════════════════
// STEP 1: SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Middleware Pattern
// Middleware are functions that run BETWEEN receiving a request
// and sending a response. They form a "pipeline" or "chain".
//
//   Request → [Helmet] → [CORS] → [Morgan] → [RateLimit] → Route Handler → Response
//
// Each middleware can:
// 1. Execute code
// 2. Modify request/response objects
// 3. End the request-response cycle
// 4. Call next() to pass to next middleware
// ═══════════════════════════════════════════════════════════

// ----- HELMET: Security Headers -----
// Sets various HTTP headers to protect against common attacks
// X-Content-Type-Options, X-Frame-Options, etc.
// INTERVIEW: "What security headers do you know?"
app.use(helmet());

// ----- CORS: Cross-Origin Resource Sharing -----
// CONCEPT: Browsers block requests from different origins by default
// If your frontend is on localhost:3000 and API on localhost:4000,
// the browser will block it unless CORS is configured.
//
// INTERVIEW: "What is CORS and why is it needed?"
// Answer: It's a security feature in browsers that restricts
// web pages from making requests to a different domain.
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',  // In production, set specific origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ----- MORGAN: HTTP Request Logger -----
// Logs every request: method, URL, status, response time
// "dev" format: :method :url :status :response-time ms
// Example output: POST /graphql 200 45.231 ms
app.use(morgan('dev'));

// ----- JSON Body Parser -----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════
// STEP 2: RATE LIMITING
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Rate Limiting
// Prevents abuse by limiting how many requests a client can make.
//
// WHY?
// 1. Prevent DDoS attacks (flooding with requests)
// 2. Prevent brute force attacks (trying many passwords)
// 3. Fair usage (one user can't hog all resources)
// 4. Cost control (each request costs money in cloud)
//
// ALGORITHMS (INTERVIEW):
// 1. Fixed Window    - Count requests per time window (simple but bursty)
// 2. Sliding Window  - Smoother, considers partial windows
// 3. Token Bucket    - Tokens added at fixed rate, consumed per request
// 4. Leaky Bucket    - Requests processed at fixed rate, excess queued
//
// We use FIXED WINDOW here (library default)
// ═══════════════════════════════════════════════════════════

// General rate limit for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per 15 min per IP
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,      // Return rate limit info in headers
  legacyHeaders: false,
});

// Stricter rate limit for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,  // Only 20 login attempts per 15 min
  message: {
    error: 'Too many login attempts, please try again later.',
  },
});

app.use(generalLimiter);

// ═══════════════════════════════════════════════════════════
// STEP 3: HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Health Checks
// Every service should have a /health endpoint that returns
// its current status. This is used by:
// 1. Load balancers (to know if service is alive)
// 2. Kubernetes (to restart unhealthy pods)
// 3. Monitoring tools (to alert on failures)
//
// INTERVIEW: "How do you monitor microservices?"
// Answer: Health checks, centralized logging, distributed tracing
// ═══════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'api-gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════════════════════
// STEP 4: PROXY ROUTES
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Reverse Proxy
// The API Gateway acts as a REVERSE PROXY:
// - Client thinks it's talking to ONE server
// - Gateway forwards requests to the RIGHT service
// - Client never knows about internal services
//
// SYNTAX: createProxyMiddleware(options)
// - target: URL of the service to forward to
// - changeOrigin: change the origin header to match target
// - pathRewrite: modify the path before forwarding
//
// FLOW:
// Client → POST localhost:4000/graphql
//   Gateway receives it
//   Gateway forwards to → localhost:4001/graphql
//   GraphQL Gateway processes it
//   Response flows back through Gateway to Client
// ═══════════════════════════════════════════════════════════

// ----- GraphQL Gateway Proxy -----
// ALL /graphql requests go to the GraphQL Gateway
const graphqlProxy = createProxyMiddleware({
  target: process.env.GRAPHQL_GATEWAY_URL || 'http://localhost:4001',
  changeOrigin: true,
  pathRewrite: {
    '^/graphql': '/graphql',  // Keep the path as-is
  },
  // Add custom headers before forwarding
  onProxyReq: (proxyReq, req, res) => {
    // Forward the client's IP for logging in downstream services
    proxyReq.setHeader('X-Forwarded-For', req.ip);
    proxyReq.setHeader('X-Gateway-Secret', process.env.GATEWAY_SECRET || 'gateway-secret-key');
    
    console.log(`🔄 Proxying ${req.method} ${req.path} → GraphQL Gateway`);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(502).json({
      error: 'Service temporarily unavailable',
      message: 'The GraphQL Gateway is not responding',
    });
  },
});

app.use('/graphql', graphqlProxy);

// ----- WebSocket Proxy -----
// WebSocket connections are proxied to the WebSocket service
const wsProxy = createProxyMiddleware({
  target: process.env.WEBSOCKET_URL || 'http://localhost:5003',
  changeOrigin: true,
  ws: true,  // Enable WebSocket proxying
  pathRewrite: {
    '^/ws': '/socket.io',
  },
});

app.use('/ws', wsProxy);

// ═══════════════════════════════════════════════════════════
// STEP 5: ERROR HANDLING
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Centralized Error Handling
// Instead of handling errors in every route, we have ONE
// error handler at the end of the middleware chain.
//
// INTERVIEW: "How do you handle errors in microservices?"
// 1. Each service has its own error handling
// 2. Gateway catches service failures (502 errors)
// 3. Circuit breaker pattern for repeated failures
// 4. Dead letter queues for failed messages
// ═══════════════════════════════════════════════════════════

// 404 handler - No route matched
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: [
      'GET  /health     - Health check',
      'POST /graphql    - GraphQL API',
      'WS   /ws         - WebSocket connection',
    ],
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
  });
});

// ═══════════════════════════════════════════════════════════
// STEP 6: START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║        🚪 API GATEWAY RUNNING            ║
  ║                                           ║
  ║   URL:     http://localhost:${PORT}          ║
  ║   GraphQL: http://localhost:${PORT}/graphql  ║
  ║   Health:  http://localhost:${PORT}/health   ║
  ║   WS:      ws://localhost:${PORT}/ws         ║
  ║                                           ║
  ║   Proxying to:                            ║
  ║   → GraphQL Gateway: :4001               ║
  ║   → WebSocket:       :5003               ║
  ╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
