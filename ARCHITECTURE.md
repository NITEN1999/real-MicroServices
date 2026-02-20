# 🏗️ Real-World Microservice Architecture in Node.js

## Complete Learning Guide + Interview Preparation

---

## 📖 TABLE OF CONTENTS

1. [What Are Microservices?](#what-are-microservices)
2. [Monolith vs Microservices](#monolith-vs-microservices)
3. [Architecture Overview](#architecture-overview)
4. [Component Breakdown](#component-breakdown)
5. [Concepts vs Syntax](#concepts-vs-syntax)
6. [Mental Model](#mental-model)
7. [Interview Topics](#interview-topics)
8. [How to Run](#how-to-run)

---

## 🧠 WHAT ARE MICROSERVICES?

### Simple Words:
Imagine a **restaurant**:
- **Monolith** = One chef does EVERYTHING (takes orders, cooks, serves, bills)
- **Microservices** = Separate people for each job (waiter, chef, cashier, cleaner)

Each person (service) does ONE job well and communicates with others through a system (message queue).

### Technical Definition:
Microservices is an architectural style where an application is built as a collection of **small, independent services** that:
- Run in their own process
- Have their own database
- Communicate over the network (HTTP, GraphQL, Messages)
- Can be deployed independently

---

## 🔄 MONOLITH vs MICROSERVICES

```
MONOLITH (Single App)                    MICROSERVICES (Multiple Apps)
┌─────────────────────┐                  ┌──────────┐  ┌──────────┐
│  Auth Logic         │                  │ Auth     │  │ Account  │
│  Account Logic      │      VS          │ Service  │  │ Service  │
│  Payment Logic      │                  └──────────┘  └──────────┘
│  Notification Logic │                  ┌──────────┐  ┌──────────┐
│  ALL IN ONE         │                  │ Payment  │  │ Notif    │
│  ONE DATABASE       │                  │ Service  │  │ Service  │
└─────────────────────┘                  └──────────┘  └──────────┘
                                         Each has its OWN database!
```

| Feature         | Monolith               | Microservices              |
|-----------------|------------------------|----------------------------|
| Deployment      | Deploy everything      | Deploy individually        |
| Scaling         | Scale everything       | Scale only what's needed   |
| Team            | One big team           | Small teams per service    |
| Database        | One shared database    | Database per service       |
| Failure         | One bug breaks all     | One service fails, rest OK |
| Complexity      | Simple to start        | Complex from start         |
| Communication   | Function calls         | Network calls (HTTP/MQ)    |

---

## 🏛️ ARCHITECTURE OVERVIEW

```
CLIENT (Browser/Mobile App)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                   API GATEWAY (Port 4000)            │
│                                                      │
│  WHAT IT DOES:                                       │
│  • Rate Limiting (prevent spam)                      │
│  • Request Logging (track all requests)              │
│  • CORS (allow cross-origin requests)                │
│  • Helmet (security headers)                         │
│  • Routes traffic to GraphQL Gateway                 │
│                                                      │
│  ANALOGY: Security guard at building entrance        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              GraphQL GATEWAY (Port 4001)             │
│                                                      │
│  WHAT IT DOES:                                       │
│  • Combines ALL service schemas into ONE             │
│  • Client asks ONE endpoint for everything           │
│  • Schema stitching / Federation                     │
│  • Auth middleware (verify JWT tokens)               │
│                                                      │
│  ANALOGY: Reception desk - one place to ask          │
│  for anything, they route to right department        │
└────────────┬──────────────────────┬─────────────────┘
             │                      │
             ▼                      ▼
┌────────────────────┐   ┌────────────────────┐
│  AUTH SERVICE       │   │  ACCOUNT SERVICE   │
│  (Port 5001)        │   │  (Port 5002)       │
│                     │   │                    │
│  • Register user    │   │  • Get profile     │
│  • Login user       │   │  • Update profile  │
│  • Verify JWT       │   │  • Delete account  │
│  • Refresh tokens   │   │  • List users      │
│                     │   │                    │
│  DB: auth_db        │   │  DB: account_db    │
│                     │   │                    │
│  ANALOGY: ID card   │   │  ANALOGY: HR       │
│  office             │   │  department        │
└─────────┬──────────┘   └──────────┬─────────┘
          │                          │
          └──────────┬───────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│                  RABBITMQ (Port 5672)                 │
│                                                      │
│  WHAT IT DOES:                                       │
│  • Message broker between services                   │
│  • Services PUBLISH events                           │
│  • Other services SUBSCRIBE to events                │
│  • Decouples services (they don't need to know       │
│    about each other directly)                        │
│                                                      │
│  EXAMPLE FLOW:                                       │
│  Auth publishes "USER_REGISTERED" event →            │
│  Account service listens → Creates profile           │
│  WebSocket service listens → Sends notification      │
│                                                      │
│  ANALOGY: Post office - services send letters,       │
│  post office delivers to whoever subscribed          │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              WEBSOCKET SERVICE (Port 5003)            │
│                                                      │
│  WHAT IT DOES:                                       │
│  • Real-time communication                           │
│  • Listens to RabbitMQ events                        │
│  • Pushes updates to connected clients               │
│  • No need for client to keep asking "any updates?"  │
│                                                      │
│  ANALOGY: Notification bell on your phone            │
│  Instead of checking app every minute, it tells YOU  │
└─────────────────────────────────────────────────────┘
```

---

## 🧩 COMPONENT BREAKDOWN

### 1. API Gateway (Express.js)
**Concept**: The single entry point for ALL client requests.
**Why**: Clients should NOT know about internal services.

```
WITHOUT API Gateway:              WITH API Gateway:
Client → Auth Service             Client → API Gateway → Auth Service
Client → Account Service                              → Account Service
Client → Payment Service                              → Payment Service

Problem: Client needs to know      Solution: Client knows ONE URL
multiple URLs                      Gateway handles routing
```

**Key Features**:
- **Rate Limiting**: "You can only make 100 requests per 15 minutes"
- **Logging**: Records every request for debugging
- **Security**: Adds headers to prevent attacks
- **Proxy**: Forwards requests to the right service

### 2. GraphQL Gateway (Apollo Server)
**Concept**: A unified API layer that combines multiple service schemas.

**REST vs GraphQL**:
```
REST (Multiple endpoints):
GET  /api/users/123          → { name, email }
GET  /api/users/123/orders   → { orders }
GET  /api/users/123/profile  → { avatar, bio }
= 3 HTTP requests!

GraphQL (ONE endpoint):
POST /graphql
query {
  user(id: "123") {
    name
    email
    orders { id, total }
    profile { avatar, bio }
  }
}
= 1 HTTP request, get EXACTLY what you need!
```

**Schema Stitching**: Combining schemas from multiple services
```
Auth Service Schema:     Account Service Schema:    Merged Gateway Schema:
type Query {             type Query {               type Query {
  login(...)               getProfile(...)            login(...)
  register(...)            updateProfile(...)         register(...)
}                        }                            getProfile(...)
                                                      updateProfile(...)
                                                    }
```

### 3. Auth Service
**Concept**: Handles ONLY authentication and authorization.

**JWT (JSON Web Token) Flow**:
```
1. User sends email + password
2. Server verifies credentials
3. Server creates JWT token:
   Header: { alg: "HS256" }
   Payload: { userId: "123", role: "user", exp: "1h" }
   Signature: HMAC(header + payload, SECRET_KEY)
4. Server sends token back
5. Client stores token (localStorage/cookie)
6. Client sends token in every request header
7. Server verifies token → allows/denies access
```

### 4. Account Service
**Concept**: Manages user profiles and account data.
**Key Point**: It does NOT handle login/passwords. That's Auth Service's job.

**Separation of Concerns**:
```
Auth Service knows:          Account Service knows:
✓ Email                      ✓ Full name
✓ Password hash              ✓ Avatar
✓ JWT tokens                 ✓ Bio
✓ Login attempts             ✓ Preferences
✗ User's name (NOT its job)  ✗ Password (NOT its job)
```

### 5. RabbitMQ (Message Queue)
**Concept**: Asynchronous communication between services.

**Synchronous vs Asynchronous**:
```
SYNCHRONOUS (REST call):
Auth Service → HTTP POST → Account Service
Auth waits... waits... waits for response
If Account Service is down → Auth fails too! 😱

ASYNCHRONOUS (RabbitMQ):
Auth Service → Publish "USER_REGISTERED" → RabbitMQ Queue
Auth continues working immediately! ✅
Account Service picks up message when ready
If Account Service is down → Message waits in queue
Account comes back → Processes message! 😊
```

**Key Terms**:
- **Producer**: Service that SENDS messages (publishes)
- **Consumer**: Service that RECEIVES messages (subscribes)
- **Queue**: The "mailbox" where messages wait
- **Exchange**: Router that decides which queue gets the message
- **Routing Key**: Label on message (like address on letter)

### 6. WebSocket Service
**Concept**: Real-time, bi-directional communication.

**HTTP vs WebSocket**:
```
HTTP (Request-Response):
Client: "Any new messages?" → Server: "No"
Client: "Any new messages?" → Server: "No"
Client: "Any new messages?" → Server: "Yes! Here"
= Wasteful! Client keeps asking (polling)

WebSocket (Persistent Connection):
Client ←→ Server (connection stays open)
Server: "Hey! New message for you!"
= Efficient! Server tells client immediately
```

---

## 🎯 CONCEPTS vs SYNTAX

### This is the MOST IMPORTANT section for interviews!

| CONCEPT (What to understand)           | SYNTAX (What to code)                        |
|-----------------------------------------|-----------------------------------------------|
| API Gateway is a reverse proxy          | `app.use('/graphql', proxy(...))`             |
| JWT is a stateless auth token           | `jwt.sign(payload, secret)`                  |
| Rate limiting prevents abuse            | `rateLimit({ max: 100, windowMs: 15*60*1000 })` |
| GraphQL has types, queries, mutations   | `type Query { user(id: ID!): User }`         |
| Resolvers are functions for each field  | `user: (_, { id }) => User.findById(id)`     |
| RabbitMQ uses publish/subscribe pattern | `channel.publish(exchange, routingKey, msg)`  |
| WebSocket maintains persistent conn     | `io.on('connection', (socket) => {...})`     |
| Middleware intercepts requests          | `app.use((req, res, next) => {...})`         |
| Schema stitching combines services      | `stitchSchemas({ subschemas: [...] })`       |
| MongoDB is document-based NoSQL         | `mongoose.model('User', schema)`             |

### Mental Model for Each:

**API Gateway** → Think "Security Guard + Receptionist"
- Checks if you're allowed in (rate limit)
- Logs your entry (logging)
- Directs you to the right desk (proxy/routing)

**GraphQL** → Think "Smart Waiter"
- You give ONE order with everything you want
- Waiter gets items from different kitchen stations
- Returns everything at once

**JWT** → Think "Movie Ticket"
- You buy it once (login)
- Show it at every screen (every request)
- It has an expiry time
- Nobody needs to "remember" you - the ticket has all info

**RabbitMQ** → Think "Post Office"
- Services send letters (messages) to post office
- Post office has mailboxes (queues)
- Whoever subscribed to a mailbox gets the letter

**WebSocket** → Think "Phone Call"
- HTTP = sending text messages back and forth
- WebSocket = making a phone call (always connected)

---

## 🎤 INTERVIEW TOPICS (TOP 30)

### Category 1: Architecture (Must Know)
1. **What are microservices?** - Small, independent services communicating over network
2. **Monolith vs Microservices** - Know trade-offs (see table above)
3. **API Gateway Pattern** - Single entry point, cross-cutting concerns
4. **Service Discovery** - How services find each other
5. **Database per Service** - Why each service has its own DB
6. **Event-Driven Architecture** - Services communicate via events

### Category 2: Communication (Must Know)
7. **Sync vs Async communication** - REST/GraphQL vs Message Queues
8. **Message Queue (RabbitMQ)** - Pub/Sub, queues, exchanges, routing keys
9. **GraphQL vs REST** - When to use which, pros/cons
10. **Schema Stitching/Federation** - Combining multiple GraphQL schemas
11. **WebSocket vs HTTP** - Real-time vs request-response
12. **gRPC** - Binary protocol, used for inter-service communication

### Category 3: Authentication (Must Know)
13. **JWT (JSON Web Token)** - Structure, signing, verification
14. **OAuth 2.0** - Authorization framework (Google login, etc.)
15. **Session vs Token auth** - Stateful vs stateless
16. **Refresh Tokens** - How to handle token expiry
17. **RBAC** - Role-Based Access Control

### Category 4: Resilience (Good to Know)
18. **Circuit Breaker Pattern** - Stop calling failing service
19. **Retry with Backoff** - Retry failed requests with increasing delay
20. **Saga Pattern** - Manage distributed transactions
21. **CQRS** - Command Query Responsibility Segregation
22. **Health Checks** - Monitor service health

### Category 5: DevOps (Good to Know)
23. **Docker** - Container each service
24. **Kubernetes** - Orchestrate containers
25. **CI/CD** - Automated deployment
26. **Logging & Monitoring** - Centralized logging (ELK Stack)
27. **Load Balancing** - Distribute traffic across instances

### Category 6: Data (Good to Know)
28. **Event Sourcing** - Store events, not just current state
29. **Data Consistency** - Eventual consistency in distributed systems
30. **CAP Theorem** - Consistency, Availability, Partition Tolerance (pick 2)

---

## 🚀 HOW TO RUN

### Prerequisites:
1. **Node.js** (v16+)
2. **MongoDB** (running locally on port 27017)
3. **RabbitMQ** (running locally on port 5672)
   - Download from: https://www.rabbitmq.com/download.html
   - Or use Docker: `docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:management`

### Installation:
```bash
# Install all services
cd api-gateway && npm install
cd ../graphql-gateway && npm install
cd ../auth-service && npm install
cd ../account-service && npm install
cd ../websocket-service && npm install
```

### Start Order (IMPORTANT!):
```bash
# 1. Make sure MongoDB is running
# 2. Make sure RabbitMQ is running
# 3. Start services in this order:

cd auth-service && npm run dev         # Port 5001
cd account-service && npm run dev      # Port 5002
cd websocket-service && npm run dev    # Port 5003
cd graphql-gateway && npm run dev      # Port 4001
cd api-gateway && npm run dev          # Port 4000
```

### Test Endpoints:
- API Gateway: http://localhost:4000
- GraphQL Playground: http://localhost:4000/graphql
- WebSocket: ws://localhost:5003
- RabbitMQ Dashboard: http://localhost:15672 (guest/guest)

---

## 📂 PROJECT STRUCTURE

```
real MicroServices/
├── ARCHITECTURE.md              ← You are here!
│
├── api-gateway/                 ← Port 4000 - Entry point
│   ├── package.json
│   └── src/
│       └── index.js
│
├── graphql-gateway/             ← Port 4001 - Combines all GraphQL schemas
│   ├── package.json
│   └── src/
│       ├── index.js
│       └── middleware/
│           └── auth.js
│
├── auth-service/                ← Port 5001 - Login, Register, JWT
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── models/
│       │   └── User.js
│       ├── schema/
│       │   └── typeDefs.js
│       ├── resolvers/
│       │   └── authResolvers.js
│       └── rabbitmq/
│           └── publisher.js
│
├── account-service/             ← Port 5002 - Profile management
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── models/
│       │   └── Profile.js
│       ├── schema/
│       │   └── typeDefs.js
│       ├── resolvers/
│       │   └── accountResolvers.js
│       └── rabbitmq/
│           └── consumer.js
│
├── websocket-service/           ← Port 5003 - Real-time notifications
│   ├── package.json
│   └── src/
│       └── index.js
│
└── shared/                      ← Shared utilities
    └── rabbitmq.js
```
