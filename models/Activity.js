// ==================== FILE: models/Activity.js ====================
import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  action: {
    type: String,
    enum: ['like', 'comment', 'view'],
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true
  },
  postUrl: {
    type: String,
    required: true,
    index: true
  },
  postPreview: String,
  commentText: String,
  likeScore: Number,
  commentScore: Number,
  postType: {
    type: String,
    default: 'unknown'
  },
  isJobPost: {
    type: Boolean,
    default: false
  },
  linkedinUsername: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    default: 'logged'
  }
});

// Compound indexes for faster queries
activitySchema.index({ linkedinUsername: 1, timestamp: -1 });
activitySchema.index({ linkedinUsername: 1, action: 1, timestamp: -1 });

export const Activity = mongoose.model('Activity', activitySchema);
