import jwt from 'jsonwebtoken';
import User from '../../models/User.js';

export async function authMiddleware(req, res, next) {
  try {
    // Check for API key (for backward compatibility)
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (apiKey && apiKey === process.env.API_KEY) {
      // API key authentication (legacy)
      return next();
    }

    // JWT authentication
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
}
