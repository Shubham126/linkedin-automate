import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import automationRoutes from './routes/automation.js';
import analyticsRoutes from './routes/analytics.js';
import connectionsRoutes from './routes/connections.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.API_PORT || 3000;

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
    database: 'Connected'
  });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Data routes (protected)
app.use('/api/data', dataRoutes);

// API Routes (protected with authMiddleware)
app.use('/api/automation', authMiddleware, automationRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/connections', authMiddleware, connectionsRoutes);

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
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 LinkedIn Automation API Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 JWT Authentication: Enabled`);
  console.log(`💾 MongoDB: Connected`);
  console.log('═'.repeat(60) + '\n');
});
