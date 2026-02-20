// ============================================================
// 👤 ACCOUNT SERVICE - RabbitMQ Event Consumer
// ============================================================
//
// CONCEPT: Event Consumer / Subscriber
// This is the RECEIVING end of the event-driven architecture.
// 
// Auth Service PUBLISHES:
//   "user.registered" → { userId, email }
//
// Account Service SUBSCRIBES to "user.*" and:
//   1. Receives the event
//   2. Automatically creates a profile for the new user
//   3. No HTTP call needed from Auth to Account!
//
// INTERVIEW: "How do microservices stay in sync?"
// Answer: Through EVENT-DRIVEN communication.
// When something happens in Service A, it publishes an event.
// Service B listens for that event and updates its own data.
// This is called EVENTUAL CONSISTENCY.
//
// CONCEPT: Eventual Consistency
// In monolith: All data is consistent instantly (SQL transaction)
// In microservices: Data might be inconsistent for a brief moment
//   but it will EVENTUALLY become consistent.
//
// Example:
// 1. User registers → Auth creates user in auth_db ✅
// 2. Event published → "user.registered"
// 3. SHORT DELAY (milliseconds to seconds)
// 4. Account Service creates profile in account_db ✅
// During steps 2-3, auth_db has the user but account_db doesn't
// This is "eventually consistent" and is NORMAL in microservices
// ============================================================

const { subscribeToMessages } = require('../../../shared/rabbitmq');
const Profile = require('../models/Profile');

/**
 * Handle incoming events from RabbitMQ
 * 
 * This is like a "router" for events.
 * Based on the routing key, we call different handler functions.
 */
async function handleEvent(message, routingKey) {
  console.log(`📨 Account Service received event [${routingKey}]:`, message);

  switch (routingKey) {
    case 'user.registered':
      await handleUserRegistered(message);
      break;
    case 'user.logged_in':
      await handleUserLoggedIn(message);
      break;
    case 'user.logged_out':
      await handleUserLoggedOut(message);
      break;
    default:
      console.log(`⚠️ Unknown event type: ${routingKey}`);
  }
}

/**
 * Handle: User Registered Event
 * Creates a new profile when a user registers via Auth Service
 * 
 * THIS IS THE KEY FLOW:
 * 1. User calls register mutation → Auth Service handles it
 * 2. Auth Service publishes "user.registered" event
 * 3. RabbitMQ delivers event to this queue
 * 4. This function creates a profile in account_db
 * 
 * The user's profile is created AUTOMATICALLY!
 * No need for a second API call from the frontend.
 */
async function handleUserRegistered(message) {
  try {
    const { userId, email, role } = message;

    // Check if profile already exists (idempotency)
    // CONCEPT: Idempotency
    // An operation is idempotent if doing it multiple times
    // has the same result as doing it once.
    // 
    // WHY? Messages can be delivered more than once.
    // If RabbitMQ re-delivers a message, we shouldn't
    // create a duplicate profile!
    //
    // INTERVIEW: "What is idempotency and why is it important?"
    const existingProfile = await Profile.findOne({ userId });
    if (existingProfile) {
      console.log(`⚠️ Profile already exists for user ${userId}`);
      return;
    }

    // Create a new profile with default values
    const profile = await Profile.create({
      userId,
      email,
      firstName: '',
      lastName: '',
    });

    console.log(`✅ Profile created for user ${userId}: ${email}`);
  } catch (error) {
    console.error('❌ Failed to create profile:', error.message);
    // In production, you might:
    // 1. Send to a Dead Letter Queue (DLQ)
    // 2. Retry with exponential backoff
    // 3. Alert the team
  }
}

/**
 * Handle: User Logged In Event
 * Updates the user's online status
 */
async function handleUserLoggedIn(message) {
  try {
    const { userId } = message;
    await Profile.findOneAndUpdate(
      { userId },
      { isOnline: true, lastSeen: new Date() }
    );
    console.log(`✅ User ${userId} marked as online`);
  } catch (error) {
    console.error('❌ Failed to update online status:', error.message);
  }
}

/**
 * Handle: User Logged Out Event
 * Updates the user's offline status
 */
async function handleUserLoggedOut(message) {
  try {
    const { userId } = message;
    await Profile.findOneAndUpdate(
      { userId },
      { isOnline: false, lastSeen: new Date() }
    );
    console.log(`✅ User ${userId} marked as offline`);
  } catch (error) {
    console.error('❌ Failed to update offline status:', error.message);
  }
}

/**
 * Start consuming events from RabbitMQ
 * 
 * ROUTING PATTERN: "user.*"
 * This matches: user.registered, user.logged_in, user.logged_out
 * But NOT: order.created, payment.processed
 * 
 * QUEUE NAME: "account_service_queue"
 * Each service has its own queue. This ensures:
 * 1. Messages are delivered to each service independently
 * 2. If this service goes down, messages wait in ITS queue
 * 3. Other services' queues are unaffected
 */
async function startConsuming() {
  try {
    await subscribeToMessages('account_service_queue', 'user.*', handleEvent);
    console.log('✅ Account Service consuming events from RabbitMQ');
  } catch (error) {
    console.error('❌ Failed to start consuming:', error.message);
  }
}

module.exports = { startConsuming };
