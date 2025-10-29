import express from 'express';
import ScrapedProfile from '../../models/ScrapedProfile.js';
import Connection from '../../models/Connection.js';
import Message from '../../models/Message.js';
import { getAllSheetUrls } from '../../config/sheetUrls.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ==================== GET ALL SHEET URLS ====================
router.get('/sheet-urls', async (req, res) => {
  try {
    const urls = getAllSheetUrls();
    res.json({ success: true, data: urls });
  } catch (error) {
    console.error('Error getting sheet URLs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sheet-urls', async (req, res) => {
  try {
    const urls = getAllSheetUrls();
    res.json({ success: true, data: urls });
  } catch (error) {
    console.error('Error getting sheet URLs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET SCRAPED PROFILES ====================
router.get('/profiles', async (req, res) => {
  try {
    const { keyword, limit = 20, page = 1 } = req.query;

    const query = {};
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
    console.error('Error fetching profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const { keyword, limit = 20, page = 1 } = req.body;

    const query = {};
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
    console.error('Error fetching profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET CONNECTIONS ====================
router.get('/connections', async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;

    const query = {};
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
    console.error('Error fetching connections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/connections', async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.body;

    const query = {};
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
    console.error('Error fetching connections:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET MESSAGES ====================
router.get('/messages', async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;

    const query = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ sentDate: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Message.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.body;

    const query = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ sentDate: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Message.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET STATISTICS ====================
router.get('/stats', async (req, res) => {
  try {
    const [
      totalProfiles,
      totalConnections,
      totalMessages,
      pendingConnections,
      acceptedConnections,
      messagesWithReply
    ] = await Promise.all([
      ScrapedProfile.countDocuments(),
      Connection.countDocuments(),
      Message.countDocuments(),
      Connection.countDocuments({ status: 'Pending' }),
      Connection.countDocuments({ status: 'Accepted' }),
      Message.countDocuments({ replyReceived: true })
    ]);

    let totalActivities = 0;
    const logPath = path.join(__dirname, '../../activity-log.json');
    if (fs.existsSync(logPath)) {
      const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      totalActivities = (logData.activities || []).length;
    }

    res.json({
      success: true,
      data: {
        totalProfiles,
        totalConnections,
        totalMessages,
        pendingConnections,
        acceptedConnections,
        messagesWithReply,
        totalActivities,
        totalSheets: 6,
        acceptanceRate: totalConnections > 0 
          ? `${((acceptedConnections / totalConnections) * 100).toFixed(1)}%` 
          : '0%'
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/stats', async (req, res) => {
  try {
    const [
      totalProfiles,
      totalConnections,
      totalMessages,
      pendingConnections,
      acceptedConnections,
      messagesWithReply
    ] = await Promise.all([
      ScrapedProfile.countDocuments(),
      Connection.countDocuments(),
      Message.countDocuments(),
      Connection.countDocuments({ status: 'Pending' }),
      Connection.countDocuments({ status: 'Accepted' }),
      Message.countDocuments({ replyReceived: true })
    ]);

    let totalActivities = 0;
    const logPath = path.join(__dirname, '../../activity-log.json');
    if (fs.existsSync(logPath)) {
      const logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      totalActivities = (logData.activities || []).length;
    }

    res.json({
      success: true,
      data: {
        totalProfiles,
        totalConnections,
        totalMessages,
        pendingConnections,
        acceptedConnections,
        messagesWithReply,
        totalActivities,
        totalSheets: 6,
        acceptanceRate: totalConnections > 0 
          ? `${((acceptedConnections / totalConnections) * 100).toFixed(1)}%` 
          : '0%'
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
