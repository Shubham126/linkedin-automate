import mongoose from 'mongoose';

const scrapedProfileSchema = new mongoose.Schema({
  profileUrl: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  headline: String,
  location: String,
  connectionDegree: String,
  followers: String,
  about: String,
  scrapedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  scrapedDate: {
    type: Date,
    default: Date.now
  },
  searchKeyword: String
}, {
  timestamps: true
});

const ScrapedProfile = mongoose.model('ScrapedProfile', scrapedProfileSchema);

export default ScrapedProfile;
