require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require('body-parser');
const { login, signup, logout } = require("./controller/controller");
const { verifyAdmin } = require("./middleware/auth");
const apirouter = require("./routes/api");
const cookieparser = require("cookie-parser");
const adminrouter = require("./routes/admin");
const path = require('path');
const jwt = require("jsonwebtoken");
const shortid = require("shortid");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { User, TeamComposition, Purchase, Event } = require("./models/models");
const { generateUserQRCode } = require("./utils/qrCodeService");
const { router: paymentRouter } = require("./routes/cashfree_simple");

const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;

const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

// Connect to MongoDB
mongoose.connect(process.env.mongodb).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.log("Error connecting to MongoDB", err);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply General Rate Limiter to all requests
app.use(generalLimiter);


// Health Check Route (for Railway)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Request logging removed for brevity

// CORS configuration
const allowedOrigins = [
  'https://sabrang.jklu.edu.in',
  'https://spardha.jklu.edu.in',
  'https://www.spardha.jklu.edu.in',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://localhost:3000',
  'https://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://127.0.0.1:3000',
  'https://127.0.0.1:3001'
];

// Add origins from environment variable if provided
if (process.env.ALLOWED_ORIGINS) {
  const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  allowedOrigins.push(...envOrigins);
}

// Always allow Vercel deployments (both development and production patterns)
allowedOrigins.push(/^https:\/\/.*\.vercel\.app$/);
allowedOrigins.push(/^https:\/\/sabrang.*\.vercel\.app$/);
allowedOrigins.push(/^https:\/\/.*\.up\.railway\.app$/);

// Add development patterns
if (process.env.NODE_ENV !== 'production') {
  // Allow any localhost port for development
  allowedOrigins.push(/^http:\/\/localhost:\d+$/);
  allowedOrigins.push(/^https:\/\/localhost:\d+$/);
  allowedOrigins.push(/^http:\/\/127\.0\.0\.1:\d+$/);
  allowedOrigins.push(/^https:\/\/127\.0\.0\.1:\d+$/);
  // Allow Railway preview URLs  
  allowedOrigins.push(/^https:\/\/.*\.up\.railway\.app$/);
}

// CORS logging removed for brevity

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or matches patterns
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      console.log(`✅ CORS: Allowed origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS: Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieparser());

// Dynamically generate and serve Excel export - PROTECTED
app.get('/public/registrations_export.xlsx', verifyAdmin, async (req, res) => {
  try {
    const { generateExcelReport } = require('./utils/excelExport');
    const outputPath = path.join(__dirname, 'public', 'registrations_export.xlsx');

    if (!fs.existsSync(path.join(__dirname, 'public'))) {
      fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
    }

    await generateExcelReport(outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error('Error generating excel on the fly:', err);
    res.status(500).send('Error generating Excel file');
  }
});

app.get('/uploads/registrations_export.xlsx', verifyAdmin, async (req, res) => {
  try {
    const { generateExcelReport } = require('./utils/excelExport');
    const outputPath = process.env.NODE_ENV === 'production'
      ? '/app/uploads/registrations_export.xlsx'
      : path.join(__dirname, 'public', 'registrations_export.xlsx');

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await generateExcelReport(outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error('Error generating excel on the fly:', err);
    res.status(500).send('Error generating Excel file');
  }
});

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve uploaded files from Railway volume in production, fallback to local in development
if (process.env.NODE_ENV === 'production') {
  app.use('/uploads', express.static('/app/uploads'));
  console.log('📁 Serving uploaded files from Railway volume: /app/uploads');
} else {
  app.use('/uploads', express.static(path.join(__dirname, 'public/profile')));
  console.log('📁 Serving uploaded files from local directory: public/profile');
}

// QR codes are served through secure API endpoint /api/qrcode/:id only
// Direct file serving removed for security - payment verification required
console.log('� QR codes secured - accessible only via /api/qrcode/:id after payment verification');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use Railway volume for production, local directory for development
    let uploadPath;
    if (process.env.NODE_ENV === 'production') {
      uploadPath = '/app/uploads'; // Railway persistent volume
    } else {
      uploadPath = path.join(__dirname, 'public', 'profile'); // Local development
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      console.log(`📁 Created upload directory: ${uploadPath}`);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate safe, short filename (Windows-safe: avoid special chars/length from fieldname)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname || '') || '.png';
    // Use a compact base derived from fieldname, but sanitized and truncated
    const baseFromField = (file.fieldname || 'upload')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24) || 'upload';
    const prefix = baseFromField.startsWith('memberImage') ? 'memberImage' : (baseFromField || 'upload');
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Routes - Add extensive logging
app.get("/", (req, res) => {
  console.log(`📥 Root route accessed - ${req.method} ${req.path}`);
  console.log(`📡 Headers:`, req.headers);
  console.log(`🌐 IP:`, req.ip);
  console.log(`🔗 Protocol:`, req.protocol);

  const response = {
    message: "API Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    serverInfo: {
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      version: process.version
    }
  };

  console.log(`📤 Sending response:`, response);
  res.json(response);
});

// Health check endpoint - should respond quickly
app.get("/health", (req, res) => {
  console.log(`📥 Health check accessed - ${req.method} ${req.path}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  const response = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  };
  console.log(`📤 Health response:`, response);
  res.json(response);
});

