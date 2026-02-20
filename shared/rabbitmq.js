// ============================================================
// 📬 SHARED RABBITMQ CONNECTION UTILITY
// ============================================================
//
// CONCEPT: This is a shared utility that ALL services use to
// connect to RabbitMQ. Instead of writing connection code in
// every service, we write it ONCE here.
//
// MENTAL MODEL: Think of this as the "postal service SDK"
// Every department (service) uses the same postal system,
// so they all use this same connection code.
//
// INTERVIEW TIP: "Shared libraries" in microservices is a
// controversial topic. Too much sharing = coupling.
// Only share INFRASTRUCTURE code (like this), never BUSINESS logic.
// ============================================================

const amqp = require('amqplib');

// ----- CONFIGURATION -----
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// ----- CONCEPT: Exchange -----
// An EXCHANGE is like a post office sorting center.
// Messages go to the exchange first, then it routes them
// to the right queue(s) based on the routing key.
//
// Types of exchanges:
// 1. DIRECT  - Routes to queue with EXACT matching routing key
// 2. TOPIC   - Routes based on pattern matching (*.user.#)
// 3. FANOUT  - Routes to ALL bound queues (broadcast)
// 4. HEADERS - Routes based on message headers
//
// We use TOPIC exchange for flexibility
const EXCHANGE_NAME = 'microservices_events';
const EXCHANGE_TYPE = 'topic';

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ and create a channel
 * 
 * CONCEPT: Connection vs Channel
 * - CONNECTION = TCP connection to RabbitMQ server (heavy, create once)
 * - CHANNEL = Lightweight "virtual connection" within a connection
 * 
 * ANALOGY: 
 * - Connection = Phone line to the post office
 * - Channel = Different conversations on that phone line
 * 
 * Best Practice: One connection per service, multiple channels if needed
 */
async function connectRabbitMQ() {
  try {
    // Step 1: Create connection
    connection = await amqp.connect(RABBITMQ_URL);
    console.log('✅ Connected to RabbitMQ');

    // Step 2: Create channel
    channel = await connection.createChannel();
    console.log('✅ RabbitMQ Channel created');

    // Step 3: Assert exchange exists (create if not)
    // "assert" means "make sure this exists, create if it doesn't"
    // { durable: true } means the exchange survives RabbitMQ restart
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
    console.log(`✅ Exchange "${EXCHANGE_NAME}" ready`);

    // Handle connection errors
    connection.on('error', (err) => {
      console.error('❌ RabbitMQ connection error:', err.message);
    });

    connection.on('close', () => {
      console.log('⚠️ RabbitMQ connection closed, reconnecting...');
      setTimeout(connectRabbitMQ, 5000); // Retry after 5 seconds
    });

    return channel;
  } catch (error) {
    console.error('❌ Failed to connect to RabbitMQ:', error.message);
    console.log('⏳ Retrying in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return connectRabbitMQ(); // Recursive retry
  }
}

/**
 * PUBLISH a message to an exchange with a routing key
 * 
 * CONCEPT: Publishing
 * The PRODUCER sends a message to the EXCHANGE with a ROUTING KEY.
 * The exchange then routes the message to the appropriate QUEUE(s).
 * 
 * EXAMPLE:
 * publishMessage('user.registered', { userId: '123', email: 'test@test.com' })
 * 
 * This sends a message with:
 * - Routing Key: "user.registered"
 * - Message Body: { userId: '123', email: 'test@test.com' }
 * 
 * Any service that has a queue bound with routing key "user.registered"
 * or "user.*" or "#" will receive this message.
 */
async function publishMessage(routingKey, message) {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }

    // Convert object to Buffer (RabbitMQ sends binary data)
    const messageBuffer = Buffer.from(JSON.stringify(message));

    // Publish to exchange
    channel.publish(
      EXCHANGE_NAME,  // Which exchange to publish to
      routingKey,     // Routing key (like an address label)
      messageBuffer,  // The actual message (as a Buffer)
      {
        persistent: true,           // Message survives RabbitMQ restart
        contentType: 'application/json',
        timestamp: Date.now(),
      }
    );

    console.log(`📤 Published [${routingKey}]:`, message);
  } catch (error) {
    console.error('❌ Failed to publish message:', error.message);
    throw error;
  }
}

/**
 * SUBSCRIBE to messages with a specific routing pattern
 * 
 * CONCEPT: Consuming/Subscribing
 * A CONSUMER creates a QUEUE, binds it to the EXCHANGE with a
 * routing pattern, and listens for messages.
 * 
 * EXAMPLE:
 * subscribeToMessages('account_service_queue', 'user.*', (msg) => {
 *   console.log('Got message:', msg);
 * });
 * 
 * ROUTING PATTERNS:
 * - "user.registered" → Exact match only
 * - "user.*"          → Matches user.registered, user.deleted, etc.
 * - "#"               → Matches EVERYTHING
 * - "*.registered"    → Matches user.registered, admin.registered, etc.
 * 
 * INTERVIEW TIP: Know the difference between * and #
 * - * matches exactly ONE word
 * - # matches ZERO or MORE words
 */
async function subscribeToMessages(queueName, routingPattern, callback) {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }

    // Step 1: Assert queue exists
    // { durable: true } = queue survives restart
    // { exclusive: false } = multiple consumers can connect
    await channel.assertQueue(queueName, { durable: true });

    // Step 2: Bind queue to exchange with routing pattern
    // This tells the exchange: "Send messages matching this pattern to this queue"
    await channel.bindQueue(queueName, EXCHANGE_NAME, routingPattern);

    console.log(`📥 Subscribed to [${routingPattern}] via queue "${queueName}"`);

    // Step 3: Consume messages from the queue
    channel.consume(queueName, (msg) => {
      if (msg) {
        // Parse the message content
        const content = JSON.parse(msg.content.toString());
        const routingKey = msg.fields.routingKey;

        console.log(`📨 Received [${routingKey}]:`, content);

        // Call the callback function with the message data
        callback(content, routingKey);

        // CONCEPT: Acknowledgment (ACK)
        // After processing, we tell RabbitMQ "I'm done with this message"
        // If we DON'T ack, RabbitMQ will re-deliver the message
        // This ensures no messages are lost if a service crashes mid-processing
        //
        // INTERVIEW TIP: Understand ACK vs NACK vs REJECT
        // ACK    = "Done! Remove from queue"
        // NACK   = "Failed! Re-queue it" (can also discard)
        // REJECT = "Failed! Don't re-queue"
        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error('❌ Failed to subscribe:', error.message);
    throw error;
  }
}

/**
 * Close the RabbitMQ connection gracefully
 */
async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('🔌 RabbitMQ connection closed');
  } catch (error) {
    console.error('❌ Error closing RabbitMQ:', error.message);
  }
}

module.exports = {
  connectRabbitMQ,
  publishMessage,
  subscribeToMessages,
  closeConnection,
  EXCHANGE_NAME,
};
