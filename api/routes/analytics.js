import express from 'express';
import { 
  getActivityStats,
  getConnectionStats,
  getEngagementStats,
  getRecentActivity
} from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/activity-stats', getActivityStats);
router.get('/connection-stats', getConnectionStats);
router.get('/engagement-stats', getEngagementStats);
router.get('/recent-activity', getRecentActivity);

export default router;
