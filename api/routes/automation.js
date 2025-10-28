import express from 'express';
import { 
  startFeedEngagement,
  startConnectionRequests,
  startMonitorConnections,
  startWelcomeMessages,
  startSearchEngagement,
  startProfileScraping,
  getJobStatus,
  stopJob
} from '../controllers/automationController.js';

const router = express.Router();

// Start automations
router.post('/feed-engagement/start', startFeedEngagement);
router.post('/connection-requests/start', startConnectionRequests);
router.post('/monitor-connections/start', startMonitorConnections);
router.post('/welcome-messages/start', startWelcomeMessages);
router.post('/search-engagement/start', startSearchEngagement);
router.post('/profile-scraping/start', startProfileScraping);

// Job management
router.get('/job/:jobId/status', getJobStatus);
router.post('/job/:jobId/stop', stopJob);

export default router;
