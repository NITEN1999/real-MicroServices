// ============================================================
// 👤 ACCOUNT SERVICE - Profile Model (MongoDB)
// ============================================================
//
// CONCEPT: Separation of Concerns
// Auth Service stores: email, password, tokens (security data)
// Account Service stores: name, bio, avatar (profile data)
//
// WHY separate?
// 1. Different teams can work on each independently
// 2. Auth Service can be scaled separately from profiles
// 3. Security data is isolated from profile data
// 4. Different update frequencies (profile changes rarely,
//    tokens change frequently)
//
// INTERVIEW: "How do you link data across services?"
// Answer: By using a shared identifier (userId).
// Auth creates user with an _id → publishes event with userId →
// Account creates profile with that same userId.
// They don't share a database, they share an ID!
// ============================================================

const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    // Link to Auth Service's user by userId
    // This is NOT a foreign key (MongoDB doesn't have those)
    // It's just a field that holds the same ID as the user in auth_db
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,  // Create an index for fast lookups
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      default: '',
      trim: true,
    },
    lastName: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: 'https://via.placeholder.com/150',
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
    },
    phone: {
      type: String,
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      zipCode: { type: String, default: '' },
    },
    preferences: {
      language: { type: String, default: 'en' },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      notifications: { type: Boolean, default: true },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ----- VIRTUAL FIELD -----
// Virtual fields are computed fields that exist in the model
// but NOT stored in the database
// INTERVIEW: "What are Mongoose virtuals?"
profileSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Include virtuals when converting to JSON
profileSchema.set('toJSON', { virtuals: true });

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
