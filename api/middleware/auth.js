import jwt from 'jsonwebtoken';
import User from '../../models/User.js';

export async function authMiddleware(req, res, next) {
  try {
    // Check for API key (for backward compatibility)
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (apiKey && apiKey === process.env.API_KEY) {
      // For API key auth, create a dummy user
      // You might want to create a system user in your database for this
      req.user = { id: 'system', email: 'system@localhost' };
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
        error: 'Not authorized - No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Not authorized - Invalid token'
    });
  }
}