// Add a simple test route
app.get("/ping", (req, res) => {
  console.log(`📥 Ping accessed - ${req.method} ${req.path}`);
  res.send("pong");
});

// CORS debug endpoint
app.get("/cors-debug", (req, res) => {
  const origin = req.get('Origin');
  console.log(`📥 CORS Debug - Origin: ${origin}`);

  res.json({
    message: "CORS Debug Info",
    requestOrigin: origin,
    userAgent: req.get('User-Agent'),
    method: req.method,
    headers: {
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      host: req.get('Host'),
      'access-control-request-method': req.get('Access-Control-Request-Method'),
      'access-control-request-headers': req.get('Access-Control-Request-Headers')
    },
    corsConfiguration: {
      allowedStaticOrigins: allowedOrigins.filter(o => typeof o === 'string'),
      regexPatterns: allowedOrigins.filter(o => o instanceof RegExp).map(r => r.toString()),
      environmentOrigins: process.env.ALLOWED_ORIGINS
    },
    timestamp: new Date().toISOString()
  });
});

// Simple connectivity test endpoint (no CORS restrictions)
app.get("/connectivity-test", (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.json({
    status: "Backend is reachable",
    timestamp: new Date().toISOString(),
    serverTime: new Date().toLocaleString(),
    region: process.env.RAILWAY_REGION || 'unknown',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Helper route to get server IP for Cashfree Whitelisting - PROTECTED
const axios = require('axios');
app.get("/server-ip", verifyAdmin, async (req, res) => {
  try {
    console.log("Fetching server public IP...");
    const response = await axios.get('https://api.ipify.org?format=json');
    console.log("Server IP:", response.data.ip);
    res.json({
      ip: response.data.ip,
      message: "Add this IP to your Cashfree IP Whitelist"
    });
  } catch (error) {
    console.error("Error fetching IP:", error.message);
    res.status(500).json({ error: "Failed to fetch IP", details: error.message });
  }
});

// Public routes (no authentication required)
app.post("/login", authLimiter, (req, res, next) => {
  console.log(`📥 Login attempt from: ${req.get('Origin')}`);
  console.log(`📝 Login data:`, { email: req.body.email, hasPassword: !!req.body.password });
  next();
}, login);

app.post("/signup", authLimiter, (req, res, next) => {
  console.log(`📥 Signup attempt from: ${req.get('Origin')}`);
  console.log(`📝 Signup data:`, {
    email: req.body.email,
    username: req.body.username,
    hasPassword: !!req.body.password
  });
  next();
}, signup);

app.post("/logout", logout);

// Register route with image upload - NEW TEAM-BASED SYSTEM
app.post("/register", authLimiter, upload.any(), async (req, res) => {
  try {
    // Simplified Registration Logic for Spardha
    console.log("Spardha Registration - Standard Flow");
    const raw = req.body || {};

    // Parse form data
    let items = [];
    try { if (raw.items) items = JSON.parse(raw.items); } catch (e) { }

    const mainPersonName = raw.name;
    const mainPersonEmail = raw.email ? String(raw.email).toLowerCase().trim() : null;
    const password = raw.password;
    const mainPersonContactNo = raw.contactNo;
    const mainPersonGender = raw.gender;
    const mainPersonUniversity = raw.universityName;
    const mainPersonAddress = raw.address;
    const mainPersonAge = raw.age && raw.age !== "" ? Number(raw.age) : null;
    const mainPersonUniversityIdCard = raw.universityIdCard || "";
    const mainPersonReferralCode = raw.referralCode || "";

    if (!mainPersonEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Check if main person already exists
    let mainPerson = await User.findOne({ email: mainPersonEmail });

    // Create new user if not exists
    if (!mainPerson) {
      const hashedPassword = await bcrypt.hash(password || Math.random().toString(36), 12);
      mainPerson = new User({
        name: mainPersonName,
        email: mainPersonEmail,
        contactNo: mainPersonContactNo,
        gender: mainPersonGender,
        age: mainPersonAge,
        universityName: mainPersonUniversity,
        address: mainPersonAddress,
        universityIdCard: mainPersonUniversityIdCard,
        referralCode: mainPersonReferralCode,
        password: hashedPassword,
        events: items.map(i => i.title), // Store event names
        isvalidated: true
      });
      await mainPerson.save();
    } else {
      // Update existing user with provided details and events
      if (mainPersonName) mainPerson.name = mainPersonName;
      if (mainPersonContactNo) mainPerson.contactNo = mainPersonContactNo;
      if (mainPersonGender) mainPerson.gender = mainPersonGender;
      if (mainPersonUniversity) mainPerson.universityName = mainPersonUniversity;
      if (mainPersonAddress) mainPerson.address = mainPersonAddress;
      if (mainPersonAge !== null) mainPerson.age = mainPersonAge;
      if (mainPersonUniversityIdCard) mainPerson.universityIdCard = mainPersonUniversityIdCard;
      if (mainPersonReferralCode) mainPerson.referralCode = mainPersonReferralCode;
      
      mainPerson.isvalidated = true; // Mark as validated when they complete registration

      const newEvents = items.map(i => i.title);
      // Add only unique new events
      const uniqueEvents = [...new Set([...(mainPerson.events || []), ...newEvents])];
      mainPerson.events = uniqueEvents;
      
      await mainPerson.save();
    }

    // Handle Team Members (Simplified)
    // Expecting teamMembers to be a flat array of objects if passed
    // For now, we'll assume the frontend sends a structured list if needed, 
    // but the Sabrang logic was very specific to its wizard. 
    // We will trust the main person registration for now and add team logic later if specific strictly needed here.
    // The Sabrang wizard handled team members by signature. 
    // We'll keep it simple: just register the main user and their events.
    // Team management can be done via separate endpoints or improved later.

    console.log(`✅ User registered: ${mainPerson.email}`);

    // Create Purchase Record
    const purchase = new Purchase({
      orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: mainPerson._id,
      items: items.map(i => ({
        type: 'event',
        itemId: i.id,
        itemName: i.title,
        price: i.price
      })),
      totalAmount: items.reduce((sum, i) => sum + i.price, 0),
      subtotal: items.reduce((sum, i) => sum + i.price, 0), // Required by schema
      paymentStatus: 'pending', // Pending payment
      userDetails: {
        name: mainPersonName,
        email: mainPersonEmail,
        contactNo: mainPersonContactNo,
        gender: mainPersonGender,
        age: mainPersonAge,
        universityName: mainPersonUniversity,
        address: mainPersonAddress,
        universityIdCard: mainPersonUniversityIdCard,
        referralCode: mainPersonReferralCode,
        formData: raw,
        teamMembers: raw.teamMembers ? (typeof raw.teamMembers === 'string' ? JSON.parse(raw.teamMembers) : raw.teamMembers) : null
      }
    });
    await purchase.save();

    res.json({
      success: true,
      message: "Registration successful. Please proceed to payment.",
      orderId: purchase.orderId,
      user: mainPerson
    });



  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});


// Protected routes (authentication required)
// Apply stricter rate limits to sensitive routes if needed (e.g., auth routes)
app.use("/api", apirouter); // This might be the auth router, or a general API router
app.use("/admin", adminrouter);

// Payment routes
app.use("/api/payments", paymentRouter);


// Google Authentication removed as per user request to avoid dependency on missing credentials











// Fallback for payment success if the gateway redirects to backend instead of frontend
app.get('/payment/success', (req, res) => {
  const orderId = req.query.order_id;
  const frontendUrl = process.env.FRONTEND_URL || 'https://spardha.jklu.edu.in';
  console.log(`🔀 Redirecting payment success to frontend: ${frontendUrl}/payment/success?order_id=${orderId}`);
  res.redirect(`${frontendUrl}/payment/success?order_id=${orderId}`);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path
  });
});

// Convenience redirect for Admin Dashboard
app.get('/admin.html', (req, res) => {
  res.redirect('/public/admin.html');
});

// Helper redirect since user sometimes types it
app.get('/admin-users.html', (req, res) => {
  res.redirect('/public/admin-users.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB."
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  // Handle other errors
  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: "Only image files are allowed"
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// Environment debug logging removed for brevity

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
  // Optional: Graceful shutdown or process exit if critical
  // process.exit(1);
});

// Start server with additional error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
  console.log(`✅ Server ready to accept connections`);

  // Get the actual address the server is listening on
  const address = server.address();
  console.log(`🎯 Server address:`, address);

  // Test that routes are working
  console.log('🧪 Testing server responsiveness...');
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});
