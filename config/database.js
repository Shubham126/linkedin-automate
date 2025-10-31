import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ MongoDB Connection Failed: ${error.message}`);
    console.warn(`⚠️ Falling back to file-based cookie storage`);
    return false;
  }
};

export default connectDB;
