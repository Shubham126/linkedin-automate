// ==================== FILE: models/Activity.js (UPDATED) ====================
import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  action: {
    type: String,
    enum: [
      'like',
      'comment',
      'view',
      'connection_requested',
      'connection_accepted',
      'message_sent',
      'post_created',
      'profile_scrape',
      'search_engagement'
    ],
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
    enum: [
      'feed_post',
      'job_post',
      'article',
      'video',
      'connection_request',
      'message',
      'profile_scrape',
      'search_result',
      'unknown'
    ],
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
  },
  additionalData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Compound indexes for faster queries
activitySchema.index({ linkedinUsername: 1, timestamp: -1 });
activitySchema.index({ linkedinUsername: 1, action: 1, timestamp: -1 });
activitySchema.index({ postUrl: 1 });

// ✅ CHANGED: Use default export instead of named export
export default mongoose.model('Activity', activitySchema);
