// ==================== FILE: backend/api/controllers/analyticsController.js ====================
import { getActivityStats as getStats } from '../../utils/activityLogger.js';
import csvService from '../../services/csvService.js';
import UserCSV from '../../models/UserCSV.js';
import Activity from '../../models/Activity.js';

/**
 * Get activity statistics from MongoDB activity log
 */
export async function getActivityStats(req, res) {
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
}

/**
 * Get connection statistics
 */
export async function getConnectionStats(req, res) {
  try {
    const { email } = req.query;

    let stats = {
      total: 0,
      pending: 0,
      accepted: 0,
      directMessaged: 0,
      messaged: 0
    };

    // Get from MongoDB if email provided
    if (email) {
      const activities = await Activity.find({
        linkedinUsername: email,
        action: 'connection_requested'
      });

      stats.total = activities.length;
      stats.pending = activities.filter(a => a.status === 'pending').length;
      stats.accepted = activities.filter(a => a.status === 'accepted').length;
      stats.directMessaged = activities.filter(a => a.status === 'direct_messaged').length;
      stats.messaged = activities.filter(a => a.status === 'messaged').length;
    }

    // Get CSV stats
    let csvStats = {};
    if (email) {
      csvStats = await csvService.getUserStats(email);
    }

    res.json({
      success: true,
      data: {
        ...stats,
        ...csvStats,
        acceptanceRate: stats.total > 0 ? ((stats.accepted / stats.total) * 100).toFixed(2) + '%' : '0%'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get engagement statistics
 */
export async function getEngagementStats(req, res) {
  try {
    const { email } = req.query;
    const stats = await getStats();
    
    let csvStats = {};
    if (email) {
      csvStats = await csvService.getUserStats(email);
    }
    
    const engagementRate = stats.total > 0 
      ? ((stats.likes + stats.comments) / stats.total * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        ...stats,
        ...csvStats,
        engagementRate: `${engagementRate}%`,
        avgLikesPerPost: stats.total > 0 ? (stats.likes / stats.total).toFixed(2) : 0,
        avgCommentsPerPost: stats.total > 0 ? (stats.comments / stats.total).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get recent activity
 */
export async function getRecentActivity(req, res) {
  try {
    const { email, limit = 50 } = req.query;

    let activities = [];

    if (email) {
      activities = await Activity.find({
        linkedinUsername: email
      })
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .lean();
    }

    res.json({
      success: true,
      data: activities,
      count: activities.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get pending connections
 */
export async function getPendingConnections(req, res) {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const pending = await Activity.find({
      linkedinUsername: email,
      action: 'connection_requested',
      status: { $ne: 'accepted' }
    })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: pending,
      count: pending.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get accepted connections (not yet messaged)
 */
export async function getAcceptedConnections(req, res) {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const accepted = await Activity.find({
      linkedinUsername: email,
      action: 'connection_requested',
      status: 'accepted'
    })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: accepted,
      count: accepted.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get connection history
 */
export async function getConnectionHistory(req, res) {
  try {
    const { email, limit = 100 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const history = await Activity.find({
      linkedinUsername: email,
      action: 'connection_requested'
    })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get CSV statistics (NEW)
 */
export async function getCSVStats(req, res) {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const csvStats = await csvService.getUserStats(email);
    const userCSVPaths = await csvService.getUserCSVPaths(email);
    
    res.json({
      success: true,
      data: {
        stats: csvStats,
        paths: userCSVPaths?.csv_paths || {}
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get CSV file data (NEW)
 */
export async function getCSVData(req, res) {
  try {
    const { email, fileType } = req.query;
    
    if (!email || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Email and fileType are required'
      });
    }

    const data = await csvService.readCSVFile(email, fileType);
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      fileType: fileType
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Download CSV file (NEW)
 */
export async function downloadCSV(req, res) {
  try {
    const { email, fileType } = req.query;
    
    if (!email || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Email and fileType are required'
      });
    }

    const userDir = csvService.getUserCSVDirectory(email);
    const filePath = `${userDir}/${fileType}.csv`;
    
    const fs = await import('fs');
    
    if (!fs.default.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'CSV file not found'
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileType}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get all CSV paths for user (NEW)
 */
export async function getUserCSVPaths(req, res) {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const userCSVPaths = await csvService.getUserCSVPaths(email);
    
    res.json({
      success: true,
      data: userCSVPaths || {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get CSV analytics (NEW)
 */
export async function getCSVAnalytics(req, res) {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get all CSV data
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
          ? (likes.reduce((sum, l) => sum + parseFloat(l.likeScore || 0), 0) / likes.length).toFixed(1)
          : 0,
        avgCommentScore: comments.length > 0
          ? (comments.reduce((sum, c) => sum + parseFloat(c.commentScore || 0), 0) / comments.length).toFixed(1)
          : 0
      },
      connections: {
        totalConnections: connections.length,
        sentStatus: connections.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {})
      },
      messages: {
        totalMessages: messages.length,
        sentStatus: messages.reduce((acc, m) => {
          acc[m.status] = (acc[m.status] || 0) + 1;
          return acc;
        }, {})
      }
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
