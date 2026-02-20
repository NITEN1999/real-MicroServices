// ============================================================
// 👤 ACCOUNT SERVICE - GraphQL Resolvers
// ============================================================

const Profile = require('../models/Profile');

const accountResolvers = {
  Query: {
    /**
     * MY PROFILE - Get the currently authenticated user's profile
     * 
     * Uses the userId from the JWT token (via context) to find
     * the profile in account_db
     */
    myProfile: async (_, __, context) => {
      if (!context.user) {
        throw new Error('Authentication required. Please login first.');
      }

      const profile = await Profile.findOne({ userId: context.user.userId });
      if (!profile) {
        throw new Error('Profile not found. Please try again later.');
      }

      return profile;
    },

    /**
     * GET PROFILE - Get any user's profile by userId
     */
    getProfile: async (_, { userId }) => {
      const profile = await Profile.findOne({ userId });
      if (!profile) {
        throw new Error('Profile not found');
      }
      return profile;
    },

    /**
     * GET ALL PROFILES - List all profiles (with pagination)
     * 
     * CONCEPT: Pagination
     * You don't want to load ALL profiles at once (could be millions!)
     * Instead, load them in "pages" using limit and offset.
     * 
     * limit  = How many to return (page size)
     * offset = How many to skip (which page)
     * 
     * Page 1: limit=10, offset=0  → items 1-10
     * Page 2: limit=10, offset=10 → items 11-20
     * Page 3: limit=10, offset=20 → items 21-30
     * 
     * INTERVIEW: "Offset vs Cursor pagination"
     * Offset: Simple but slow for large datasets (skipping is expensive)
     * Cursor: Uses a pointer (ID) to the last item. More efficient.
     */
    getAllProfiles: async (_, { limit = 10, offset = 0 }) => {
      const profiles = await Profile.find()
        .skip(offset)
        .limit(limit)
        .sort({ createdAt: -1 });  // Newest first

      return profiles;
    },
  },

  Mutation: {
    /**
     * UPDATE PROFILE - Update the current user's profile
     * 
     * Only authenticated users can update THEIR OWN profile.
     * 
     * EXAMPLE GraphQL Mutation:
     * mutation {
     *   updateProfile(input: {
     *     firstName: "John",
     *     lastName: "Doe",
     *     bio: "Software developer"
     *     preferences: {
     *       theme: "dark"
     *     }
     *   }) {
     *     firstName
     *     lastName
     *     fullName
     *   }
     * }
     */
    updateProfile: async (_, { input }, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // CONCEPT: findOneAndUpdate with { new: true }
      // By default, findOneAndUpdate returns the ORIGINAL document (before update)
      // { new: true } makes it return the UPDATED document
      // { runValidators: true } ensures schema validations still run
      const profile = await Profile.findOneAndUpdate(
        { userId: context.user.userId },
        { $set: input },  // $set only updates specified fields
        { new: true, runValidators: true }
      );

      if (!profile) {
        throw new Error('Profile not found');
      }

      console.log(`✅ Profile updated for user ${context.user.userId}`);
      return profile;
    },

    /**
     * DELETE PROFILE - Delete the current user's profile
     */
    deleteProfile: async (_, __, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const profile = await Profile.findOneAndDelete({ userId: context.user.userId });
      if (!profile) {
        throw new Error('Profile not found');
      }

      console.log(`✅ Profile deleted for user ${context.user.userId}`);
      return {
        success: true,
        message: 'Profile deleted successfully',
      };
    },
  },
};

module.exports = accountResolvers;
