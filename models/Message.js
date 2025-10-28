import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  profileUrl: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['Direct Message', 'Welcome Message', 'Follow-up Message', 'Custom Message'],
    required: true
  },
  messageContent: {
    type: String,
    required: true
  },
  sentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Sent', 'Failed', 'Pending'],
    default: 'Sent'
  },
  replyReceived: {
    type: Boolean,
    default: false
  },
  replyDate: Date,
  replyContent: String,
  notes: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
