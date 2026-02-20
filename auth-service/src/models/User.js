// ============================================================
// 🔐 AUTH SERVICE - User Model (MongoDB + Mongoose)
// ============================================================
//
// CONCEPT: Database Per Service
// Each microservice has its OWN database. The Auth Service
// connects to "auth_db", and Account Service connects to "account_db".
//
// WHY separate databases?
// 1. Services are truly independent
// 2. Can use different DB tech per service (SQL here, NoSQL there)
// 3. One service can't accidentally mess up another's data
// 4. Can scale databases independently
//
// INTERVIEW: "What is the Database per Service pattern?"
// Each microservice owns its data. No shared databases.
// Services communicate via APIs or events, NOT by reading
// each other's database.
//
// CONCEPT: Mongoose
// Mongoose is an ODM (Object Document Mapper) for MongoDB.
// - ODM for MongoDB = ORM for SQL databases
// - Defines schema (structure) for documents
// - Provides validation, middleware, and query helpers
// ============================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ----- SCHEMA DEFINITION -----
// In MongoDB, data is stored as "documents" (like JSON objects)
// Mongoose Schema defines the STRUCTURE of those documents
//
// INTERVIEW: "Schema vs Model in Mongoose"
// Schema = Blueprint (defines fields, types, validation)
// Model  = Constructor function (creates actual documents)
// Think: Schema = Architectural drawing, Model = Construction company

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],        // Custom error message
      unique: true,                                   // No duplicate emails
      lowercase: true,                                // Always store lowercase
      trim: true,                                     // Remove whitespace
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],   // Regex validation
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,  // IMPORTANT: Don't include password in queries by default
                       // You must explicitly use .select('+password') to get it
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'moderator'],  // Only these values allowed
      default: 'user',
    },
    refreshToken: {
      type: String,
      select: false,  // Also hidden by default
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    // ----- SCHEMA OPTIONS -----
    timestamps: true,  // Automatically adds createdAt and updatedAt fields
    
    // Transform output when converting to JSON
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;   // Rename _id to id
        delete ret._id;     // Remove _id
        delete ret.__v;     // Remove version key
        delete ret.password; // Never expose password
        return ret;
      },
    },
  }
);

// ═══════════════════════════════════════════════════════════
// MONGOOSE MIDDLEWARE (Pre/Post Hooks)
// ═══════════════════════════════════════════════════════════
//
// CONCEPT: Middleware in Mongoose
// Functions that run BEFORE (pre) or AFTER (post) certain operations.
// Similar to Express middleware, but for database operations.
//
// COMMON USE CASES:
// - Hash password before saving
// - Log operations after saving
// - Validate data before saving
// - Send emails after creating a user
//
// INTERVIEW: "How do you hash passwords?"
// Answer: Using bcrypt with salt rounds. NEVER store plain passwords.
// bcrypt adds a random "salt" so same password = different hash each time.
// ═══════════════════════════════════════════════════════════

// PRE-SAVE hook: Hash password before saving to database
userSchema.pre('save', async function (next) {
  // Only hash if password was modified (not on every save)
  if (!this.isModified('password')) return next();

  try {
    // SALT: Random data mixed with password before hashing
    // Number = "salt rounds" = how complex the hash is
    // 12 rounds ≈ ~300ms to hash (good balance of security vs speed)
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════════════════════
//
// Methods available on each document instance
// Usage: const user = await User.findOne({email}); user.comparePassword('123');

// Compare plain text password with hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  // bcrypt.compare handles the salt automatically
  return bcrypt.compare(candidatePassword, this.password);
};

// ═══════════════════════════════════════════════════════════
// STATIC METHODS
// ═══════════════════════════════════════════════════════════
//
// Methods available on the Model itself (not on instances)
// Usage: User.findByEmail('test@test.com')

userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// ----- CREATE AND EXPORT MODEL -----
// mongoose.model('User', userSchema) does TWO things:
// 1. Creates a Model constructor from the schema
// 2. Tells MongoDB to use collection name "users" (lowercase + plural)
const User = mongoose.model('User', userSchema);

module.exports = User;
