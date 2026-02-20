# 🧪 Testing Guide - Microservices Architecture

## Quick Start

### Prerequisites
1. **MongoDB** must be running locally on port 27017
2. **RabbitMQ** must be running locally on port 5672
   - If you don't have RabbitMQ, services will still work (just without events)
   - Install via: https://www.rabbitmq.com/download.html
   - Or Docker: `docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:management`

### Start Services (in separate terminals, IN THIS ORDER):

```bash
# Terminal 1: Auth Service
cd auth-service
npm run dev

# Terminal 2: Account Service
cd account-service
npm run dev

# Terminal 3: WebSocket Service
cd websocket-service
npm run dev

# Terminal 4: GraphQL Gateway
cd graphql-gateway
npm run dev

# Terminal 5: API Gateway
cd api-gateway
npm run dev
```

---

## 📧 Test with cURL or Postman

### 1. Register a User
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { register(input: { email: \"test@example.com\", password: \"password123\" }) { token refreshToken user { id email role } } }"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { login(input: { email: \"test@example.com\", password: \"password123\" }) { token refreshToken user { id email role } } }"
  }'
```

### 3. Get Current User (with JWT token)
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "query": "query { me { id email role createdAt } }"
  }'
```

### 4. Get My Profile
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "query": "query { myProfile { id userId email firstName lastName fullName avatar bio preferences { theme language } } }"
  }'
```

### 5. Update Profile
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "query": "mutation { updateProfile(input: { firstName: \"John\", lastName: \"Doe\", bio: \"Learning microservices!\" }) { firstName lastName fullName bio } }"
  }'
```

### 6. Get All Profiles
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { getAllProfiles(limit: 10, offset: 0) { id email firstName lastName isOnline } }"
  }'
```

### 7. Refresh Token
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { refreshToken(refreshToken: \"YOUR_REFRESH_TOKEN_HERE\") { token refreshToken user { id email } } }"
  }'
```

### 8. Logout
```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "query": "mutation { logout { success message } }"
  }'
```

---

## 🔗 Service Health Checks

```bash
# API Gateway
curl http://localhost:4000/health

# GraphQL Gateway
curl http://localhost:4001/health

# Auth Service
curl http://localhost:5001/health

# Account Service
curl http://localhost:5002/health

# WebSocket Service
curl http://localhost:5003/health
```

---

## 📡 Test WebSocket

1. Open http://localhost:5003 in your browser
2. Connect (with or without JWT token)
3. Register a new user in another terminal
4. Watch real-time notification appear in browser!

---

## 🐰 RabbitMQ Dashboard

If you installed RabbitMQ with management plugin:
- URL: http://localhost:15672
- Username: guest
- Password: guest

You can see:
- Active queues (account_service_queue, websocket_service_queue)
- Message rates
- Consumer connections

---

## 🔄 Complete Flow Test

Here's how to test the ENTIRE flow:

1. **Open WebSocket test page**: http://localhost:5003 → Click "Connect"
2. **Register a user**: Send the register mutation via cURL
3. **Watch the magic**:
   - Auth Service creates user in auth_db ✅
   - Auth publishes "user.registered" to RabbitMQ ✅
   - Account Service receives event → creates profile in account_db ✅
   - WebSocket Service receives event → pushes notification to browser ✅
4. **Query the profile**: Send myProfile query with the JWT token
5. **Update the profile**: Send updateProfile mutation
6. **Logout**: Send logout mutation
