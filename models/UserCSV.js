// ==================== FILE: backend/models/UserCSV.js ====================
import mongoose from 'mongoose';

const userCSVSchema = new mongoose.Schema({
  user_email: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  csv_paths: {
    engagement_likes: String,
    engagement_comments: String,
    connections_sent: String,
    messages_sent: String,
    posts_created: String
  },

  summary_stats: {
    total_engagement_likes: { type: Number, default: 0 },
    total_engagement_comments: { type: Number, default: 0 },
    total_connections_sent: { type: Number, default: 0 },
    total_messages_sent: { type: Number, default: 0 },
    total_posts_created: { type: Number, default: 0 }
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('UserCSV', userCSVSchema);
