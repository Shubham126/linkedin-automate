import mongoose from 'mongoose';

const linkedInSessionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  cookies: {
    type: String, // Stored as JSON string
    required: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}, {
  timestamps: true
});

// Check if session is expired
linkedInSessionSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt || !this.isValid;
};

const LinkedInSession = mongoose.model('LinkedInSession', linkedInSessionSchema);

export default LinkedInSession;
