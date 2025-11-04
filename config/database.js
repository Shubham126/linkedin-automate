// ==================== FILE: config/database.js ====================
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedin-automation';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB Connected');
    return true;
  } catch (error) {
    console.log(`⚠️ MongoDB Connection Error: ${error.message}`);
    console.log('   Falling back to file-based storage');
    return false;
  }
};

export default connectDB;
