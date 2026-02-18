require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require('body-parser');
const { login, signup, logout } = require("./controller/controller");
const apirouter = require("./routes/api");
const cookieparser = require("cookie-parser");
const adminrouter = require("./routes/admin");
const path = require('path');
const jwt = require("jsonwebtoken");
const shortid = require("shortid"); // Add this line
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { User, TeamComposition, Purchase, Event } = require("./models/models");
const { generateUserQRCode } = require("./utils/qrCodeService");

const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;

// Connect to MongoDB with better error handling
const { MongoMemoryServer } = require('mongodb-memory-server');

// Connect to MongoDB with better error handling and in-memory fallback
const connectDB = async () => {
  try {
    const mongoUri = process.env.mongodb || 'mongodb://localhost:27017/spardha';
    console.log(`🔌 Attempting to connect to MongoDB at ${mongoUri}...`);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Database Connected Successfully (Local/Cloud)");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);

    // Fallback to In-Memory Database
    console.log("⚠️ Falling back to In-Memory Database for testing...");
    try {
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log(`✅ In-Memory Database Connected Successfully at ${uri}`);
      console.log("📝 Note: Data will be lost when the server restarts.");
    } catch (memErr) {
      console.error("❌ In-Memory Database Error:", memErr);
    }
  }
};

// Connect to database
connectDB();

// Middleware
app.use((req, res, next) => {
  console.log(`DEBUG REQUEST: ${req.method} ${req.path}`);
  next();
});
app.use(cookieparser());

// Add request timeout middleware to prevent hanging requests
app.use((req, res, next) => {
  // Set timeout for all requests (30 seconds)
  req.setTimeout(30000, () => {
    console.log(`⏰ Request timeout: ${req.method} ${req.path}`);
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout. Please try again.',
        error: 'REQUEST_TIMEOUT'
      });
    }
  });

  res.setTimeout(30000, () => {
    console.log(`⏰ Response timeout: ${req.method} ${req.path}`);
  });

  next();
});

// Request logging removed for brevity

// CORS configuration
const allowedOrigins = [
  'https://sabrang.jklu.edu.in',
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

// Public routes (no authentication required)
app.post("/login", (req, res, next) => {
  console.log(`📥 Login attempt from: ${req.get('Origin')}`);
  console.log(`📝 Login data:`, { email: req.body.email, hasPassword: !!req.body.password });
  next();
}, login);

app.post("/signup", (req, res, next) => {
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
app.post("/register", upload.any(), async (req, res) => {
  try {
    // Simplified Registration Logic for Spardha
    console.log("Spardha Registration - Standard Flow");
    const raw = req.body || {};

    // Parse form data
    let items = [];
    try { if (raw.items) items = JSON.parse(raw.items); } catch (e) { }

    const mainPersonName = raw.name;
    const mainPersonEmail = raw.email;
    const password = raw.password;
    const mainPersonContactNo = raw.contactNo;
    const mainPersonGender = raw.gender;
    const mainPersonUniversity = raw.universityName;
    const mainPersonAddress = raw.address;

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
        universityName: mainPersonUniversity,
        address: mainPersonAddress,
        password: hashedPassword,
        events: items.map(i => i.title), // Store event names
        isvalidated: true
      });
      await mainPerson.save();
    } else {
      // Update existing user events
      const newEvents = items.map(i => i.title);
      // Add only unique new events
      const uniqueEvents = [...new Set([...mainPerson.events, ...newEvents])];
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
        contactNo: mainPersonContactNo
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
app.use("/api", apirouter);
app.use("/admin", adminrouter);

// Payment routes
const paymentRouter = require("./routes/cashfree_simple");
app.use("/api/payments", paymentRouter);


//GOOGLE AUTHENTICATION 
const passport = require("passport");
const session = require("express-session");
const { access } = require("fs");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

app.use(session({
  secret: "ayush",
  resave: false,
  saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.client,
  clientSecret: process.env.clientsecret,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Find existing user
    let user = await User.findOne({ email: profile.emails[0].value });

    if (!user) {
      // Import shortid at the top of the file if not already imported
      const shortid = require("shortid");

      // Generate referral ID
      const referralID = shortid.generate();

      // Create new user if doesn't exist
      user = new User({
        email: profile.emails[0].value,
        name: profile.displayName,
        referalID: referralID, // Add referral ID
      });
      await user.save();

      // QR code will be generated after payment verification
      console.log(`📝 Google OAuth user registered, QR code will be generated after payment verification: ${user._id}`);
      // Note: QR code generation moved to payment success handlers in routes/cashfree_simple.js and routes/direct_payment_new.js

      console.log('New user created with QR code:', user);
    }

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: false
  }),
  async (req, res) => {
    try {
      // Generate JWT token with user data
      const token = jwt.sign(
        {
          _id: req.user._id, // Changed from id to _id to match verification middleware
          email: req.user.email,
          name: req.user.name
        },
        process.env.jwtkey,
        { expiresIn: '1d' }
      );

      // Determine environment to set cookie options appropriately
      const isProduction = process.env.NODE_ENV === 'production';
      const isLocalFrontend = (process.env.frontendurl || '').includes('localhost');

      // Set the token as an HTTP-only cookie
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction && !isLocalFrontend ? true : false,
        sameSite: isProduction && !isLocalFrontend ? 'none' : 'lax',
        domain: isProduction && process.env.COOKIE_DOMAIN ? process.env.COOKIE_DOMAIN : undefined,
        path: '/',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      };
      console.log('Setting jwt cookie with options:', cookieOptions);
      res.cookie('jwt', token, cookieOptions);
      // Redirect to frontend with token
      res.redirect(`${process.env.frontendurl}/auth/callback?token=${token}`);
    } catch (err) {
      // Handle error
    }
  });

app.get("/success", (req, res) => {
  res.send(`Welcome ${req.user.displayName}`)
})










// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path
  });
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
