import express from 'express';
import { 
  getActivityStats,
  getConnectionStats,
  getEngagementStats,
  getRecentActivity
} from '../controllers/analyticsController.js';

const router = express.Router();

// Support both GET and POST
router.get('/activity-stats', getActivityStats);
router.post('/activity-stats', getActivityStats);  // ← ADD

router.get('/connection-stats', getConnectionStats);
router.post('/connection-stats', getConnectionStats);  // ← ADD

router.get('/engagement-stats', getEngagementStats);
router.post('/engagement-stats', getEngagementStats);  // ← ADD

router.get('/recent-activity', getRecentActivity);
router.post('/recent-activity', getRecentActivity);  // ← ADD

export default router;
