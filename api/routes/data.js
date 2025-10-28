import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Message from '../../models/Message.js';
import { getAllSheetUrls } from '../../config/sheetUrls.js';
import { getScrapedProfiles, getConnections, getMessages } from '../../services/dualStorageService.js';

const router = express.Router();

// Get all sheet URLs (separate URL for each sheet)
router.get('/sheet-urls', authMiddleware, async (req, res) => {
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
});

// Get scraped profiles from MongoDB
router.get('/profiles', authMiddleware, async (req, res) => {
  try {
    const { keyword, page = 1, limit = 50 } = req.query;
    const filters = {};
    if (keyword) filters.searchKeyword = new RegExp(keyword, 'i');

    const result = await getScrapedProfiles(req.user.id, filters, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get connections from MongoDB
router.get('/connections', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    const result = await getConnections(req.user.id, status, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get messages from MongoDB
router.get('/messages', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const result = await getMessages(req.user.id, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
