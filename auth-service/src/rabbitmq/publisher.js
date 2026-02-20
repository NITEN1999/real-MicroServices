// ============================================================
// 🔐 AUTH SERVICE - RabbitMQ Event Publisher
// ============================================================
//
// CONCEPT: Event-Driven Architecture
// Instead of Auth Service directly calling Account Service
// (which creates tight coupling), Auth Service PUBLISHES EVENTS
// to RabbitMQ, and interested services pick them up.
//
// TIGHT COUPLING (BAD):
//   Auth Service → HTTP POST → Account Service
//   If Account Service is down → Auth registration fails!
//
// LOOSE COUPLING (GOOD):
//   Auth Service → Publish Event → RabbitMQ → Account Service picks up
//   If Account Service is down → Event waits in queue!
//
// MENTAL MODEL: Think of a NEWSPAPER
// - Auth Service is the journalist who WRITES articles
// - RabbitMQ is the newspaper company
// - Account Service is a SUBSCRIBER who reads  articles
// - Journalist doesn't care who reads it
// - Subscribers don't care who wrote it
//
// INTERVIEW: "What events does your Auth Service publish?"
// - user.registered → When a new user signs up
// - user.logged_in  → When a user logs in
// - user.logged_out → When a user logs out
// ============================================================

const { publishMessage } = require('../../../shared/rabbitmq');

// ----- EVENT TYPES -----
// Using constants prevents typos in event names
const AUTH_EVENTS = {
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_TOKEN_REFRESHED: 'user.token_refreshed',
};

/**
 * Publish: User Registered Event
 * 
 * WHAT HAPPENS AFTER THIS EVENT IS PUBLISHED:
 * 1. Account Service receives it → Creates user profile
 * 2. WebSocket Service receives it → Notifies admin dashboard
 * 3. (Future) Email Service would receive it → Sends welcome email
 * 4. (Future) Analytics Service → Records signup metrics
 * 
 * This is the BEAUTY of event-driven architecture:
 * Auth Service doesn't know or care about any of these!
 * It just says "hey, a user registered" and moves on.
 */
async function publishUserRegistered(user) {
  await publishMessage(AUTH_EVENTS.USER_REGISTERED, {
    userId: user.id || user._id,
    email: user.email,
    role: user.role,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish: User Logged In Event
 */
async function publishUserLoggedIn(user) {
  await publishMessage(AUTH_EVENTS.USER_LOGGED_IN, {
    userId: user.id || user._id,
    email: user.email,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Publish: User Logged Out Event
 */
async function publishUserLoggedOut(userId) {
  await publishMessage(AUTH_EVENTS.USER_LOGGED_OUT, {
    userId,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  AUTH_EVENTS,
  publishUserRegistered,
  publishUserLoggedIn,
  publishUserLoggedOut,
};
