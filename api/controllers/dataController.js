// ==================== FILE: backend/api/controllers/dataController.js ====================
import csvService from '../../services/csvService.js';
import ScrapedProfile from '../../models/ScrapedProfile.js';
import Connection from '../../models/Connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get scraped profiles from MongoDB
 */
export async function getScrapedProfiles(req, res) {
  try {
    const { keyword, limit = 100, page = 1 } = req.query;
    const userId = req.user?.id;

    const query = {};
    if (userId) query.scrapedBy = userId;
    if (keyword) query.searchKeyword = new RegExp(keyword, 'i');

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [profiles, total] = await Promise.all([
      ScrapedProfile.find(query)
        .sort({ scrapedDate: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      ScrapedProfile.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: profiles,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
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
 * Get connections from MongoDB
 */
export async function getConnections(req, res) {
  try {
    const { status, limit = 100, page = 1 } = req.query;
    const userId = req.user?.id;

    const query = {};
    if (userId) query.userId = userId;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [connections, total] = await Promise.all([
      Connection.find(query)
        .sort({ requestSentDate: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Connection.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: connections,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
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
 * Get activity log (NEW: From CSV)
 */
export async function getActivityLog(req, res) {
  try {
    const { email, fileType = 'engagement_likes', limit = 50 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get data from CSV
    const csvData = await csvService.readCSVFile(email, fileType);
    
    // Return latest records
    const recent = csvData.slice(-parseInt(limit)).reverse();

    res.json({
      success: true,
      data: recent,
      total: csvData.length,
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
 * Get connection statistics (NEW: Enhanced with CSV)
 */
export async function getConnectionStats(req, res) {
  try {
    const { email } = req.query;
    const userId = req.user?.id;

    let stats = {
      total: 0,
      pending: 0,
      accepted: 0,
      directMessaged: 0,
      messaged: 0
    };

    // Get from MongoDB if user ID available
    if (userId) {
      const [total, pending, accepted, directMessaged, messaged] = await Promise.all([
        Connection.countDocuments({ userId }),
        Connection.countDocuments({ userId, status: 'Pending' }),
        Connection.countDocuments({ userId, status: 'Accepted' }),
        Connection.countDocuments({ userId, status: 'Direct Messaged' }),
        Connection.countDocuments({ userId, messageSent: true })
      ]);

      stats = { total, pending, accepted, directMessaged, messaged };
    }

    // Get CSV stats if email provided
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
 * Get profile statistics (NEW: Enhanced with CSV)
 */
export async function getProfileStats(req, res) {
  try {
    const { email } = req.query;
    const userId = req.user?.id;

    let stats = {
      total: 0,
      byKeyword: []
    };

    // Get from MongoDB if user ID available
    if (userId) {
      const total = await ScrapedProfile.countDocuments({ scrapedBy: userId });

      const byKeyword = await ScrapedProfile.aggregate([
        { $match: { scrapedBy: userId } },
        { $group: { _id: '$searchKeyword', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);

      stats = {
        total,
        byKeyword: byKeyword.map(k => ({ keyword: k._id, count: k.count }))
      };
    }

    // Get CSV engagement stats if email provided
    let engagementStats = {};
    if (email) {
      engagementStats = await csvService.getUserStats(email);
    }

    res.json({
      success: true,
      data: {
        ...stats,
        engagement: engagementStats
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
 * Get dashboard summary (NEW: Enhanced with CSV)
 */
export async function getDashboardSummary(req, res) {
  try {
    const { email } = req.query;
    const userId = req.user?.id;

    let summary = {
      stats: {
        totalProfiles: 0,
        totalConnections: 0,
        pendingConnections: 0,
        acceptedConnections: 0
      },
      recent: {
        profiles: [],
        connections: []
      },
      csv: {
        likes: 0,
        comments: 0,
        connections: 0,
        messages: 0
      }
    };

    // Get from MongoDB if user ID available
    if (userId) {
      const [
        totalProfiles,
        totalConnections,
        pendingConnections,
        acceptedConnections,
        recentProfiles,
        recentConnections
      ] = await Promise.all([
        ScrapedProfile.countDocuments({ scrapedBy: userId }),
        Connection.countDocuments({ userId }),
        Connection.countDocuments({ userId, status: 'Pending' }),
        Connection.countDocuments({ userId, status: 'Accepted' }),
        ScrapedProfile.find({ scrapedBy: userId })
          .sort({ scrapedDate: -1 })
          .limit(5)
          .lean(),
        Connection.find({ userId })
          .sort({ requestSentDate: -1 })
          .limit(5)
          .lean()
      ]);

      summary.stats = {
        totalProfiles,
        totalConnections,
        pendingConnections,
        acceptedConnections
      };

      summary.recent = {
        profiles: recentProfiles,
        connections: recentConnections
      };
    }

    // Get CSV stats if email provided
    if (email) {
      const csvStats = await csvService.getUserStats(email);
      summary.csv = {
        likes: csvStats.total_engagement_likes || 0,
        comments: csvStats.total_engagement_comments || 0,
        connections: csvStats.total_connections_sent || 0,
        messages: csvStats.total_messages_sent || 0
      };
    }

    res.json({
      success: true,
      data: summary
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
      },
      timeline: {
        likesOverTime: groupByDate(likes),
        commentsOverTime: groupByDate(comments),
        connectionsOverTime: groupByDate(connections)
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

/**
 * Helper function to group records by date
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
