import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema({
  profileUrl: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  headline: String,
  initialConnection: String,
  requestSentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Direct Messaged'],
    default: 'Pending'
  },
  acceptanceDate: Date,
  messageSent: {
    type: Boolean,
    default: false
  },
  messageDate: Date,
  messageContent: String,
  notes: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const Connection = mongoose.model('Connection', connectionSchema);

export default Connection;
