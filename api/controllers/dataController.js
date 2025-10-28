import ScrapedProfile from '../../models/ScrapedProfile.js';
import Connection from '../../models/Connection.js';
import { getAllSheetUrls } from '../../config/sheetUrls.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get all sheet URLs
export async function getSheetUrls(req, res) {
  try {
    const urls = getAllSheetUrls();
    
    res.json({
      success: true,
      data: urls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get scraped profiles from MongoDB
export async function getScrapedProfiles(req, res) {
  try {
    const { keyword, limit = 100, page = 1 } = req.query;
    const userId = req.user.id;

    const query = { scrapedBy: userId };
    if (keyword) {
      query.searchKeyword = new RegExp(keyword, 'i');
    }

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

// Get connections from MongoDB
export async function getConnections(req, res) {
  try {
    const { status, limit = 100, page = 1 } = req.query;
    const userId = req.user.id;

    const query = { userId };
    if (status) {
      query.status = status;
    }

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

// Get activity log
export async function getActivityLog(req, res) {
  try {
    const { limit = 50 } = req.query;
    
    const logPath = path.join(__dirname, '../../activity-log.json');
    
    if (!fs.existsSync(logPath)) {
      return res.json({
        success: true,
        data: []
      });
    }

    const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    const activities = logData.activities || [];

    // Return latest activities
    const recent = activities.slice(-parseInt(limit)).reverse();

    res.json({
      success: true,
      data: recent,
      total: activities.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get connection statistics
export async function getConnectionStats(req, res) {
  try {
    const userId = req.user.id;

    const [total, pending, accepted, directMessaged, messaged] = await Promise.all([
      Connection.countDocuments({ userId }),
      Connection.countDocuments({ userId, status: 'Pending' }),
      Connection.countDocuments({ userId, status: 'Accepted' }),
      Connection.countDocuments({ userId, status: 'Direct Messaged' }),
      Connection.countDocuments({ userId, messageSent: true })
    ]);

    res.json({
      success: true,
      data: {
        total,
        pending,
        accepted,
        directMessaged,
        messaged,
        acceptanceRate: total > 0 ? ((accepted / total) * 100).toFixed(2) + '%' : '0%'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get profile statistics
export async function getProfileStats(req, res) {
  try {
    const userId = req.user.id;

    const total = await ScrapedProfile.countDocuments({ scrapedBy: userId });

    // Get breakdown by keyword
    const byKeyword = await ScrapedProfile.aggregate([
      { $match: { scrapedBy: userId } },
      { $group: { _id: '$searchKeyword', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        total,
        byKeyword: byKeyword.map(k => ({ keyword: k._id, count: k.count }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get dashboard summary
export async function getDashboardSummary(req, res) {
  try {
    const userId = req.user.id;

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

    res.json({
      success: true,
      data: {
        stats: {
          totalProfiles,
          totalConnections,
          pendingConnections,
          acceptedConnections
        },
        recent: {
          profiles: recentProfiles,
          connections: recentConnections
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
