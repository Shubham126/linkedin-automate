import mongoose from 'mongoose';

const connectionLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  action: {
    type: String,
    enum: ['connection_requested', 'followed', 'message_sent', 'error'],
    required: true
  },
  profileUrl: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  headline: String,
  location: String,
  connectionDegree: String,
  message: String,
  status: {
    type: String,
    enum: ['success', 'pending', 'failed'],
    default: 'success'
  },
  error: String,
  linkedinUsername: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

export default mongoose.model('ConnectionLog', connectionLogSchema);
