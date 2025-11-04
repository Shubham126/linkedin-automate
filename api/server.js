// ==================== FILE: backend/api/server.js ====================
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database.js';
import { 
  getUserLogs, 
  getConnectionStats, 
  exportLogsToCSV,
  getLogsAsCSV,
  deleteOldLogs,
  clearUserLogs,
  getActivityByDate,
  getTopAuthors,
  getEngagementTrends
} from '../services/mongoConnectionService.js';
import automationRoutes from './routes/automation.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;

// ==================== CONNECT TO DATABASE ====================
await connectDB();

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation API',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ==================== AUTHENTICATION ROUTES ====================
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/linkedin/login', (req, res) => {
  try {
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

// ==================== LOGS ROUTES ====================
app.get('/api/logs/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { action } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const logs = await getUserLogs(username, action);

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching logs:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/stats/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const stats = await getConnectionStats(username);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/export/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const csvPath = await exportLogsToCSV(username, `./exports/${username}_logs.csv`);

    res.json({
      success: true,
      message: 'CSV exported successfully',
      path: csvPath,
      downloadUrl: `/exports/${username}_logs.csv`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/logs/delete-old/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { days = 30 } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const result = await deleteOldLogs(username, days);

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${days} days`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/user/:username/action/:action', async (req, res) => {
  try {
    const { username, action } = req.params;

    if (!username || !action) {
      return res.status(400).json({
        success: false,
        error: 'Username and action are required'
      });
    }

    const logs = await getUserLogs(username, action);

    res.json({
      success: true,
      count: logs.length,
      action: action,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/dashboard/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const stats = await getConnectionStats(username);
    const logs = await getUserLogs(username);

    res.json({
      success: true,
      data: {
        stats,
        summary: {
          totalLogs: logs.length,
          timestamp: new Date()
        },
        recentLogs: logs.slice(0, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/activity-by-date/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const activities = await getActivityByDate(username);

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/top-authors/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 10 } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const authors = await getTopAuthors(username, parseInt(limit));

    res.json({
      success: true,
      data: authors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/trends/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { days = 30 } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const trends = await getEngagementTrends(username, parseInt(days));

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/logs/download/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const csv = await getLogsAsCSV(username);

    if (!csv) {
      return res.status(404).json({
        success: false,
        error: 'No logs found'
      });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${username}_activity_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/logs/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const result = await clearUserLogs(username);

    res.json({
      success: true,
      message: `Cleared all logs for ${username}`,
      clearedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== AUTOMATION ROUTES ====================
app.use('/api/automation', automationRoutes);

// ==================== STATIC FILES ====================
app.use('/exports', express.static('exports'));

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('❌ API Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.url} not found`
  });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(70));
  console.log('🚀 LinkedIn Automation API Server');
  console.log('═'.repeat(70));
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`✅ Health Check: http://localhost:${PORT}/health`);
  console.log(`✅ API Health: http://localhost:${PORT}/api/health`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
  console.log('═'.repeat(70));
  console.log('\n📋 Available Endpoints:');
  console.log('\n📊 Logs API:');
  console.log(`   GET  /api/logs/user/:username`);
  console.log(`   GET  /api/logs/stats/:username`);
  console.log(`   GET  /api/logs/download/:username`);
  console.log(`   GET  /api/logs/user/:username/action/:action`);
  console.log(`   POST /api/logs/delete-old/:username`);
  console.log(`   GET  /api/logs/activity-by-date/:username`);
  console.log(`   GET  /api/logs/top-authors/:username`);
  console.log(`   GET  /api/logs/trends/:username`);
  console.log('\n🤖 Automation API:');
  console.log(`   POST /api/automation/feed-engagement/start`);
  console.log(`   POST /api/automation/connection-requests/start`);
  console.log(`   POST /api/automation/monitor-connections/start`);
  console.log(`   POST /api/automation/welcome-messages/start`);
  console.log(`   POST /api/automation/search-engagement/start`);
  console.log(`   POST /api/automation/profile-scraping/start`);
  console.log(`   GET  /api/automation/job/status`);
  console.log(`   POST /api/automation/job/cancel`);
  console.log('\n📝 Post Creation API:');
  console.log(`   POST /api/automation/create-post/generate-ai`);
  console.log(`   POST /api/automation/create-post/generate-hashtags`);
  console.log('═'.repeat(70) + '\n');
});

export default app;
