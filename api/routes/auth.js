import express from 'express';
import {
  loginAndSaveCookies, 
  checkLoginStatus, 
  logoutAndClearCookies 
} from '../controllers/authController.js';

const router = express.Router();

// Login and save cookies
router.post('/linkedin/login', loginAndSaveCookies);

// Check if logged in
router.post('/linkedin/status', checkLoginStatus);

// Logout and clear cookies
router.post('/linkedin/logout', logoutAndClearCookies);

export default router;
