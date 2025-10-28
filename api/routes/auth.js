import express from 'express';
import {
  register,
  login,
  getCurrentUser,
  updateUser,
  changePassword
} from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);
router.put('/update', authMiddleware, updateUser);
router.put('/change-password', authMiddleware, changePassword);

export default router;
