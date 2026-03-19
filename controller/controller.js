const { User, Event } = require("../models/models");
const { generateUserQRCode } = require("../utils/qrCodeService");
const shortid = require("shortid");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const qr = require("qr-image");
const bcrypt = require("bcrypt");

async function login(req, res) {
  try {
    const email = req.body.email ? String(req.body.email).toLowerCase().trim() : '';
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password exists (critical check)
    if (!user.password) {
      console.error(`Login failed: User ${user.email} has no password set.`);
      return res.status(401).json({
        success: false,
        message: 'Account has no password. Please contact support to reset it.'
      });
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(req.body.password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign({
      _id: user._id,
      email: user.email,
      referral: user.referalID
    }, process.env.jwtkey);

    res.cookie("jwt", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: `Login failed: ${error.message}` // Expose error for debugging
    });
  }
}

async function signup(req, res) {
  try {
    // Remove plain-text password logging for security


    if (!req.body.email || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check password strength (optional but recommended)
    if (req.body.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const email = req.body.email ? String(req.body.email).toLowerCase().trim() : '';
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    // Hash the password with bcrypt
    const saltRounds = 12; // Higher salt rounds for better security
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    const referralID = shortid.generate();

    const newUser = await User.create({
      name: req.body.username,
      email: email,
      password: hashedPassword, // Store the hashed password
      referalID: referralID,
      referralCode: req.body.referralCode || ""
    });

    // Generate QR code as base64
    try {
      const qrCodeBase64 = await generateUserQRCode(newUser._id, {
        name: newUser.name,
        email: newUser.email
      });

      newUser.qrCode = `${newUser._id}`; // Keep for backward compatibility
      newUser.qrPath = `${newUser._id}`; // Keep for backward compatibility
      newUser.qrCodeBase64 = qrCodeBase64;
      await newUser.save();

      console.log(`✅ QR code generated as base64 for new user: ${newUser._id}`);
    } catch (qrError) {
      console.error('❌ QR code generation failed for new user:', qrError);
    }

    // Update referrer's count if referral code was provided
    if (req.body.referralCode) {
      await User.updateOne(
        { referalID: req.body.referralCode },
        { $inc: { referalcount: 1 } }
      );
    }

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        email: newUser.email,
        referalID: newUser.referalID,
        referalCode: req.body.referralCode || null
      }
    });

  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

async function logout(req, res) {
  try {
    // Clear the JWT cookie
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

async function register(req, res) {
  // This function is a stub - registration is handled by the /register route in index.js
  return res.status(404).json({
    success: false,
    message: 'Use the /register endpoint directly'
  });
}

module.exports = { login, signup, logout, register };