const jwt = require("jsonwebtoken");
const { User } = require("../models/models");

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    // Accept either 'jwt' (local login) or 'token' (Google login) cookie names
    const token = req.cookies.jwt || req.cookies.token;
    console.log(token);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    const decoded = jwt.verify(token, process.env.jwtkey);
    console.log(decoded);
    // Fetch user data
    const user = await User.findById(decoded._id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User not found."
      });
    }
    console.log(user);

    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token."
    });
  }
};

// Middleware to verify admin access
const verifyAdmin = async (req, res, next) => {
  try {
    // Accept either 'jwt' (local login) or 'token' (Google login) cookie names
    const token = req.cookies.jwt || req.cookies.token;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided."
      });
    }

    const decoded = jwt.verify(token, process.env.jwtkey);
    
    // Fetch user data
    const user = await User.findById(decoded._id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User not found."
      });
    }

    // Check if user has admin privileges
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required."
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token."
    });
  }
};

module.exports = { verifyToken, verifyAdmin };
