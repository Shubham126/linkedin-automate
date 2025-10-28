import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import automationRoutes from './routes/automation.js';
import analyticsRoutes from './routes/analytics.js';
import connectionsRoutes from './routes/connections.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

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
    service: 'LinkedIn Automation API'
  });
});

// API Routes (protected)
app.use('/api/automation', authMiddleware, automationRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/connections', authMiddleware, connectionsRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 LinkedIn Automation API Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 API Key: ${process.env.API_KEY ? 'Configured' : 'NOT SET'}`);
  console.log('═'.repeat(60) + '\n');
});
