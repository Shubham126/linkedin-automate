import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import automationRoutes from './routes/automation.js';
import dataRoutes from './routes/data.js';
import analyticsRoutes from './routes/analytics.js';
import connectionsRoutes from './routes/connections.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;

// ==================== MONGODB CONNECTION ====================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedin-automation', {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('💡 Make sure MongoDB is running and MONGODB_URI is set correctly');
    console.warn('⚠️  Server will continue without database connection');
  }
};

// Connect to database
connectDB();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ==================== AUTH ROUTES (INLINE) ====================
// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    console.log('📝 Registration attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        email,
        name: name || email.split('@')[0],
        id: Date.now()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        email,
        name: email.split('@')[0],
        id: Date.now()
      },
      token: 'mock-jwt-' + Date.now()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// LinkedIn Login
app.post('/api/auth/linkedin/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 LinkedIn login attempt:', email);

    res.json({
      success: true,
      message: 'LinkedIn authentication successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== OTHER ROUTES ====================
app.use('/api/automation', automationRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/connections', connectionsRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'Endpoint not found',
    requestedUrl: req.url
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 LinkedIn Automation API Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Register: http://localhost:${PORT}/api/auth/register`);
  console.log(`🔐 Login: http://localhost:${PORT}/api/auth/login`);
  console.log(`📋 Data: http://localhost:${PORT}/api/data/sheet-urls`);
  console.log(`📈 Analytics: http://localhost:${PORT}/api/analytics/activity-stats`);
  console.log(`🤝 Connections: http://localhost:${PORT}/api/connections/history`);
  console.log('═'.repeat(60) + '\n');
});
