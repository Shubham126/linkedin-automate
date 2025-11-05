// ==================== FILE: backend/api/routes/csv.js (COMPLETE UPDATED) ====================
import express from 'express';
import csvService from '../../services/csvService.js';
import UserCSV from '../../models/UserCSV.js';
import { getActivityStats as getStats } from '../../utils/activityLogger.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ==================== CSV STATS ROUTES ====================

/**
 * Get activity statistics from MongoDB
 * GET /api/csv/stats/activity
 */
router.get('/stats/activity', async (req, res) => {
  try {
    const stats = await getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get CSV statistics from UserCSV model
 * GET /api/csv/stats/csv?email=user@email.com
 */
router.get('/stats/csv', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Find or create user CSV record
    let userCSV = await UserCSV.findOne({ user_email: email });
    
    if (!userCSV) {
      // Initialize CSV for new user
      userCSV = await csvService.getUserCSVPaths(email);
      // Save to MongoDB
      userCSV = await UserCSV.create({
        user_email: email,
        csv_paths: userCSV?.csv_paths || {},
        summary_stats: {
          total_engagement_likes: 0,
          total_engagement_comments: 0,
          total_connections_sent: 0,
          total_messages_sent: 0,
          total_posts_created: 0
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        stats: userCSV.summary_stats,
        paths: userCSV.csv_paths
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get engagement statistics with both MongoDB and CSV data
 * GET /api/csv/stats/engagement?email=user@email.com
 */
router.get('/stats/engagement', async (req, res) => {
  try {
    const { email } = req.query;
    const mongoStats = await getStats();
    
    let csvStats = {};
    let userCSV = null;

    if (email) {
      userCSV = await UserCSV.findOne({ user_email: email });
      if (!userCSV) {
        userCSV = await UserCSV.create({
          user_email: email,
          csv_paths: {},
          summary_stats: {}
        });
      }
      csvStats = userCSV.summary_stats;
    }
    
    const engagementRate = mongoStats.total > 0 
      ? ((mongoStats.likes + mongoStats.comments) / mongoStats.total * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        ...mongoStats,
        ...csvStats,
        engagementRate: `${engagementRate}%`,
        avgLikesPerPost: mongoStats.total > 0 ? (mongoStats.likes / mongoStats.total).toFixed(2) : 0,
        avgCommentsPerPost: mongoStats.total > 0 ? (mongoStats.comments / mongoStats.total).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CSV DATA ROUTES ====================

/**
 * Get CSV file data
 * GET /api/csv/data/csv?email=user@email.com&fileType=engagement_likes
 */
router.get('/data/csv', async (req, res) => {
  try {
    const { email, fileType = 'engagement_likes', limit = 100, offset = 0 } = req.query;
    
    if (!email || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Email and fileType are required'
      });
    }

    const data = await csvService.readCSVFile(email, fileType);
    
    // Apply pagination
    const paginatedData = data.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: paginatedData,
      count: paginatedData.length,
      total: data.length,
      fileType: fileType,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: data.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Download CSV file
 * GET /api/csv/data/download?email=user@email.com&fileType=engagement_likes
 */
router.get('/data/download', async (req, res) => {
  try {
    const { email, fileType } = req.query;
    
    if (!email || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Email and fileType are required'
      });
    }

    const userDir = csvService.getUserCSVDirectory(email);
    const filePath = path.join(userDir, `${fileType}.csv`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'CSV file not found'
      });
    }

    const fileName = `${fileType}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all CSV paths for user
 * GET /api/csv/stats/paths?email=user@email.com
 */
router.get('/stats/paths', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const userCSV = await UserCSV.findOne({ user_email: email });
    
    if (!userCSV) {
      return res.json({
        success: true,
        data: {
          csv_paths: {},
          message: 'No CSV files created yet'
        }
      });
    }

    res.json({
      success: true,
      data: {
        csv_paths: userCSV.csv_paths,
        stats: userCSV.summary_stats,
        createdAt: userCSV.created_at,
        updatedAt: userCSV.updated_at
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ANALYTICS ROUTES ====================

/**
 * Get CSV analytics with grouping by date, score, status
 * GET /api/csv/data/analytics?email=user@email.com
 */
router.get('/data/analytics', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get UserCSV stats
    let userCSV = await UserCSV.findOne({ user_email: email });
    if (!userCSV) {
      userCSV = await UserCSV.create({
        user_email: email,
        csv_paths: {},
        summary_stats: {}
      });
    }

    // Read CSV files
    const likes = await csvService.readCSVFile(email, 'engagement_likes');
    const comments = await csvService.readCSVFile(email, 'engagement_comments');
    const connections = await csvService.readCSVFile(email, 'connections_sent');
    const messages = await csvService.readCSVFile(email, 'messages_sent');

    // Calculate analytics
    const analytics = {
      engagement: {
        totalLikes: likes.length,
        totalComments: comments.length,
        avgLikeScore: likes.length > 0 
          ? (likes.reduce((sum, l) => sum + parseFloat(l.likeScore || 0), 0) / likes.length).toFixed(2)
          : 0,
        avgCommentScore: comments.length > 0
          ? (comments.reduce((sum, c) => sum + parseFloat(c.commentScore || 0), 0) / comments.length).toFixed(2)
          : 0,
        jobPostLikes: likes.filter(l => l.isJobPost === 'true' || l.isJobPost === true).length,
        jobPostComments: comments.filter(c => c.isJobPost === 'true' || c.isJobPost === true).length
      },
      connections: {
        totalConnections: connections.length,
        statusBreakdown: countByField(connections, 'status')
      },
      messages: {
        totalMessages: messages.length,
        statusBreakdown: countByField(messages, 'status')
      },
      timeline: {
        likesOverTime: groupByDate(likes),
        commentsOverTime: groupByDate(comments),
        connectionsOverTime: groupByDate(connections),
        messagesOverTime: groupByDate(messages)
      },
      scoreDistribution: {
        likeScores: getScoreDistribution(likes, 'likeScore'),
        commentScores: getScoreDistribution(comments, 'commentScore')
      }
    };

    res.json({
      success: true,
      data: analytics,
      summary: userCSV.summary_stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get dashboard summary
 * GET /api/csv/data/dashboard?email=user@email.com
 */
router.get('/data/dashboard', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get UserCSV stats
    let userCSV = await UserCSV.findOne({ user_email: email });
    if (!userCSV) {
      userCSV = await UserCSV.create({
        user_email: email,
        csv_paths: {},
        summary_stats: {}
      });
    }

    // Get latest records from each file
    const likes = await csvService.readCSVFile(email, 'engagement_likes');
    const comments = await csvService.readCSVFile(email, 'engagement_comments');
    const connections = await csvService.readCSVFile(email, 'connections_sent');
    const messages = await csvService.readCSVFile(email, 'messages_sent');

    const dashboard = {
      stats: {
        totalLikes: likes.length,
        totalComments: comments.length,
        totalConnections: connections.length,
        totalMessages: messages.length
      },
      recent: {
        likes: likes.slice(-5).reverse(),
        comments: comments.slice(-5).reverse(),
        connections: connections.slice(-5).reverse(),
        messages: messages.slice(-5).reverse()
      },
      summary: userCSV.summary_stats,
      paths: userCSV.csv_paths
    };

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get activity log with filtering
 * GET /api/csv/data/activity-log?email=user@email.com&type=likes&limit=50
 */
router.get('/data/activity-log', async (req, res) => {
  try {
    const { email, type = 'likes', limit = 50 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    let data = [];
    
    switch(type) {
      case 'likes':
        data = await csvService.readCSVFile(email, 'engagement_likes');
        break;
      case 'comments':
        data = await csvService.readCSVFile(email, 'engagement_comments');
        break;
      case 'connections':
        data = await csvService.readCSVFile(email, 'connections_sent');
        break;
      case 'messages':
        data = await csvService.readCSVFile(email, 'messages_sent');
        break;
      case 'all':
        const likes = await csvService.readCSVFile(email, 'engagement_likes');
        const comments = await csvService.readCSVFile(email, 'engagement_comments');
        data = [...likes, ...comments].sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        break;
      default:
        data = [];
    }

    const recent = data.slice(-parseInt(limit)).reverse();

    res.json({
      success: true,
      data: recent,
      total: data.length,
      type: type,
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update CSV statistics manually
 * POST /api/csv/stats/update?email=user@email.com
 */
router.post('/stats/update', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Read all CSV files and recalculate stats
    const likes = await csvService.readCSVFile(email, 'engagement_likes');
    const comments = await csvService.readCSVFile(email, 'engagement_comments');
    const connections = await csvService.readCSVFile(email, 'connections_sent');
    const messages = await csvService.readCSVFile(email, 'messages_sent');

    // Update MongoDB
    const updatedCSV = await UserCSV.findOneAndUpdate(
      { user_email: email },
      {
        summary_stats: {
          total_engagement_likes: likes.length,
          total_engagement_comments: comments.length,
          total_connections_sent: connections.length,
          total_messages_sent: messages.length,
          total_posts_created: 0
        },
        updated_at: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: updatedCSV.summary_stats,
      message: 'Statistics updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Group records by date
 */
function groupByDate(records) {
  const grouped = {};
  
  records.forEach(record => {
    const date = record.timestamp ? record.timestamp.split('T')[0] : 'Unknown';
    grouped[date] = (grouped[date] || 0) + 1;
  });

  return Object.entries(grouped)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({ date, count }));
}

/**
 * Count records by field value
 */
function countByField(records, field) {
  const counts = {};
  
  records.forEach(record => {
    const value = record[field] || 'Unknown';
    counts[value] = (counts[value] || 0) + 1;
  });

  return counts;
}

/**
 * Get score distribution (grouped in buckets)
 */
function getScoreDistribution(records, scoreField) {
  const distribution = {
    '0-2': 0,
    '3-4': 0,
    '5-6': 0,
    '7-8': 0,
    '9-10': 0
  };

  records.forEach(record => {
    const score = parseFloat(record[scoreField] || 0);
    if (score <= 2) distribution['0-2']++;
    else if (score <= 4) distribution['3-4']++;
    else if (score <= 6) distribution['5-6']++;
    else if (score <= 8) distribution['7-8']++;
    else distribution['9-10']++;
  });

  return distribution;
}

export default router;
