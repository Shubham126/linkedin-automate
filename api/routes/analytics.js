// ==================== FILE: backend/api/routes/analytics.js (UPDATED) ====================
import express from 'express';
import {
  getActivityStats,
  getConnectionStats,
  getEngagementStats,
  getRecentActivity,
  getPendingConnections,
  getAcceptedConnections,
  getConnectionHistory,
  getCSVStats,
  getCSVData,
  downloadCSV,
  getUserCSVPaths,
  getCSVAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

// Activity stats
router.get('/activity-stats', getActivityStats);
router.post('/activity-stats', getActivityStats);

// Connection stats
router.get('/connection-stats', getConnectionStats);
router.post('/connection-stats', getConnectionStats);

// Engagement stats
router.get('/engagement-stats', getEngagementStats);
router.post('/engagement-stats', getEngagementStats);

// Recent activity
router.get('/recent-activity', getRecentActivity);
router.post('/recent-activity', getRecentActivity);

// Connection details
router.get('/pending', getPendingConnections);
router.post('/pending', getPendingConnections);

router.get('/accepted', getAcceptedConnections);
router.post('/accepted', getAcceptedConnections);

router.get('/history', getConnectionHistory);
router.post('/history', getConnectionHistory);

// CSV endpoints
router.get('/csv-stats', getCSVStats);
router.post('/csv-stats', getCSVStats);

router.get('/csv-data', getCSVData);
router.post('/csv-data', getCSVData);

router.get('/csv-download', downloadCSV);
router.get('/csv-paths', getUserCSVPaths);

router.get('/csv-analytics', getCSVAnalytics);

export default router;
