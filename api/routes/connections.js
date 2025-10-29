import express from 'express';
import { 
  getPendingConnections,
  getAcceptedConnections,
  getConnectionHistory
} from '../controllers/analyticsController.js';

const router = express.Router();

// Support both GET and POST
router.get('/pending', getPendingConnections);
router.post('/pending', getPendingConnections);  // ← ADD

router.get('/accepted', getAcceptedConnections);
router.post('/accepted', getAcceptedConnections);  // ← ADD

router.get('/history', getConnectionHistory);
router.post('/history', getConnectionHistory);  // ← ADD

export default router;
