import express from 'express';
import { 
  getPendingConnections,
  getAcceptedConnections,
  getConnectionHistory
} from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/pending', getPendingConnections);
router.get('/accepted', getAcceptedConnections);
router.get('/history', getConnectionHistory);

export default router;
