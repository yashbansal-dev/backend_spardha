require("dotenv").config();
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { User, Event, TeamComposition, Purchase } = require("../models/models");
const { verifyToken,verifyAdmin } = require("../middleware/auth");
const { sendPaymentInitiatedEmail } = require("../utils/emailService");
const path = require('path');
const fs = require('fs');
const qr = require('qr-image');

// In-memory OTP storage (secure and simple without DB changes)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP for ticket access
router.post('/send-ticket-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists (team leader or individual)
    const user = await User.findOne({ 
      email: email.toLowerCase().trim()
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No registration found for this email address'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    // Store OTP in memory
    otpStore.set(email.toLowerCase().trim(), {
      otp,
      expiry: otpExpiry,
      attempts: 0
    });

    // Send OTP via email (without showing registered events for security)
    const emailResult = await sendPaymentInitiatedEmail({
      email: email.toLowerCase().trim(),
      name: user.name,
      otp: otp,
      events: [] // Don't show registered events in OTP email
    });

    if (emailResult.success) {
      console.log(`✅ OTP sent to ${email}: ${otp}`);
      res.json({
        success: true,
        message: 'OTP sent successfully to your email'
      });
    } else {
      // Remove OTP from store if email failed
      otpStore.delete(email.toLowerCase().trim());
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify OTP and return session token
router.post('/verify-ticket-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const emailKey = email.toLowerCase().trim();
    const storedOtpData = otpStore.get(emailKey);

    if (!storedOtpData) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP.'
      });
    }

    // Check expiry
    if (Date.now() > storedOtpData.expiry) {
      otpStore.delete(emailKey);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Check attempts (max 3 attempts)
    if (storedOtpData.attempts >= 3) {
      otpStore.delete(emailKey);
      return res.status(400).json({
        success: false,
        message: 'Maximum OTP attempts exceeded. Please request a new OTP.'
      });
    }

    // Verify OTP
    if (otp !== storedOtpData.otp) {
      storedOtpData.attempts++;
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${3 - storedOtpData.attempts} attempts remaining.`
      });
    }

    // OTP verified successfully
    otpStore.delete(emailKey);

    // Generate temporary access token (valid for 30 minutes)
    const tempToken = jwt.sign(
      { email: emailKey, purpose: 'ticket-access' },
      process.env.jwtkey || 'fallback-secret',
      { expiresIn: '30m' }
    );

    res.json({
      success: true,
      message: 'OTP verified successfully',
      accessToken: tempToken
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// QR code endpoint (publicly accessible)
router.get('/qrcode/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    // Find user by ID (unified schema - only one collection now)
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).send('User not found');
    }
    
    // Security check: Only serve QR codes for users with completed payments
    // Check if user has any completed purchases
    const completedPurchase = await Purchase.findOne({
      $or: [
        { userId: user._id },
        { mainPersonId: user._id },
        { 'userDetails.email': user.email }
      ],
      paymentStatus: 'completed'
    });
    
    if (!completedPurchase) {
      console.log(`❌ Access denied: No completed payment found for user ${user.email}`);
      return res.status(403).send('Access denied: Payment not completed');
    }
    
    // Check if QR code exists as base64
    if (user.qrCodeBase64) {
      res.type('png');
      res.send(Buffer.from(user.qrCodeBase64, 'base64'));
      return;
    }
    
    // Fallback to file system for backward compatibility
    const filename = `${id}.png`;
    const filePath = path.join(__dirname, '../public/qrcodes', filename);
    
    if (fs.existsSync(filePath)) {
      res.type('png');
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    
    return res.status(404).send('QR code not found');
  } catch (error) {
    console.error('Error serving QR code:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/profile/:id', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).send('User not found');
    }

    if (!user.profileImage) {
      return res.status(404).send('No profile image set for this user');
    }

    const filePath = path.join(__dirname, '..', user.profileImage);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Profile image file not found');
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error fetching profile image:', error);
    res.status(500).send('Server error');
  }
});





// Get user data (requires authentication) - UPDATED FOR UNIFIED USER SYSTEM
router.get("/user", verifyToken, async (req,res)=>{
    try{
    console.log(req.user);
    const user = req.user; // User is already available from verifyToken middleware
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const events = user.events;
    const eventData = [];
    for (i=0;i<events.length;i++){
      const info = await Event.findOne({name:events[i]});
      if (info) {
        eventData.push(info);
      }
    }

    // Get team compositions where this user is involved
    const teamCompositions = await TeamComposition.find({
      $or: [
        { 'teamLeader.userId': user._id },
        { 'teamMembers.userId': user._id }
      ]
    }).populate('teamLeader.userId teamMembers.userId');

    const data = {
      _id:user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage || "/images/default-avatar.jpg",
      qrPath:user.qrPath,
      qrCodeBase64: user.qrCodeBase64,
      registeredEvents: eventData,
      hasEntered: user.hasEntered,
      entryTime: user.entryTime,
      isAdmin: user.isAdmin,
      // Team-related fields from new schema
      teamRegistrations: user.teamRegistrations,
      registrationHistory: user.registrationHistory,
      // Team compositions this user is part of
      teamCompositions: teamCompositions.map(team => ({
        id: team._id,
        eventName: team.eventName,
        teamName: team.teamName,
        isLeader: team.teamLeader.userId.toString() === user._id.toString(),
        totalMembers: team.totalMembers,
        teamEntryStatus: team.teamEntryStatus
      }))
    }

    return res.send(data)
    }catch (e){
        return res.status(401).send({
            message:"unauthenticated"
        })
    }   
});

// Get public events (no authentication required)
router.get("/events", async (req, res) => {
  try {
    const events = await Event.find({});
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register for event (requires authentication)
router.post("/register-event", verifyToken, async (req, res) => {
  try {
    const { eventName } = req.body;
    const user = req.user;

    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: "Event name is required"
      });
    }

    // Check if event exists
    const event = await Event.findOne({ name: eventName });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    // Check if user is already registered
    if (user.events.includes(eventName)) {
      return res.status(400).json({
        success: false,
        message: "Already registered for this event"
      });
    }

    // Add event to user's events
    user.events.push(eventName);
    await user.save();

    res.json({
      success: true,
      message: "Successfully registered for event"
    });

  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// Get team details by team composition ID (accessible to authenticated users)
router.get('/team/:teamId', verifyToken, async (req, res) => {
  try {
    const teamId = req.params.teamId;
    
    // Find team composition by ID
    const teamComposition = await TeamComposition.findById(teamId)
      .populate('teamLeader.userId')
      .populate('teamMembers.userId');
      
    if (!teamComposition) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check if requesting user is the team leader or a team member or admin
    const isTeamLeader = teamComposition.teamLeader.userId._id.toString() === req.user._id.toString();
    const isTeamMember = teamComposition.teamMembers.some(member => 
      member.userId._id.toString() === req.user._id.toString()
    );
    
    if (!isTeamLeader && !isTeamMember && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get event data
    const eventInfo = await Event.findOne({ name: teamComposition.eventName });

    res.json({
      success: true,
      team: {
        teamId: teamComposition._id,
        eventName: teamComposition.eventName,
        teamName: teamComposition.teamName,
        eventInfo: eventInfo,
        teamLeader: {
          id: teamComposition.teamLeader.userId._id,
          name: teamComposition.teamLeader.name,
          email: teamComposition.teamLeader.email,
          hasEntered: teamComposition.teamLeader.hasEntered,
          entryTime: teamComposition.teamLeader.entryTime,
          qrPath: teamComposition.teamLeader.userId.qrPath,
          qrCodeBase64: teamComposition.teamLeader.userId.qrCodeBase64,
          profileImage: teamComposition.teamLeader.userId.profileImage
        },
        teamMembers: teamComposition.teamMembers.map(member => ({
          id: member.userId._id,
          name: member.name,
          email: member.email,
          hasEntered: member.hasEntered,
          entryTime: member.entryTime,
          role: member.role,
          // QR codes are properly fetched from populated User document
          qrPath: member.userId.qrPath,
          qrCodeBase64: member.userId.qrCodeBase64,
          profileImage: member.userId.profileImage
        })),
        totalMembers: teamComposition.totalMembers,
        teamEntryStatus: teamComposition.teamEntryStatus,
        registrationComplete: teamComposition.registrationComplete
      }
    });

  } catch (error) {
    console.error('Error fetching team details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get team data by team leader email (requires OTP verification) - UPDATED FOR UNIFIED SCHEMA
router.post('/team-by-email', async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Access token required. Please verify OTP first.'
      });
    }

    // Verify the temporary access token
    let email;
    try {
      const decoded = jwt.verify(accessToken, process.env.jwtkey || 'fallback-secret');
      if (decoded.purpose !== 'ticket-access') {
        throw new Error('Invalid token purpose');
      }
      email = decoded.email;
    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access token. Please verify OTP again.'
      });
    }

    // Find the user by email
    const user = await User.findOne({ 
      email: email.toLowerCase().trim()
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found for this email address'
      });
    }

    // Get team compositions where this user is either team leader OR team member
    const teamCompositions = await TeamComposition.find({
      $or: [
        { 'teamLeader.userId': user._id },
        { 'teamMembers.userId': user._id }
      ]
    }).populate('teamLeader.userId teamMembers.userId');

    // Get events data for user's registered events
    const events = user.events;
    const eventData = [];
    for (let i = 0; i < events.length; i++) {
      const info = await Event.findOne({ name: events[i] });
      if (info) {
        eventData.push(info);
      }
    }

    // Build registrations array in the format expected by frontend
    const registrations = [];
    let registrationCount = 1;

    // Check if user has individual registrations (events without teams)
    const teamEventNames = teamCompositions.map(team => team.eventName);
    const individualEvents = user.events.filter(eventName => !teamEventNames.includes(eventName));

    // Add individual registration if user has non-team events
    if (individualEvents.length > 0) {
      registrations.push({
        id: user._id,
        type: 'individual',
        registrationId: user._id,
        registrationDate: user.createdAt,
        registrationCount: registrationCount++,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo || '',
        gender: user.gender || '',
        age: user.age || 0,
        universityName: user.universityName || '',
        address: user.address || '',
        profileImage: user.profileImage || '',
        qrPath: user.qrPath,
        qrCodeBase64: user.qrCodeBase64,
        hasEntered: user.hasEntered,
        entryTime: user.entryTime,
        events: individualEvents,
        registeredEvents: eventData.filter(event => individualEvents.includes(event.name))
      });
    }

    // Add team registrations (either as leader or member)
    for (const teamComposition of teamCompositions) {
      // Check if the current user is the team leader
      const isTeamLeader = teamComposition.teamLeader.userId._id.toString() === user._id.toString();
      
      // Get team members data
      const teamMembers = await Promise.all(teamComposition.teamMembers.map(async (member) => {
        // Fetch the complete user data from the users collection to get QR codes
        const memberUser = await User.findById(member.userId);
        return {
          id: member.userId,
          name: member.name,
          email: member.email,
          contactNo: memberUser?.contactNo || '',
          gender: memberUser?.gender || '',
          age: memberUser?.age || 0,
          universityName: memberUser?.universityName || '',
          address: memberUser?.address || '',
          profileImage: memberUser?.profileImage || '',
          // Fetch QR codes from the actual User document in users collection
          qrPath: memberUser?.qrPath || '',
          qrCodeBase64: memberUser?.qrCodeBase64 || '',
          hasEntered: member.hasEntered,
          entryTime: member.entryTime,
          events: [teamComposition.eventName],
          role: member.role || ''
        };
      }));

      // Add team leader information
      const teamLeaderUser = await User.findById(teamComposition.teamLeader.userId);
      const teamLeaderInfo = {
        id: teamComposition.teamLeader.userId,
        name: teamComposition.teamLeader.name,
        email: teamComposition.teamLeader.email,
        contactNo: teamLeaderUser?.contactNo || '',
        gender: teamLeaderUser?.gender || '',
        age: teamLeaderUser?.age || 0,
        universityName: teamLeaderUser?.universityName || '',
        address: teamLeaderUser?.address || '',
        profileImage: teamLeaderUser?.profileImage || '',
        qrPath: teamLeaderUser?.qrPath || '',
        qrCodeBase64: teamLeaderUser?.qrCodeBase64 || '',
        hasEntered: teamComposition.teamLeader.hasEntered,
        entryTime: teamComposition.teamLeader.entryTime,
        events: [teamComposition.eventName],
        role: 'Team Leader'
      };

      registrations.push({
        id: user._id,
        type: isTeamLeader ? 'team-leader' : 'team-member',
        registrationId: teamComposition._id,
        registrationDate: teamComposition.createdAt,
        registrationCount: registrationCount++,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo || '',
        gender: user.gender || '',
        age: user.age || 0,
        universityName: user.universityName || '',
        address: user.address || '',
        profileImage: user.profileImage || '',
        qrPath: user.qrPath,
        qrCodeBase64: user.qrCodeBase64,
        hasEntered: user.hasEntered,
        entryTime: user.entryTime,
        events: [teamComposition.eventName],
        registeredEvents: eventData.filter(event => event.name === teamComposition.eventName),
        teamName: teamComposition.teamName,
        teamLeader: teamLeaderInfo,
        teamMembers: teamMembers,
        teamSize: teamComposition.totalMembers,
        userRole: isTeamLeader ? 'leader' : 'member'
      });
    }

    // Calculate summary
    const individualCount = registrations.filter(r => r.type === 'individual').length;
    const teamLeaderCount = registrations.filter(r => r.type === 'team-leader').length;
    const teamMemberCount = registrations.filter(r => r.type === 'team-member').length;

    res.json({
      success: true,
      registrations: registrations,
      summary: {
        totalRegistrations: registrations.length,
        individualRegistrations: individualCount,
        teamLeaderRegistrations: teamLeaderCount,
        teamMemberRegistrations: teamMemberCount,
        accessedBy: user.email
      }
    });

  } catch (error) {
    console.error('Error fetching user by email:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;