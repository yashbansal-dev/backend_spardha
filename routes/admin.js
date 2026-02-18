
const express = require("express");
const { User, Event, Purchase, TeamComposition } = require("../models/models");
const { verifyAdmin } = require("../middleware/auth");
const { sendRegistrationEmail } = require("../utils/emailService");
const { analyzeCommitteeReferrals } = require("../analyze-committee-referrals");
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Promo code validation endpoint removed


// Unified QR scanning route - handles both team leaders and team members
router.get("/verify/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // First try to find as User (main person/team leader)
    let person = await User.findById(id);
    let isTeamMember = false;
    let teamInfo = null;
    let wasMovedFromUpdatedUser = false;

    // If not found in User collection, check UpdatedUser collection (Logic Removed)
    if (!person) {
      // Logic for UpdatedUser removed as schema is deleted
    }

    if (!person) {
      console.log(`❌ QR verification failed - Person not found in either collection: ${id} `);
      return res.status(404).json({
        success: false,
        message: 'Person not found'
      });
    } else if (person.teamRegistrations && person.teamRegistrations.length > 0) {
      // If person has team registrations, get team info
      const latestTeamReg = person.teamRegistrations[person.teamRegistrations.length - 1];
      if (latestTeamReg.teamId) {
        const teamComposition = await TeamComposition.findOne({ teamId: latestTeamReg.teamId });
        if (teamComposition) {
          teamInfo = {
            teamId: latestTeamReg.teamId,
            teamSize: teamComposition.teamMembers.length,
            isTeamLeader: teamComposition.teamLeader.toString() === person._id.toString()
          };
        }
      }
    }

    if (!person) {
      console.log(`❌ QR verification failed - Person not found: ${id} `);
      return res.status(404).json({
        success: false,
        error: 'Person not found',
        message: 'No user or team member found with this QR code'
      });
    }

    console.log(`👤 QR verification for ${person.name}(${person.email}): `, {
      hasEntered: person.hasEntered,
      entryTime: person.entryTime,
      isvalidated: person.isvalidated,
      isTeamMember: isTeamMember,
      teamInfo: teamInfo
    });

    const data = {
      success: true,
      _id: person._id,
      name: person.name,
      email: person.email,
      contactNo: person.contactNo || "",
      gender: person.gender || "",
      age: person.age || null,
      universityName: person.universityName || "",
      address: person.address || "",
      profileImage: person.profileImage || "",
      qrPath: person.qrPath || "",
      isvalidated: person.isvalidated,
      hasEntered: person.hasEntered,
      entryTime: person.entryTime,
      allowEntry: true, // Always allow entry regardless of validation or previous entry status
      isTeamMember: isTeamMember,
      isTeamLeader: !isTeamMember && person.isMainPerson,
      events: person.events || [],
      finalPrice: person.finalPrice || 0,
      // Team information
      teamInfo: teamInfo,
      // Migration information
      wasMovedFromUpdatedUser: wasMovedFromUpdatedUser,
      ...(wasMovedFromUpdatedUser && {
        migrationMessage: "User was found in inactive collection and has been reactivated with entry permission"
      }),
      // If it's a team member, include main person reference
      ...(isTeamMember && {
        mainPersonId: person.mainPersonId
      })
    };

    res.json(data);

  } catch (error) {
    console.error('Error verifying QR code:', error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to verify QR code'
      });
    }
  }
});

// Allow entry endpoint - UPDATED FOR TEAM SYSTEM
router.post("/allow-entry/:id", verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Try to find the user in main collection
    let user = await User.findById(id);
    let isTeamMember = false;
    let wasMovedFromUpdatedUser = false;

    // If not found in main collection, check UpdatedUser collection (Logic Removed)
    if (!user) {
      // Logic for UpdatedUser removed as schema is deleted
    }

    if (!user) {
      console.log(`❌ Allow entry failed - User not found in either collection: ${id} `);
      return res.status(404).json({
        success: false,
        message: 'User not found',
        playBuzzer: true
      });
    }

    // Check if user is part of a team
    const teamComposition = await TeamComposition.findOne({
      $or: [
        { teamLeader: user._id },
        { 'teamMembers.userId': user._id }
      ]
    });

    isTeamMember = teamComposition && teamComposition.teamLeader.toString() !== user._id.toString();

    console.log(`🚪 Entry attempt for ${user.name}(${user.email}): `, {
      currentStatus: user.hasEntered ? 'Already entered' : 'Not entered yet',
      entryTime: user.entryTime,
      isTeamMember: isTeamMember
    });

    // Note: All validation checks removed - allowing entry regardless of previous status or validation

    // Update user entry status (only if not already set by migration)
    let entryTime = user.entryTime;
    if (!wasMovedFromUpdatedUser) {
      entryTime = new Date();
      user.hasEntered = true;
      user.entryTime = entryTime;
      await user.save();
    } else {
      // User was already updated during migration, just get the entry time
      entryTime = user.entryTime;
    }

    console.log(`✅ Entry allowed - ${user.name} successfully entered at ${entryTime} `);

    res.json({
      success: true,
      message: wasMovedFromUpdatedUser ?
        'User reactivated from inactive collection and entry allowed' :
        'Entry allowed successfully',
      playBuzzer: false,
      entryTime: entryTime,
      isTeamMember: isTeamMember,
      wasMovedFromUpdatedUser: wasMovedFromUpdatedUser
    });

  } catch (error) {
    console.error('Error allowing entry:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      playBuzzer: true
    });
  }
});

// Get all events (public endpoint for frontend)
router.get("/events-public", async (req, res) => {
  try {
    const events = await Event.find({});
    return res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all events (admin only)
router.get("/events", verifyAdmin, async (req, res) => {
  try {
    const events = await Event.find({});
    return res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get event by name (public endpoint for frontend)
router.get("/event/:name", async (req, res) => {
  try {
    const eventName = req.params.name;
    const event = await Event.findOne({ name: { $regex: new RegExp(eventName, 'i') } });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update event (admin only)
router.post("/update", verifyAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.body._id, {
      name: req.body.name,
      coordinator: req.body.coordinator,
      mobile: req.body.mobile,
      date: req.body.date,
      whatsappLink: req.body.whatsappLink,
      rules: req.body.rules,
      image: req.body.image,
      description: req.body.description,
      prize: req.body.prize,
      category: req.body.category,
      timings: req.body.timings,
      link: req.body.link
    }, { new: true });

    if (event) {
      res.status(200).json({
        success: true,
        message: 'Event updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Add new event (admin only)
router.post("/add-event", verifyAdmin, async (req, res) => {
  try {
    const newEvent = new Event({
      name: req.body.name,
      coordinator: req.body.coordinator,
      mobile: req.body.mobile,
      date: req.body.date,
      whatsappLink: req.body.whatsappLink,
      timings: req.body.timings,
      link: req.body.link,
      rules: req.body.rules || "",
      image: req.body.image || "",
      description: req.body.description || "",
      prize: req.body.prize || "",
      category: req.body.category || "Cultural"
    });

    await newEvent.save();

    res.status(201).json({
      success: true,
      message: 'Event added successfully',
      event: newEvent
    });
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all users (admin only) - UPDATED FOR TEAM SYSTEM WITH EVENT FILTERING
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const { eventFilter, page = 1, limit = 50, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Build query filters
    const filters = {};

    // Event filter
    if (eventFilter && eventFilter !== 'all') {
      filters.events = { $in: [eventFilter] };
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filters.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { contactNo: searchRegex },
        { universityName: searchRegex }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const users = await User.find(filters, '-password')
      .sort(sortObject)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .lean();

    // Get total count for pagination
    const totalCount = await User.countDocuments(filters);

    // Get statistics
    const stats = {
      totalUsers: totalCount,
      registeredUsers: await User.countDocuments({ ...filters, events: { $exists: true, $not: { $size: 0 } } }),
      emailSentUsers: await User.countDocuments({ ...filters, emailSent: true }),
      enteredUsers: await User.countDocuments({ ...filters, hasEntered: true })
    };

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit),
        hasNext: (parseInt(page) * parseInt(limit)) < totalCount,
        hasPrev: parseInt(page) > 1
      },
      stats,
      filters: {
        eventFilter,
        search,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get users by specific event (admin only)
router.get("/users/by-event/:eventName", verifyAdmin, async (req, res) => {
  try {
    const { eventName } = req.params;
    const { includeTeamMembers = false, page = 1, limit = 50 } = req.query;

    // Find users registered for the specific event
    const filters = {
      events: { $in: [eventName] }
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filters, '-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .lean();

    let teamMembers = [];

    // Include team members if requested
    if (includeTeamMembers === 'true') {
      const teamCompositions = await TeamComposition.find({
        eventName: eventName
      })
        .populate('teamLeader', 'name email contactNo universityName hasEntered entryTime emailSent')
        .populate('members', 'name email contactNo universityName hasEntered entryTime emailSent')
        .lean();

      teamMembers = teamCompositions.flatMap(team =>
        team.members.map(member => ({
          ...member,
          teamInfo: {
            teamId: team._id,
            teamName: team.teamName,
            teamLeader: team.teamLeader.name,
            isTeamMember: true
          }
        }))
      );
    }

    const totalCount = await User.countDocuments(filters);
    const allParticipants = [...users, ...teamMembers];

    res.json({
      success: true,
      eventName,
      users: users,
      teamMembers: teamMembers,
      allParticipants: allParticipants,
      totalCount: allParticipants.length,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      },
      stats: {
        directRegistrations: users.length,
        teamMemberRegistrations: teamMembers.length,
        totalParticipants: allParticipants.length,
        enteredCount: allParticipants.filter(p => p.hasEntered).length,
        emailSentCount: allParticipants.filter(p => p.emailSent).length
      }
    });

  } catch (error) {
    console.error('Error fetching users by event:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get all team members (admin only)
router.get("/team-members", verifyAdmin, async (req, res) => {
  try {
    // Get all team compositions with member details
    const teamCompositions = await TeamComposition.find({})
      .populate('teamLeader', 'name email')
      .populate('teamMembers.userId', 'name email');

    // Flatten team members for admin view
    const allTeamMembers = [];
    for (const composition of teamCompositions) {
      // Add team leader
      allTeamMembers.push({
        _id: composition.teamLeader._id,
        name: composition.teamLeader.name,
        email: composition.teamLeader.email,
        teamId: composition.teamId,
        isTeamLeader: true,
        teamSize: composition.teamMembers.length
      });

      // Add team members
      composition.teamMembers.forEach(member => {
        allTeamMembers.push({
          _id: member.userId._id,
          name: member.userId.name,
          email: member.userId.email,
          teamId: composition.teamId,
          isTeamLeader: false,
          registeredBy: composition.teamLeader.name
        });
      });
    }

    res.json(allTeamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get team details by team ID (admin only)
router.get("/team/:teamId", verifyAdmin, async (req, res) => {
  try {
    const teamId = req.params.teamId;

    // Find team composition by team ID
    const teamComposition = await TeamComposition.findOne({ teamId: teamId })
      .populate('teamLeader', 'name email contactNo gender age universityName address profileImage qrPath hasEntered entryTime events')
      .populate('teamMembers.userId', 'name email contactNo gender age universityName address profileImage qrPath hasEntered entryTime events');

    if (!teamComposition) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      team: {
        teamId: teamComposition.teamId,
        mainPerson: {
          id: teamComposition.teamLeader._id,
          name: teamComposition.teamLeader.name,
          email: teamComposition.teamLeader.email,
          contactNo: teamComposition.teamLeader.contactNo,
          gender: teamComposition.teamLeader.gender,
          age: teamComposition.teamLeader.age,
          universityName: teamComposition.teamLeader.universityName,
          address: teamComposition.teamLeader.address,
          profileImage: teamComposition.teamLeader.profileImage,
          qrPath: teamComposition.teamLeader.qrPath,
          hasEntered: teamComposition.teamLeader.hasEntered,
          entryTime: teamComposition.teamLeader.entryTime,
          events: teamComposition.teamLeader.events
        },
        teamMembers: teamComposition.teamMembers.map(member => ({
          id: member.userId._id,
          name: member.userId.name,
          email: member.userId.email,
          contactNo: member.userId.contactNo,
          gender: member.userId.gender,
          age: member.userId.age,
          universityName: member.userId.universityName,
          address: member.userId.address,
          profileImage: member.userId.profileImage,
          qrPath: member.userId.qrPath,
          hasEntered: member.userId.hasEntered,
          entryTime: member.userId.entryTime,
          events: member.userId.events
        })),
        teamSize: mainPerson.teamSize
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

// Old teams route removed - using the new one at the end of the file

// ========================= CHECKOUT OFFER ROUTES =========================

// Promo Code and Analytics routes removed

// ========================= EMAIL MANAGEMENT ROUTES =========================

// Get all users with email status (admin only)
router.get("/users-email-status", verifyAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password')
      .populate('emailSentBy', 'name email')
      .sort({ createdAt: -1 });

    const usersWithEmailStatus = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      contactNo: user.contactNo,
      universityName: user.universityName,
      events: user.events,
      teamId: user.teamId,
      isMainPerson: user.isMainPerson,
      teamSize: user.teamSize,
      emailSent: user.emailSent,
      emailSentAt: user.emailSentAt,
      emailSentBy: user.emailSentBy,
      hasEntered: user.hasEntered,
      entryTime: user.entryTime,
      isvalidated: user.isvalidated,
      qrPath: user.qrPath,
      createdAt: user.createdAt || new Date()
    }));

    res.json({
      success: true,
      users: usersWithEmailStatus,
      totalUsers: usersWithEmailStatus.length,
      emailsSent: usersWithEmailStatus.filter(u => u.emailSent).length,
      emailsPending: usersWithEmailStatus.filter(u => !u.emailSent).length
    });

  } catch (error) {
    console.error('Error fetching users with email status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get team members with email status (admin only)
router.get("/team-members-email-status", verifyAdmin, async (req, res) => {
  try {
    // Get all team compositions with member details
    const teamCompositions = await TeamComposition.find({})
      .populate('teamLeader.userId', 'name email')
      .populate('teamMembers.userId', 'name email contactNo universityName events hasEntered entryTime isvalidated qrPath createdAt emailSent emailSentAt emailSentBy')
      .sort({ createdAt: -1 });

    // Flatten team members for email status view
    const allTeamMembers = [];
    for (const composition of teamCompositions) {
      composition.teamMembers.forEach(member => {
        allTeamMembers.push({
          _id: member.userId._id,
          name: member.userId.name,
          email: member.userId.email,
          contactNo: member.userId.contactNo,
          universityName: member.userId.universityName,
          events: member.userId.events,
          teamId: composition.teamId,
          teamLeaderName: composition.teamLeader.userId.name,
          emailSent: member.userId.emailSent || false,
          emailSentAt: member.userId.emailSentAt,
          emailSentBy: member.userId.emailSentBy,
          hasEntered: member.userId.hasEntered,
          entryTime: member.userId.entryTime,
          isvalidated: member.userId.isvalidated,
          qrPath: member.userId.qrPath,
          createdAt: member.userId.createdAt || new Date()
        });
      });
    }

    res.json({
      success: true,
      teamMembers: allTeamMembers,
      totalTeamMembers: allTeamMembers.length,
      emailsSent: allTeamMembers.filter(m => m.emailSent).length,
      emailsPending: allTeamMembers.filter(m => !m.emailSent).length
    });

  } catch (error) {
    console.error('Error fetching team members with email status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Send registration email to specific user (admin only)
router.post("/send-email/:userId", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { userType = 'user' } = req.body; // 'user' or 'team-member'

    let user;
    let Model = userType === 'team-member' ? TeamMember : User;

    user = await Model.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `${userType === 'team-member' ? 'Team member' : 'User'} not found`
      });
    }

    // Check if email already sent
    if (user.emailSent) {
      return res.status(400).json({
        success: false,
        message: 'Email already sent to this user'
      });
    }

    // Prepare user data for email
    let qrCodeBase64 = null;
    if (user.qrPath) {
      try {
        const qrFilePath = path.join(__dirname, '..', user.qrPath);
        if (fs.existsSync(qrFilePath)) {
          const qrBuffer = fs.readFileSync(qrFilePath);
          qrCodeBase64 = qrBuffer.toString('base64');
        }
      } catch (qrError) {
        console.log('QR code file not found, proceeding without QR code');
      }
    }

    const userData = {
      name: user.name,
      events: user.events || [],
      qrCodeBase64: qrCodeBase64
    };

    // Send email
    const emailResult = await sendRegistrationEmail(user.email, userData);

    if (emailResult.success) {
      // Update user email status
      user.emailSent = true;
      user.emailSentAt = new Date();
      user.emailSentBy = req.user.id;
      await user.save();

      res.json({
        success: true,
        message: `Registration email sent successfully to ${user.name} `,
        emailSentAt: user.emailSentAt
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Failed to send email: ${emailResult.error} `
      });
    }

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Send bulk emails to all users who haven't received emails (admin only)
router.post("/send-bulk-emails", verifyAdmin, async (req, res) => {
  try {
    const { targetType = 'users' } = req.body; // 'users', 'team-members', or 'both'

    let results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process main users
    if (targetType === 'users' || targetType === 'both') {
      const usersToEmail = await User.find({ emailSent: false });

      for (const user of usersToEmail) {
        try {
          let qrCodeBase64 = null;
          if (user.qrPath) {
            try {
              const qrFilePath = path.join(__dirname, '..', user.qrPath);
              if (fs.existsSync(qrFilePath)) {
                const qrBuffer = fs.readFileSync(qrFilePath);
                qrCodeBase64 = qrBuffer.toString('base64');
              }
            } catch (qrError) {
              console.log(`QR code not found for user ${user.name}`);
            }
          }

          const userData = {
            name: user.name,
            events: user.events || [],
            qrCodeBase64: qrCodeBase64
          };

          const emailResult = await sendRegistrationEmail(user.email, userData);

          if (emailResult.success) {
            user.emailSent = true;
            user.emailSentAt = new Date();
            user.emailSentBy = req.user.id;
            await user.save();
            results.successful++;
          } else {
            results.failed++;
            results.errors.push(`${user.name} (${user.email}): ${emailResult.error} `);
          }

          results.totalProcessed++;

          // Add small delay to avoid overwhelming the email service
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (userError) {
          results.failed++;
          results.errors.push(`${user.name} (${user.email}): ${userError.message} `);
          results.totalProcessed++;
        }
      }
    }

    // Process team members
    if (targetType === 'team-members' || targetType === 'both') {
      // Get all team members from team compositions who haven't received emails
      const teamCompositions = await TeamComposition.find({})
        .populate('teamMembers.userId', 'name email events qrPath emailSent');

      const teamMembersToEmail = [];
      for (const composition of teamCompositions) {
        for (const member of composition.teamMembers) {
          if (!member.userId.emailSent) {
            teamMembersToEmail.push(member.userId);
          }
        }
      }

      for (const member of teamMembersToEmail) {
        try {
          let qrCodeBase64 = null;
          if (member.qrPath) {
            try {
              const qrFilePath = path.join(__dirname, '..', member.qrPath);
              if (fs.existsSync(qrFilePath)) {
                const qrBuffer = fs.readFileSync(qrFilePath);
                qrCodeBase64 = qrBuffer.toString('base64');
              }
            } catch (qrError) {
              console.log(`QR code not found for team member ${member.name} `);
            }
          }

          const userData = {
            name: member.name,
            events: member.events || [],
            qrCodeBase64: qrCodeBase64
          };

          const emailResult = await sendRegistrationEmail(member.email, userData);

          if (emailResult.success) {
            member.emailSent = true;
            member.emailSentAt = new Date();
            member.emailSentBy = req.user.id;
            await member.save();
            results.successful++;
          } else {
            results.failed++;
            results.errors.push(`${member.name} (${member.email}): ${emailResult.error} `);
          }

          results.totalProcessed++;

          // Add small delay to avoid overwhelming the email service
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (memberError) {
          results.failed++;
          results.errors.push(`${member.name} (${member.email}): ${memberError.message} `);
          results.totalProcessed++;
        }
      }
    }

    res.json({
      success: true,
      message: 'Bulk email sending completed',
      results: results
    });

  } catch (error) {
    console.error('Error sending bulk emails:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reset email status for a user (admin only)
router.post("/reset-email-status/:userId", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { userType = 'user' } = req.body;

    let Model = userType === 'team-member' ? TeamMember : User;
    const user = await Model.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `${userType === 'team-member' ? 'Team member' : 'User'} not found`
      });
    }

    user.emailSent = false;
    user.emailSentAt = null;
    user.emailSentBy = null;
    await user.save();

    res.json({
      success: true,
      message: `Email status reset for ${user.name}`
    });

  } catch (error) {
    console.error('Error resetting email status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ========================= RECENT REGISTRATIONS ROUTES =========================

// Get recent registrations (from September 22, 2025 onwards) with filters (admin only)
router.get("/recent-registrations", verifyAdmin, async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      userType,
      hasEntered,
      isValidated,
      eventFilter,
      emailSent,
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Set default from date to September 22, 2025
    const defaultFromDate = new Date('2025-09-22T00:00:00.000Z');
    const queryFromDate = fromDate ? new Date(fromDate) : defaultFromDate;

    // Build query filters
    const filters = {
      createdAt: { $gte: queryFromDate }
    };

    // Add date range filter if toDate is provided
    if (toDate) {
      filters.createdAt.$lte = new Date(toDate);
    }

    // Apply additional filters
    if (userType && userType !== 'all') {
      filters.userType = userType;
    }

    if (hasEntered !== undefined && hasEntered !== 'all') {
      filters.hasEntered = hasEntered === 'true';
    }

    if (isValidated !== undefined && isValidated !== 'all') {
      filters.isvalidated = isValidated === 'true';
    }

    if (emailSent !== undefined && emailSent !== 'all') {
      filters.emailSent = emailSent === 'true';
    }

    if (eventFilter && eventFilter !== 'all') {
      filters.events = { $in: [eventFilter] };
    }

    // Add search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filters.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { contactNo: searchRegex },
        { universityName: searchRegex }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const users = await User.find(filters, '-password')
      .sort(sortObject)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('teamRegistrations.teamLeaderId', 'name email')
      .lean();

    // Get total count for pagination
    const totalCount = await User.countDocuments(filters);

    // Get team information for each user
    const usersWithTeamInfo = await Promise.all(users.map(async (user) => {
      const teamCompositions = await TeamComposition.find({
        $or: [
          { 'teamLeader.userId': user._id },
          { 'teamMembers.userId': user._id }
        ]
      }).populate('teamLeader.userId', 'name email').lean();

      return {
        ...user,
        teamInfo: teamCompositions.map(team => ({
          teamId: team._id,
          eventName: team.eventName,
          teamName: team.teamName,
          isLeader: team.teamLeader.userId._id.toString() === user._id.toString(),
          totalMembers: team.totalMembers,
          registrationComplete: team.registrationComplete
        }))
      };
    }));

    // Calculate statistics
    const stats = {
      totalRegistrations: totalCount,
      enteredCount: await User.countDocuments({ ...filters, hasEntered: true }),
      validatedCount: await User.countDocuments({ ...filters, isvalidated: true }),
      emailSentCount: await User.countDocuments({ ...filters, emailSent: true }),
      teamLeaderCount: await User.countDocuments({
        ...filters,
        'teamRegistrations.isTeamLeader': true
      }),
      supportStaffCount: await User.countDocuments({
        ...filters,
        userType: 'support_staff'
      })
    };

    res.json({
      success: true,
      data: usersWithTeamInfo,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit),
        hasNext: (parseInt(page) * parseInt(limit)) < totalCount,
        hasPrev: parseInt(page) > 1
      },
      stats,
      filters: {
        fromDate: queryFromDate,
        toDate: toDate ? new Date(toDate) : null,
        userType,
        hasEntered,
        isValidated,
        eventFilter,
        emailSent,
        search,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error('Error fetching recent registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get detailed registration info for a specific user (admin only)
router.get("/registration-details/:userId", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Get user details
    const user = await User.findById(userId, '-password')
      .populate('registrationHistory.purchaseId')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get team compositions where this user is involved
    const teamCompositions = await TeamComposition.find({
      $or: [
        { 'teamLeader.userId': userId },
        { 'teamMembers.userId': userId }
      ]
    })
      .populate('teamLeader.userId', 'name email contactNo')
      .populate('teamMembers.userId', 'name email contactNo')
      .lean();

    // Get purchase records
    const purchases = await Purchase.find({
      $or: [
        { userId: userId },
        { mainPersonId: userId },
        { 'userDetails.email': user.email }
      ]
    }).sort({ purchaseDate: -1 }).lean();

    // Get events this user is registered for
    const events = await Event.find({
      name: { $in: user.events || [] }
    }).lean();

    const detailedInfo = {
      user,
      teamParticipations: teamCompositions.map(team => ({
        teamId: team._id,
        eventName: team.eventName,
        teamName: team.teamName,
        role: team.teamLeader.userId._id.toString() === userId ? 'Team Leader' : 'Team Member',
        totalMembers: team.totalMembers,
        registrationComplete: team.registrationComplete,
        createdAt: team.createdAt,
        teamLeader: team.teamLeader,
        teamMembers: team.teamMembers
      })),
      purchases: purchases.map(purchase => ({
        orderId: purchase.orderId,
        totalAmount: purchase.totalAmount,
        paymentStatus: purchase.paymentStatus,
        purchaseDate: purchase.purchaseDate,
        items: purchase.items,
        emailSent: purchase.emailSent
      })),
      eventsRegistered: events,
      registrationTimeline: [
        {
          type: 'Account Created',
          date: user.createdAt,
          description: 'User account was created'
        },
        ...user.registrationHistory.map(reg => ({
          type: 'Event Registration',
          date: reg.registeredAt,
          description: `Registered for events: ${reg.eventsRegistered.join(', ')} `,
          registrationType: reg.registrationType
        })),
        ...(user.emailSentAt ? [{
          type: 'Registration Email Sent',
          date: user.emailSentAt,
          description: 'Registration confirmation email sent'
        }] : []),
        ...(user.entryTime ? [{
          type: 'Event Entry',
          date: user.entryTime,
          description: 'User entered the event venue'
        }] : [])
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
    };

    res.json({
      success: true,
      data: detailedInfo
    });

  } catch (error) {
    console.error('Error fetching registration details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Resend confirmation email to a user
router.post('/resend-confirmation-email', verifyAdmin, async (req, res) => {
  try {
    const { email, userId, orderId, force = false } = req.body;

    if (!email && !userId && !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either email, userId, or orderId'
      });
    }

    console.log(`📧 Admin request to resend email: ${JSON.stringify(req.body)} `);

    // Find the user
    let user = null;

    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email: email });
    } else if (orderId) {
      // Find user through purchase
      const purchase = await Purchase.findOne({ orderId: orderId });
      if (purchase && purchase.userId) {
        user = await User.findById(purchase.userId);
      } else if (purchase && purchase.userDetails && purchase.userDetails.email) {
        user = await User.findOne({ email: purchase.userDetails.email });
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`👤 Found user: ${user.name} (${user.email})`);

    // Check if user has a QR code
    if (!user.qrCodeBase64) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a QR code. Cannot send confirmation email without QR code.'
      });
    }

    // Check if email was already sent (unless forced)
    if (user.emailSent && !force) {
      return res.status(400).json({
        success: false,
        message: 'Confirmation email was already sent to this user. Use force option to resend.',
        emailSentAt: user.emailSentAt
      });
    }

    // Get user's events
    let events = user.events || [];

    // If no events in user record, try to get from purchases
    if (events.length === 0) {
      const purchases = await Purchase.find({
        $or: [
          { userId: user._id },
          { 'userDetails.email': user.email }
        ],
        paymentStatus: 'completed'
      });

      // Extract events from purchases
      for (const purchase of purchases) {
        if (purchase.items && purchase.items.length > 0) {
          const purchaseEvents = purchase.items.map(item => item.itemName || item.eventName).filter(Boolean);
          events = [...events, ...purchaseEvents];
        }
      }
    }

    // If still no events, try to get from team compositions
    if (events.length === 0) {
      const teamComps = await TeamComposition.find({
        $or: [
          { 'teamLeader.email': user.email },
          { 'teamMembers.email': user.email }
        ],
        paymentStatus: 'completed'
      });

      events = teamComps.map(tc => tc.eventName).filter(Boolean);
    }

    // Default events if none found
    if (events.length === 0) {
      events = ['Sabrang\'25 Event'];
    }

    // Remove duplicates
    events = [...new Set(events)];

    // Prepare email data
    const emailData = {
      name: user.name,
      email: user.email,
      events: events,
      qrCodeBase64: user.qrCodeBase64
    };

    console.log(`📧 Sending confirmation email to ${user.email} with events: ${events.join(', ')} `);

    // Send the email
    const result = await sendRegistrationEmail(user.email, emailData);

    if (result.success) {
      // Update user record
      user.emailSent = true;
      user.emailSentAt = new Date();
      await user.save();

      console.log(`✅ Confirmation email resent successfully to: ${user.email} `);

      res.json({
        success: true,
        message: 'Confirmation email sent successfully',
        data: {
          userEmail: user.email,
          userName: user.name,
          events: events,
          emailSentAt: user.emailSentAt,
          wasForced: force && user.emailSent
        }
      });
    } else {
      console.error(`❌ Failed to resend confirmation email to ${user.email}: `, result.error);

      res.status(500).json({
        success: false,
        message: 'Failed to send confirmation email',
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error in resend confirmation email:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Export users to CSV (admin only)
router.get("/export/users", verifyAdmin, async (req, res) => {
  try {
    const { eventFilter, includeTeamMembers = false, format = 'csv' } = req.query;

    // Build query filters
    const filters = {};

    // Event filter
    if (eventFilter && eventFilter !== 'all') {
      filters.events = { $in: [eventFilter] };
    }

    // Get users
    const users = await User.find(filters, '-password')
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .sort({ createdAt: -1 })
      .lean();

    let allParticipants = [...users];

    // Include team members if requested
    if (includeTeamMembers === 'true') {
      const teamQuery = eventFilter && eventFilter !== 'all'
        ? { eventName: eventFilter }
        : {};

      const teamCompositions = await TeamComposition.find(teamQuery)
        .populate('teamLeader', 'name email contactNo universityName hasEntered entryTime emailSent createdAt')
        .populate('members', 'name email contactNo universityName hasEntered entryTime emailSent createdAt')
        .lean();

      const teamMembers = teamCompositions.flatMap(team =>
        team.members.map(member => ({
          ...member,
          userType: 'team_member',
          teamInfo: {
            teamId: team._id,
            teamName: team.teamName,
            teamLeader: team.teamLeader.name,
            eventName: team.eventName
          }
        }))
      );

      allParticipants = [...users.map(u => ({ ...u, userType: 'direct_registration' })), ...teamMembers];
    }

    if (format === 'json') {
      return res.json({
        success: true,
        data: allParticipants,
        totalCount: allParticipants.length,
        exportedAt: new Date().toISOString(),
        filters: { eventFilter, includeTeamMembers }
      });
    }

    // Generate CSV
    const csvHeaders = [
      'Name',
      'Email',
      'Contact Number',
      'University',
      'Events Registered',
      'Has Entered',
      'Entry Time',
      'Email Sent',
      'Registration Type',
      'Team Name',
      'Team Event',
      'Team Leader',
      'Created At'
    ];

    const csvRows = allParticipants.map(participant => [
      participant.name || '',
      participant.email || '',
      participant.contactNo || '',
      participant.universityName || '',
      (participant.events || []).join('; ') || '',
      participant.hasEntered ? 'Yes' : 'No',
      participant.entryTime ? new Date(participant.entryTime).toLocaleString() : '',
      participant.emailSent ? 'Yes' : 'No',
      participant.userType || 'direct_registration',
      participant.teamInfo?.teamName || '',
      participant.teamInfo?.eventName || '',
      participant.teamInfo?.teamLeader || '',
      participant.createdAt ? new Date(participant.createdAt).toLocaleString() : ''
    ]);

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row =>
        typeof field === 'string' && field.includes(',')
          ? `"${field.replace(/"/g, '""')}"`
          : field
      )
    ].join('\n');

    // Set response headers for CSV download
    const filename = `sabrang_users_${eventFilter || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Export teams to CSV (admin only)
router.get("/export/teams", verifyAdmin, async (req, res) => {
  try {
    const { eventFilter, format = 'csv' } = req.query;

    // Build query filters
    const filters = {};

    // Event filter
    if (eventFilter && eventFilter !== 'all') {
      filters.eventName = eventFilter;
    }

    // Get team compositions
    const teams = await TeamComposition.find(filters)
      .populate('teamLeader', 'name email contactNo universityName hasEntered entryTime emailSent')
      .populate('members', 'name email contactNo universityName hasEntered entryTime emailSent')
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'json') {
      return res.json({
        success: true,
        data: teams,
        totalCount: teams.length,
        exportedAt: new Date().toISOString(),
        filters: { eventFilter }
      });
    }

    // Generate CSV - one row per team with member details
    const csvHeaders = [
      'Team Name',
      'Event Name',
      'Team Leader Name',
      'Team Leader Email',
      'Team Leader Contact',
      'Team Leader University',
      'Team Leader Entered',
      'Team Leader Entry Time',
      'Total Members',
      'Member Names',
      'Member Emails',
      'Members Entered Count',
      'Registration Date',
      'Payment Status'
    ];

    const csvRows = teams.map(team => {
      const memberNames = team.members.map(m => m.name).join('; ');
      const memberEmails = team.members.map(m => m.email).join('; ');
      const enteredMembersCount = team.members.filter(m => m.hasEntered).length;

      return [
        team.teamName || '',
        team.eventName || '',
        team.teamLeader?.name || '',
        team.teamLeader?.email || '',
        team.teamLeader?.contactNo || '',
        team.teamLeader?.universityName || '',
        team.teamLeader?.hasEntered ? 'Yes' : 'No',
        team.teamLeader?.entryTime ? new Date(team.teamLeader.entryTime).toLocaleString() : '',
        team.members?.length || 0,
        memberNames,
        memberEmails,
        enteredMembersCount,
        team.registrationDate ? new Date(team.registrationDate).toLocaleString() : '',
        team.paymentStatus || 'pending'
      ];
    });

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row =>
        row.map(field =>
          typeof field === 'string' && field.includes(',')
            ? `"${field.replace(/"/g, '""')}"`
            : field
        ).join(',')
      )
    ].join('\n');

    // Set response headers for CSV download
    const filename = `sabrang_teams_${eventFilter || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting teams:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get comprehensive analytics for admin dashboard (admin only)
router.get("/analytics/comprehensive", verifyAdmin, async (req, res) => {
  try {
    const { eventFilter } = req.query;

    // Build base filters
    const userFilters = {};
    const teamFilters = {};

    if (eventFilter && eventFilter !== 'all') {
      userFilters.events = { $in: [eventFilter] };
      teamFilters.eventName = eventFilter;
    }

    // Get comprehensive stats
    const [
      totalUsers,
      registeredUsers,
      enteredUsers,
      emailSentUsers,
      totalTeams,
      activeTeams,
      totalEvents,
      eventStats
    ] = await Promise.all([
      User.countDocuments(userFilters),
      User.countDocuments({ ...userFilters, events: { $exists: true, $not: { $size: 0 } } }),
      User.countDocuments({ ...userFilters, hasEntered: true }),
      User.countDocuments({ ...userFilters, emailSent: true }),
      TeamComposition.countDocuments(teamFilters),
      TeamComposition.countDocuments({ ...teamFilters, isActive: true }),
      Event.countDocuments({}),
      User.aggregate([
        { $match: userFilters },
        { $unwind: '$events' },
        { $group: { _id: '$events', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // Get university distribution
    const universityStats = await User.aggregate([
      { $match: userFilters },
      { $group: { _id: '$universityName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRegistrations = await User.countDocuments({
      ...userFilters,
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      filters: { eventFilter },
      overview: {
        totalUsers,
        registeredUsers,
        enteredUsers,
        emailSentUsers,
        totalTeams,
        activeTeams,
        totalEvents,
        recentRegistrations
      },
      eventDistribution: eventStats,
      universityDistribution: universityStats,
      entryStats: {
        entryRate: totalUsers > 0 ? ((enteredUsers / totalUsers) * 100).toFixed(2) : 0,
        emailRate: totalUsers > 0 ? ((emailSentUsers / totalUsers) * 100).toFixed(2) : 0
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching comprehensive analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Batch resend confirmation emails
router.post('/batch-resend-confirmation-emails', verifyAdmin, async (req, res) => {
  try {
    const {
      limit = 10,
      noEmailSent = false,
      paymentStatus = 'completed',
      dryRun = false
    } = req.body;

    console.log(`📦 Admin batch resend request:`, { limit, noEmailSent, paymentStatus, dryRun });

    // Build query for finding users
    let query = {};

    // Filter by payment status if specified
    if (paymentStatus === 'completed') {
      // Find users who have completed purchases
      const completedPurchases = await Purchase.find({ paymentStatus: 'completed' }).select('userId userDetails.email');
      const userIds = completedPurchases.map(p => p.userId).filter(Boolean);
      const emails = completedPurchases.map(p => p.userDetails?.email).filter(Boolean);

      query = {
        $or: [
          { _id: { $in: userIds } },
          { email: { $in: emails } }
        ]
      };
    }

    // Filter by email sent status
    if (noEmailSent) {
      query.emailSent = { $ne: true };
    }

    // Add QR code requirement
    query.qrCodeBase64 = { $exists: true, $ne: null };

    const users = await User.find(query).limit(limit);
    console.log(`📊 Found ${users.length} users for batch processing`);

    if (users.length === 0) {
      return res.json({
        success: true,
        message: 'No users found matching the criteria',
        results: {
          total: 0,
          success: 0,
          failed: 0,
          skipped: 0
        }
      });
    }

    let results = {
      total: users.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    // Process each user
    for (const user of users) {
      try {
        console.log(`📧 Processing: ${user.name} (${user.email})`);

        // Get user's events (same logic as single resend)
        let events = user.events || [];

        if (events.length === 0) {
          const purchases = await Purchase.find({
            $or: [
              { userId: user._id },
              { 'userDetails.email': user.email }
            ],
            paymentStatus: 'completed'
          });

          for (const purchase of purchases) {
            if (purchase.items && purchase.items.length > 0) {
              const purchaseEvents = purchase.items.map(item => item.itemName || item.eventName).filter(Boolean);
              events = [...events, ...purchaseEvents];
            }
          }
        }

        if (events.length === 0) {
          const teamComps = await TeamComposition.find({
            $or: [
              { 'teamLeader.email': user.email },
              { 'teamMembers.email': user.email }
            ],
            paymentStatus: 'completed'
          });

          events = teamComps.map(tc => tc.eventName).filter(Boolean);
        }

        if (events.length === 0) {
          events = ['Sabrang\'25 Event'];
        }

        events = [...new Set(events)];

        if (dryRun) {
          console.log(`🧪 DRY RUN: Would send email to ${user.email} with events: ${events.join(', ')}`);
          results.success++;
          results.details.push({
            email: user.email,
            name: user.name,
            status: 'dry-run-success',
            events: events
          });
        } else {
          // Prepare and send email
          const emailData = {
            name: user.name,
            email: user.email,
            events: events,
            qrCodeBase64: user.qrCodeBase64
          };

          const result = await sendRegistrationEmail(user.email, emailData);

          if (result.success) {
            // Update user record
            user.emailSent = true;
            user.emailSentAt = new Date();
            await user.save();

            results.success++;
            results.details.push({
              email: user.email,
              name: user.name,
              status: 'success',
              events: events,
              emailSentAt: user.emailSentAt
            });

            console.log(`✅ Email sent to: ${user.email}`);
          } else {
            results.failed++;
            results.details.push({
              email: user.email,
              name: user.name,
              status: 'failed',
              error: result.error
            });

            console.error(`❌ Failed to send email to ${user.email}:`, result.error);
          }
        }

        // Add delay between emails to avoid rate limiting
        if (!dryRun) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (userError) {
        results.failed++;
        results.details.push({
          email: user.email,
          name: user.name,
          status: 'error',
          error: userError.message
        });
        console.error(`❌ Error processing ${user.email}:`, userError.message);
      }
    }

    console.log(`📊 Batch processing complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

    res.json({
      success: true,
      message: `Batch processing complete. ${results.success} emails ${dryRun ? 'would be sent' : 'sent'} successfully.`,
      results: results
    });

  } catch (error) {
    console.error('❌ Error in batch resend confirmation emails:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ========================= COORDINATOR PAGE ROUTES =========================

// Search participants by name, email, or contact number
router.get("/coordinator/search-participants", async (req, res) => {
  try {
    const { query, eventFilter, limit = 20, page = 1 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    // Build search filters
    const searchRegex = new RegExp(query.trim(), 'i');
    const filters = {
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { contactNo: searchRegex }
      ]
    };

    // Add event filter if specified
    if (eventFilter && eventFilter !== 'all') {
      filters.events = { $in: [eventFilter] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Search in Users collection
    const users = await User.find(filters, '-password')
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Search in team members through TeamComposition
    const teamCompositions = await TeamComposition.find({
      $or: [
        { 'teamLeader.name': searchRegex },
        { 'teamLeader.email': searchRegex },
        { 'teamLeader.contactNo': searchRegex },
        { 'teamMembers.name': searchRegex },
        { 'teamMembers.email': searchRegex },
        { 'teamMembers.contactNo': searchRegex }
      ]
    }).populate('teamLeader', 'name email contactNo hasEntered entryTime events')
      .populate('teamMembers.userId', 'name email contactNo hasEntered entryTime events')
      .lean();

    // Process team members matching the search
    const teamMemberResults = [];
    for (const team of teamCompositions) {
      // Check team leader
      if (team.teamLeader &&
        (searchRegex.test(team.teamLeader.name) ||
          searchRegex.test(team.teamLeader.email) ||
          searchRegex.test(team.teamLeader.contactNo))) {
        teamMemberResults.push({
          ...team.teamLeader,
          participantType: 'team-leader',
          teamInfo: {
            teamId: team._id,
            teamName: team.teamName,
            eventName: team.eventName,
            totalMembers: team.teamMembers.length + 1
          }
        });
      }

      // Check team members
      for (const member of team.teamMembers) {
        if (member.userId &&
          (searchRegex.test(member.userId.name) ||
            searchRegex.test(member.userId.email) ||
            searchRegex.test(member.userId.contactNo))) {
          teamMemberResults.push({
            ...member.userId,
            participantType: 'team-member',
            teamInfo: {
              teamId: team._id,
              teamName: team.teamName,
              eventName: team.eventName,
              teamLeaderName: team.teamLeader.name,
              totalMembers: team.teamMembers.length + 1
            }
          });
        }
      }
    }

    // Combine results and mark participant types
    const individualUsers = users.map(user => ({
      ...user,
      participantType: user.teamRegistrations?.length > 0 ? 'team-leader' : 'individual'
    }));

    const allResults = [...individualUsers, ...teamMemberResults];

    // Remove duplicates based on email
    const uniqueResults = allResults.filter((participant, index, self) =>
      index === self.findIndex(p => p.email === participant.email)
    );

    const totalCount = uniqueResults.length;

    res.json({
      success: true,
      participants: uniqueResults.slice(0, parseInt(limit)),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      },
      searchQuery: query,
      eventFilter: eventFilter || 'all'
    });

  } catch (error) {
    console.error('Error searching participants:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get participant details with registered events
router.get("/coordinator/participant/:id", verifyAdmin, async (req, res) => {
  try {
    const participantId = req.params.id;

    // Find participant in Users collection
    const user = await User.findById(participantId, '-password')
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found'
      });
    }

    // Get team information if participant is in teams
    const teamCompositions = await TeamComposition.find({
      $or: [
        { teamLeader: user._id },
        { 'teamMembers.userId': user._id }
      ]
    }).populate('teamLeader', 'name email')
      .populate('teamMembers.userId', 'name email')
      .lean();

    // Get events details
    const eventNames = [...new Set([
      ...(user.events || []),
      ...teamCompositions.map(team => team.eventName)
    ])];

    const events = await Event.find({
      name: { $in: eventNames }
    }).lean();

    // Get purchase history
    const purchases = await Purchase.find({
      $or: [
        { userId: user._id },
        { 'userDetails.email': user.email }
      ]
    }).sort({ purchaseDate: -1 }).lean();

    const participantDetails = {
      ...user,
      teamParticipations: teamCompositions.map(team => ({
        teamId: team._id,
        teamName: team.teamName,
        eventName: team.eventName,
        role: team.teamLeader._id.toString() === user._id.toString() ? 'Team Leader' : 'Team Member',
        totalMembers: team.teamMembers.length + 1,
        teamLeader: team.teamLeader,
        teamMembers: team.teamMembers
      })),
      eventsDetails: events,
      purchaseHistory: purchases.map(purchase => ({
        orderId: purchase.orderId,
        totalAmount: purchase.totalAmount,
        paymentStatus: purchase.paymentStatus,
        purchaseDate: purchase.purchaseDate,
        items: purchase.items
      }))
    };

    res.json({
      success: true,
      participant: participantDetails
    });

  } catch (error) {
    console.error('Error fetching participant details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reset entry status for a participant
router.post("/coordinator/reset-entry/:id", verifyAdmin, async (req, res) => {
  try {
    const participantId = req.params.id;
    const { reason } = req.body;

    // Find and update participant
    const user = await User.findById(participantId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found'
      });
    }

    const previousEntryStatus = {
      hasEntered: user.hasEntered,
      entryTime: user.entryTime
    };

    // Reset entry status
    user.hasEntered = false;
    user.entryTime = null;
    await user.save();

    // Log the action (you might want to create an audit log)
    console.log(`Entry status reset for ${user.name} (${user.email}) by admin. Reason: ${reason || 'No reason provided'}`);

    res.json({
      success: true,
      message: 'Entry status reset successfully',
      participant: {
        id: user._id,
        name: user.name,
        email: user.email,
        previousStatus: previousEntryStatus,
        currentStatus: {
          hasEntered: user.hasEntered,
          entryTime: user.entryTime
        }
      },
      resetReason: reason || 'No reason provided',
      resetAt: new Date(),
      resetBy: req.user?.email || 'Admin'
    });

  } catch (error) {
    console.error('Error resetting entry status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get participants by event for coordinator view
router.get("/coordinator/participants-by-event/:eventName", verifyAdmin, async (req, res) => {
  try {
    const { eventName } = req.params;
    const { includeTeamMembers = true, status = 'all', limit = 50, page = 1 } = req.query;

    // Find users registered for the event
    let userFilters = { events: { $in: [eventName] } };

    // Add status filters
    if (status === 'entered') {
      userFilters.hasEntered = true;
    } else if (status === 'not-entered') {
      userFilters.hasEntered = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(userFilters, '-password')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    let teamMembers = [];

    // Include team members if requested
    if (includeTeamMembers === 'true') {
      let teamFilters = { eventName: eventName };

      const teamCompositions = await TeamComposition.find(teamFilters)
        .populate('teamLeader', 'name email contactNo hasEntered entryTime emailSent')
        .populate('teamMembers.userId', 'name email contactNo hasEntered entryTime emailSent')
        .lean();

      teamMembers = teamCompositions.flatMap(team =>
        team.teamMembers.map(member => ({
          ...member.userId,
          participantType: 'team-member',
          teamInfo: {
            teamId: team._id,
            teamName: team.teamName,
            teamLeader: team.teamLeader.name,
            role: member.role || 'member'
          }
        }))
      );

      // Apply status filter to team members
      if (status === 'entered') {
        teamMembers = teamMembers.filter(member => member.hasEntered);
      } else if (status === 'not-entered') {
        teamMembers = teamMembers.filter(member => !member.hasEntered);
      }
    }

    const individualParticipants = users.map(user => ({
      ...user,
      participantType: 'individual'
    }));

    const allParticipants = [...individualParticipants, ...teamMembers];
    const totalCount = allParticipants.length;

    // Get event details
    const event = await Event.findOne({ name: eventName }).lean();

    const stats = {
      totalParticipants: allParticipants.length,
      enteredCount: allParticipants.filter(p => p.hasEntered).length,
      notEnteredCount: allParticipants.filter(p => !p.hasEntered).length,
      individualCount: individualParticipants.length,
      teamMemberCount: teamMembers.length
    };

    res.json({
      success: true,
      eventName,
      eventDetails: event,
      participants: allParticipants,
      stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      },
      filters: {
        status,
        includeTeamMembers
      }
    });

  } catch (error) {
    console.error('Error fetching participants by event:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Alias route for search-participants (for easier access)
router.get("/search-participants", async (req, res) => {
  try {
    const { query, eventFilter, limit = 20, page = 1 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    // Build search conditions
    const searchConditions = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } }
      ]
    };

    // Apply event filter if provided
    let pipeline = [
      { $match: searchConditions }
    ];

    if (eventFilter && eventFilter !== 'all') {
      pipeline.push({
        $lookup: {
          from: 'teamcompositions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$eventName', eventFilter] },
                    {
                      $or: [
                        { $eq: ['$teamLeader', '$$userId'] },
                        { $in: ['$$userId', '$teamMembers.userId'] }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'eventTeams'
        }
      });
      pipeline.push({
        $match: { 'eventTeams.0': { $exists: true } }
      });
    }

    // Add pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Execute search
    const participants = await User.aggregate(pipeline);

    // Get total count for pagination
    const totalPipeline = [
      { $match: searchConditions }
    ];
    if (eventFilter && eventFilter !== 'all') {
      totalPipeline.push({
        $lookup: {
          from: 'teamcompositions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$eventName', eventFilter] },
                    {
                      $or: [
                        { $eq: ['$teamLeader', '$$userId'] },
                        { $in: ['$$userId', '$teamMembers.userId'] }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: 'eventTeams'
        }
      });
      totalPipeline.push({
        $match: { 'eventTeams.0': { $exists: true } }
      });
    }
    totalPipeline.push({ $count: 'total' });

    const totalResult = await User.aggregate(totalPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({
      success: true,
      participants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error searching participants:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ========================= USER MANAGEMENT ROUTES =========================

// Get all users with advanced filtering and search
router.get("/manage-users", async (req, res) => {
  try {
    console.log('📥 GET /admin/manage-users - Query params:', req.query);

    const {
      search,
      eventFilter,
      statusFilter,
      userTypeFilter,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      format,
      export: isExport
    } = req.query;

    // Build query filters
    const filters = {};

    // Search functionality
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filters.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { contactNo: searchRegex },
        { universityName: searchRegex }
      ];
    }

    // Event filter
    if (eventFilter && eventFilter !== 'all') {
      filters.events = { $in: [eventFilter] };
    }

    // Status filters
    if (statusFilter === 'entered') {
      filters.hasEntered = true;
    } else if (statusFilter === 'not-entered') {
      filters.hasEntered = false;
    } else if (statusFilter === 'validated') {
      filters.isvalidated = true;
    } else if (statusFilter === 'not-validated') {
      filters.isvalidated = false;
    } else if (statusFilter === 'email-sent') {
      filters.emailSent = true;
    } else if (statusFilter === 'email-pending') {
      filters.emailSent = { $ne: true };
    }

    // User type filter
    if (userTypeFilter && userTypeFilter !== 'all') {
      filters.userType = userTypeFilter;
    }

    // Handle Excel export (CSV format that opens well in Excel)
    if (format === 'excel' && isExport === 'true') {
      console.log('📊 Exporting users to CSV (Excel-compatible) with filters:', filters);

      // Get all matching users for export (no pagination)
      const sortObject = {};
      sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const users = await User.find(filters, '-password')
        .sort(sortObject)
        .lean();

      // Get additional info for each user
      const usersWithDetails = await Promise.all(users.map(async (user) => {
        // Get team information
        const teamInfo = await TeamComposition.find({
          $or: [
            { teamLeader: user._id },
            { 'teamMembers.userId': user._id }
          ]
        }).select('teamName eventName').lean();

        // Get purchase information
        const purchases = await Purchase.find({
          $or: [
            { userId: user._id },
            { 'userDetails.email': user.email }
          ]
        }).select('orderId totalAmount paymentStatus purchaseDate').lean();

        return {
          ...user,
          teamParticipations: teamInfo || [],
          purchaseHistory: purchases || [],
          totalAmountPaid: purchases
            .filter(p => p.paymentStatus === 'completed')
            .reduce((sum, p) => sum + (p.totalAmount || 0), 0)
        };
      }));

      // Create CSV content
      const csvHeaders = [
        'Name', 'Email', 'Contact', 'Gender', 'Age', 'University', 'Address',
        'User Type', 'Events', 'Validated', 'Entered', 'Email Sent',
        'Total Paid', 'Created At', 'Teams'
      ];

      // Helper function to escape CSV values
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV content
      let csvContent = csvHeaders.join(',') + '\n';

      usersWithDetails.forEach(user => {
        const row = [
          escapeCsvValue(user.name || ''),
          escapeCsvValue(user.email || ''),
          escapeCsvValue(user.contactNo || user.phone || ''),
          escapeCsvValue(user.gender || ''),
          escapeCsvValue(user.age || ''),
          escapeCsvValue(user.universityName || user.college || ''),
          escapeCsvValue(user.address || ''),
          escapeCsvValue(user.userType || 'participant'),
          escapeCsvValue((user.events || []).join('; ')),
          escapeCsvValue(user.isvalidated ? 'Yes' : 'No'),
          escapeCsvValue(user.hasEntered ? 'Yes' : 'No'),
          escapeCsvValue(user.emailSent ? 'Yes' : 'No'),
          escapeCsvValue(user.totalAmountPaid || 0),
          escapeCsvValue(user.createdAt ? new Date(user.createdAt).toLocaleString() : ''),
          escapeCsvValue((user.teamParticipations || []).map(t => `${t.teamName} (${t.eventName})`).join('; '))
        ];
        csvContent += row.join(',') + '\n';
      });

      // Set response headers for CSV download (will open in Excel)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');

      console.log(`✅ CSV export completed: ${usersWithDetails.length} users`);
      return res.send('\ufeff' + csvContent); // BOM for proper Excel UTF-8 handling
    }

    // Regular pagination for normal requests
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const users = await User.find(filters, '-password')
      .sort(sortObject)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await User.countDocuments(filters);

    // Get additional info for each user
    const usersWithDetails = await Promise.all(users.map(async (user) => {
      // Get team information - find teams where user is leader or member
      const teamInfo = await TeamComposition.find({
        $or: [
          { 'teamLeader.userId': user._id },
          { 'teamMembers.userId': user._id }
        ]
      }).select('teamName eventName teamLeader teamMembers registrationComplete totalMembers purchaseId').lean();

      // Transform team info to match frontend expectations
      const teamParticipations = teamInfo.map(team => ({
        teamId: team._id,
        teamName: team.teamName,
        eventName: team.eventName,
        isLeader: team.teamLeader && team.teamLeader.userId && team.teamLeader.userId.toString() === user._id.toString(),
        registrationComplete: team.registrationComplete || false,
        totalMembers: team.totalMembers || 0,
        purchaseId: team.purchaseId
      }));

      // Get purchase information
      const purchases = await Purchase.find({
        $or: [
          { userId: user._id },
          { 'userDetails.email': user.email }
        ]
      }).select('orderId totalAmount paymentStatus purchaseDate').lean();

      return {
        ...user,
        teamParticipations: teamParticipations || [],
        purchaseHistory: purchases || [],
        totalAmountPaid: purchases
          .filter(p => p.paymentStatus === 'completed')
          .reduce((sum, p) => sum + (p.totalAmount || 0), 0)
      };
    }));

    // Calculate statistics
    const stats = {
      totalUsers: await User.countDocuments({}), // Total users in system (not filtered)
      validatedUsers: await User.countDocuments({ ...filters, isvalidated: true }),
      enteredUsers: await User.countDocuments({ ...filters, hasEntered: true }),
      emailSentUsers: await User.countDocuments({ ...filters, emailSent: true }),
      activeUsers: await User.countDocuments({ ...filters, events: { $exists: true, $not: { $size: 0 } } })
    };

    console.log('✅ Found users:', usersWithDetails.length);

    res.json({
      success: true,
      users: usersWithDetails,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit),
        hasNext: (parseInt(page) * parseInt(limit)) < totalCount,
        hasPrev: parseInt(page) > 1
      },
      stats,
      filters: {
        search: search || '',
        eventFilter: eventFilter || 'all',
        statusFilter: statusFilter || 'all',
        userTypeFilter: userTypeFilter || 'all',
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error('Error fetching users for management:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Create new user via manage-users
router.post("/manage-users", async (req, res) => {
  try {
    const { name, email, phone, password, college, year, branch } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      college,
      year,
      branch,
      isVerified: true, // Admin created users are auto-verified
      createdAt: new Date()
    });

    await newUser.save();

    // Generate QR code for the user
    try {
      await generateUserQRCode(newUser._id);
    } catch (qrError) {
      console.error('QR generation failed:', qrError);
      // Don't fail the user creation if QR fails
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        college: newUser.college,
        year: newUser.year,
        branch: newUser.branch
      }
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get single user by ID
router.get("/manage-users/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId, '-password')
      .populate('teamRegistrations.teamCompositionId', 'teamName eventName')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get additional info for the user
    const teamInfo = await TeamComposition.find({
      $or: [
        { teamLeader: user._id },
        { 'teamMembers.userId': user._id }
      ]
    }).select('teamName eventName').lean();

    const purchases = await Purchase.find({
      $or: [
        { userId: user._id },
        { 'userDetails.email': user.email }
      ]
    }).select('orderId totalAmount paymentStatus purchaseDate').lean();

    const userWithDetails = {
      ...user,
      teamParticipations: teamInfo,
      purchaseHistory: purchases,
      totalAmountPaid: purchases
        .filter(p => p.paymentStatus === 'completed')
        .reduce((sum, p) => sum + (p.totalAmount || 0), 0)
    };

    res.json({
      success: true,
      user: userWithDetails
    });

  } catch (error) {
    console.error('Error fetching user by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user details
router.put("/manage-users/:id", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated through this route
    delete updates.password;
    delete updates._id;
    delete updates.createdAt;
    delete updates.qrCodeBase64;

    // Hash password if it's being updated
    if (updates.newPassword) {
      const bcrypt = require('bcrypt');
      updates.password = await bcrypt.hash(updates.newPassword, 12);
      delete updates.newPassword;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { ...updates, updatedAt: new Date() },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log the update action
    console.log(`User ${updatedUser.email} updated by admin:`, Object.keys(updates));

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete user
router.delete("/manage-users/:id", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { confirmDelete, reason } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: 'Delete confirmation required'
      });
    }

    // Find user first to get details for logging
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is part of any teams
    const teamInvolvements = await TeamComposition.find({
      $or: [
        { teamLeader: userId },
        { 'teamMembers.userId': userId }
      ]
    });

    if (teamInvolvements.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user who is part of teams. Remove from teams first.',
        teamInvolvements: teamInvolvements.map(team => ({
          teamId: team._id,
          teamName: team.teamName,
          eventName: team.eventName,
          role: team.teamLeader.toString() === userId ? 'Team Leader' : 'Team Member'
        }))
      });
    }

    // Check for completed purchases
    const completedPurchases = await Purchase.find({
      $or: [
        { userId: userId },
        { 'userDetails.email': user.email }
      ],
      paymentStatus: 'completed'
    });

    if (completedPurchases.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user with completed purchases. This would affect financial records.',
        completedPurchases: completedPurchases.length
      });
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    // Log the deletion
    console.log(`User deleted by admin:`, {
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email,
        events: user.events
      },
      reason: reason || 'No reason provided',
      deletedAt: new Date(),
      deletedBy: req.user?.email || 'Admin'
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Bulk delete users
router.post("/manage-users/bulk-delete", verifyAdmin, async (req, res) => {
  try {
    const { userIds, reason } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    const deletedUsers = [];
    const errors = [];

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Check for completed purchases
        const completedPurchases = await Purchase.find({
          $or: [
            { userId: userId },
            { 'userDetails.email': user.email }
          ],
          paymentStatus: 'completed'
        });

        if (completedPurchases.length > 0) {
          errors.push({
            userId,
            email: user.email,
            error: 'User has completed purchases and cannot be deleted'
          });
          continue;
        }

        // Delete the user
        await User.findByIdAndDelete(userId);

        deletedUsers.push({
          id: user._id,
          name: user.name,
          email: user.email
        });

      } catch (error) {
        errors.push({ userId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Bulk delete completed. ${deletedUsers.length} users deleted, ${errors.length} errors.`,
      deletedUsers,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        requested: userIds.length,
        deleted: deletedUsers.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ========================= ALL REGISTRATIONS ENDPOINT FOR ADMIN =========================

// Get ALL registrations including individual users, team leaders, and team members (admin only)
router.get("/all-registrations", verifyAdmin, async (req, res) => {
  try {
    console.log("📊 Fetching all registrations for admin view...");

    // Get all users (individual registrations and team leaders)
    const allUsers = await User.find({}, '-password')
      .populate('teamRegistrations.teamLeaderId', 'name email')
      .populate('registrationHistory.purchaseId')
      .sort({ createdAt: -1 })
      .lean();

    // Get all team compositions to extract team member information
    const allTeamCompositions = await TeamComposition.find({})
      .populate('teamLeader.userId', 'name email contactNo gender age universityName address hasEntered entryTime emailSent emailSentAt createdAt')
      .populate('teamMembers.userId', 'name email contactNo gender age universityName address hasEntered entryTime emailSent emailSentAt createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Get all purchases for linking registration data
    const allPurchases = await Purchase.find({})
      .sort({ purchaseDate: -1 })
      .lean();

    // Process registrations
    const registrations = [];
    const processedEmails = new Set(); // Track to avoid duplicates

    // Process individual users and team leaders
    for (const user of allUsers) {
      if (processedEmails.has(user.email)) continue;
      processedEmails.add(user.email);

      // Find related purchases
      const userPurchases = allPurchases.filter(purchase =>
        purchase.userId?.toString() === user._id.toString() ||
        purchase.mainPersonId?.toString() === user._id.toString() ||
        purchase.userDetails?.email === user.email
      );

      // Find team information
      const userTeamInfo = allTeamCompositions.filter(team =>
        team.teamLeader.userId._id.toString() === user._id.toString()
      );

      const registration = {
        id: user._id,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo || '',
        gender: user.gender || '',
        age: user.age || null,
        universityName: user.universityName || '',
        address: user.address || '',

        // Registration details
        events: user.events || [],
        userType: user.userType || 'participant',
        supportRole: user.supportRole || '',
        visitorPassDays: user.visitorPassDays || 0,

        // Status fields
        isvalidated: user.isvalidated || false,
        hasEntered: user.hasEntered || false,
        entryTime: user.entryTime || null,
        emailSent: user.emailSent || false,
        emailSentAt: user.emailSentAt || null,

        // QR Code info
        qrPath: user.qrPath || '',
        qrCodeBase64: user.qrCodeBase64 ? 'Available' : 'Not Available',

        // Timestamps
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,

        // Registration type identification
        registrationType: userTeamInfo.length > 0 ? 'team-leader' : 'individual',

        // Team information (if team leader)
        teamInfo: userTeamInfo.map(team => ({
          teamId: team._id,
          teamName: team.teamName,
          eventName: team.eventName,
          totalMembers: team.totalMembers,
          registrationComplete: team.registrationComplete,
          paymentStatus: team.paymentStatus
        })),

        // Purchase information
        purchases: userPurchases.map(purchase => ({
          orderId: purchase.orderId,
          totalAmount: purchase.totalAmount,
          paymentStatus: purchase.paymentStatus,
          purchaseDate: purchase.purchaseDate,
          items: purchase.items
        })),

        // Additional metadata
        totalAmountPaid: userPurchases
          .filter(p => p.paymentStatus === 'completed')
          .reduce((sum, p) => sum + (p.totalAmount || 0), 0),

        // Referral information
      };

      registrations.push(registration);
    }

    // Process team members (who are not already team leaders)
    for (const teamComposition of allTeamCompositions) {
      for (const teamMember of teamComposition.teamMembers) {
        if (processedEmails.has(teamMember.userId.email)) continue;
        processedEmails.add(teamMember.userId.email);

        const member = teamMember.userId;

        // Find related purchases (team member might not have direct purchases)
        const memberPurchases = allPurchases.filter(purchase =>
          purchase.userId?.toString() === member._id.toString() ||
          purchase.userDetails?.email === member.email
        );

        const registration = {
          id: member._id,
          name: member.name,
          email: member.email,
          contactNo: member.contactNo || '',
          gender: member.gender || '',
          age: member.age || null,
          universityName: member.universityName || '',
          address: member.address || '',

          // Registration details
          events: member.events || [teamComposition.eventName],
          userType: member.userType || 'participant',
          supportRole: member.supportRole || '',
          visitorPassDays: member.visitorPassDays || 0,

          // Status fields
          isvalidated: member.isvalidated || false,
          hasEntered: member.hasEntered || false,
          entryTime: member.entryTime || null,
          emailSent: member.emailSent || false,
          emailSentAt: member.emailSentAt || null,

          // QR Code info
          qrPath: member.qrPath || '',
          qrCodeBase64: member.qrCodeBase64 ? 'Available' : 'Not Available',

          // Timestamps
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,

          // Registration type identification
          registrationType: 'team-member',

          // Team information
          teamInfo: [{
            teamId: teamComposition._id,
            teamName: teamComposition.teamName,
            eventName: teamComposition.eventName,
            teamLeaderName: teamComposition.teamLeader.userId.name,
            teamLeaderEmail: teamComposition.teamLeader.userId.email,
            totalMembers: teamComposition.totalMembers,
            registrationComplete: teamComposition.registrationComplete,
            paymentStatus: teamComposition.paymentStatus,
            role: teamMember.role || 'member'
          }],

          // Purchase information
          purchases: memberPurchases.map(purchase => ({
            orderId: purchase.orderId,
            totalAmount: purchase.totalAmount,
            paymentStatus: purchase.paymentStatus,
            purchaseDate: purchase.purchaseDate,
            items: purchase.items
          })),

          // Additional metadata
          totalAmountPaid: memberPurchases
            .filter(p => p.paymentStatus === 'completed')
            .reduce((sum, p) => sum + (p.totalAmount || 0), 0),

          // Referral information
        };

        registrations.push(registration);
      }
    }

    // Calculate summary statistics
    const stats = {
      totalRegistrations: registrations.length,
      individualRegistrations: registrations.filter(r => r.registrationType === 'individual').length,
      teamLeaders: registrations.filter(r => r.registrationType === 'team-leader').length,
      teamMembers: registrations.filter(r => r.registrationType === 'team-member').length,
      validatedUsers: registrations.filter(r => r.isvalidated).length,
      enteredUsers: registrations.filter(r => r.hasEntered).length,
      emailsSent: registrations.filter(r => r.emailSent).length,
      qrCodesGenerated: registrations.filter(r => r.qrCodeBase64 === 'Available').length,
      totalRevenue: registrations.reduce((sum, r) => sum + r.totalAmountPaid, 0),

      // Event-wise breakdown
      eventBreakdown: registrations
        .reduce((acc, r) => {
          r.events.forEach(event => {
            acc[event] = (acc[event] || 0) + 1;
          });
          return acc;
        }, {}),

      // University breakdown
      universityBreakdown: registrations
        .reduce((acc, r) => {
          if (r.universityName) {
            acc[r.universityName] = (acc[r.universityName] || 0) + 1;
          }
          return acc;
        }, {}),

      // User type breakdown
      userTypeBreakdown: registrations
        .reduce((acc, r) => {
          acc[r.userType] = (acc[r.userType] || 0) + 1;
          return acc;
        }, {}),
    };

    console.log(`✅ Successfully fetched ${registrations.length} registrations`);

    res.json({
      success: true,
      message: `Successfully fetched all ${registrations.length} registrations`,
      data: registrations,
      stats: stats,
      generatedAt: new Date().toISOString(),
      note: "All registrations fetched in single request for client-side filtering"
    });

  } catch (error) {
    console.error('❌ Error fetching all registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ========================= TEAM MANAGEMENT ROUTES =========================

// Add new team
router.post("/manage-teams/add-team", verifyAdmin, async (req, res) => {
  try {
    const {
      teamName,
      eventName,
      teamLeaderEmail,
      teamLeaderName,
      teamLeaderContactNo,
      teamLeaderUniversity,
      teamMembers = [],
      sendEmail = true
    } = req.body;

    // Validate required fields
    if (!teamName || !eventName || !teamLeaderEmail || !teamLeaderName) {
      return res.status(400).json({
        success: false,
        message: 'Team name, event name, team leader email and name are required'
      });
    }

    // Check if event exists
    const event = await Event.findOne({ name: eventName });
    if (!event) {
      return res.status(400).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Create or find team leader user
    let teamLeader = await User.findOne({ email: teamLeaderEmail });

    if (!teamLeader) {
      // Create new team leader user
      const bcrypt = require('bcrypt');
      const shortid = require('shortid');
      const { generateUserQRCode } = require('../utils/qrCodeService');

      const defaultPassword = 'Sabrang2025!'; // You might want to generate a random password
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);

      teamLeader = new User({
        name: teamLeaderName,
        email: teamLeaderEmail,
        password: hashedPassword,
        contactNo: teamLeaderContactNo || '',
        universityName: teamLeaderUniversity || '',
        events: [eventName],
        userType: 'participant',
        referalID: shortid.generate(),
        isvalidated: true
      });

      // Generate QR code
      try {
        const qrCodeBase64 = await generateUserQRCode(teamLeader._id, {
          name: teamLeader.name,
          email: teamLeader.email
        });

        teamLeader.qrCode = `${teamLeader._id}`;
        teamLeader.qrPath = `${teamLeader._id}`;
        teamLeader.qrCodeBase64 = qrCodeBase64;
      } catch (qrError) {
        console.error('QR code generation failed:', qrError);
      }

      await teamLeader.save();
    } else {
      // Update existing user to include this event
      if (!teamLeader.events.includes(eventName)) {
        teamLeader.events.push(eventName);
        await teamLeader.save();
      }
    }

    // Create team members
    const createdMembers = [];
    for (const memberData of teamMembers) {
      if (!memberData.email || !memberData.name) continue;

      let member = await User.findOne({ email: memberData.email });

      if (!member) {
        const bcrypt = require('bcrypt');
        const shortid = require('shortid');
        const { generateUserQRCode } = require('../utils/qrCodeService');

        const defaultPassword = 'Sabrang2025!';
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);

        member = new User({
          name: memberData.name,
          email: memberData.email,
          password: hashedPassword,
          contactNo: memberData.contactNo || '',
          universityName: memberData.universityName || '',
          events: [eventName],
          userType: 'participant',
          referalID: shortid.generate(),
          isvalidated: true
        });

        // Generate QR code
        try {
          const qrCodeBase64 = await generateUserQRCode(member._id, {
            name: member.name,
            email: member.email
          });

          member.qrCode = `${member._id}`;
          member.qrPath = `${member._id}`;
          member.qrCodeBase64 = qrCodeBase64;
        } catch (qrError) {
          console.error('QR code generation failed:', qrError);
        }

        await member.save();
      } else {
        // Update existing user to include this event
        if (!member.events.includes(eventName)) {
          member.events.push(eventName);
          await member.save();
        }
      }

      createdMembers.push({
        userId: member._id,
        name: member.name,
        email: member.email,
        contactNo: member.contactNo,
        role: memberData.role || 'member'
      });
    }

    // Create team composition
    const teamComposition = new TeamComposition({
      teamId: shortid.generate(),
      teamName,
      eventName,
      teamLeader: teamLeader._id,
      teamMembers: createdMembers,
      totalMembers: createdMembers.length + 1,
      registrationComplete: true,
      paymentStatus: 'completed', // Assuming admin-created teams are paid
      createdAt: new Date()
    });

    await teamComposition.save();

    // Send registration emails if requested
    if (sendEmail) {
      const { sendRegistrationEmail } = require('../utils/emailService');

      // Send email to team leader
      if (teamLeader.qrCodeBase64) {
        try {
          await sendRegistrationEmail(teamLeader.email, {
            name: teamLeader.name,
            events: [eventName],
            qrCodeBase64: teamLeader.qrCodeBase64
          });
          teamLeader.emailSent = true;
          teamLeader.emailSentAt = new Date();
          await teamLeader.save();
        } catch (emailError) {
          console.error('Failed to send email to team leader:', emailError);
        }
      }

      // Send emails to team members
      for (const memberData of createdMembers) {
        const member = await User.findById(memberData.userId);
        if (member && member.qrCodeBase64) {
          try {
            await sendRegistrationEmail(member.email, {
              name: member.name,
              events: [eventName],
              qrCodeBase64: member.qrCodeBase64
            });
            member.emailSent = true;
            member.emailSentAt = new Date();
            await member.save();
          } catch (emailError) {
            console.error(`Failed to send email to team member ${member.email}:`, emailError);
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team: {
        teamId: teamComposition.teamId,
        teamName: teamComposition.teamName,
        eventName: teamComposition.eventName,
        teamLeader: {
          id: teamLeader._id,
          name: teamLeader.name,
          email: teamLeader.email,
          contactNo: teamLeader.contactNo
        },
        teamMembers: createdMembers,
        totalMembers: teamComposition.totalMembers,
        emailsSent: sendEmail
      }
    });

  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add individual user
router.post("/manage-users/add-user", async (req, res) => {
  try {
    const {
      name,
      email,
      contactNo,
      gender,
      age,
      universityName,
      address,
      events = [],
      userType = 'participant',
      password,
      sendEmail = true
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Validate events exist
    if (events.length > 0) {
      const eventCount = await Event.countDocuments({ name: { $in: events } });
      if (eventCount !== events.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more events not found'
        });
      }
    }

    // Create user
    const bcrypt = require('bcrypt');
    const shortid = require('shortid');
    const { generateUserQRCode } = require('../utils/qrCodeService');

    const userPassword = password || 'Sabrang2025!'; // Default password if not provided
    const hashedPassword = await bcrypt.hash(userPassword, 12);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      contactNo: contactNo || '',
      gender: gender || '',
      age: age || null,
      universityName: universityName || '',
      address: address || '',
      events: events,
      userType,
      referalID: shortid.generate(),
      isvalidated: true,
      createdAt: new Date()
    });

    // Generate QR code
    try {
      const qrCodeBase64 = await generateUserQRCode(newUser._id, {
        name: newUser.name,
        email: newUser.email
      });

      newUser.qrCode = `${newUser._id}`;
      newUser.qrPath = `${newUser._id}`;
      newUser.qrCodeBase64 = qrCodeBase64;
    } catch (qrError) {
      console.error('QR code generation failed:', qrError);
    }

    await newUser.save();

    // Send registration email if requested
    if (sendEmail && newUser.qrCodeBase64) {
      const { sendRegistrationEmail } = require('../utils/emailService');

      try {
        await sendRegistrationEmail(newUser.email, {
          name: newUser.name,
          events: events,
          qrCodeBase64: newUser.qrCodeBase64
        });
        newUser.emailSent = true;
        newUser.emailSentAt = new Date();
        await newUser.save();
      } catch (emailError) {
        console.error('Failed to send registration email:', emailError);
      }
    }

    // Remove password from response
    const responseUser = newUser.toObject();
    delete responseUser.password;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: responseUser,
      credentials: password ? null : {
        defaultPassword: userPassword,
        message: 'Please share these credentials with the user'
      },
      emailSent: sendEmail && newUser.emailSent
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add team route (alias for manage-teams/add-team)
router.post("/manage-users/add-team", async (req, res) => {
  try {
    const { teamName, eventName, teamLeader, teamMembers, defaultPassword = 'Sabrang2025!' } = req.body;

    if (!teamName || !eventName || !teamLeader) {
      return res.status(400).json({
        success: false,
        message: 'Team name, event name, and team leader are required'
      });
    }

    // Check if event exists
    const event = await Event.findOne({ eventName });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Create or get team leader
    let leaderUser;
    if (typeof teamLeader === 'string') {
      // If teamLeader is just an email, create user
      const existingLeader = await User.findOne({ email: teamLeader });
      if (existingLeader) {
        leaderUser = existingLeader;
      } else {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        leaderUser = new User({
          name: teamLeader.split('@')[0], // Use email prefix as name
          email: teamLeader,
          password: hashedPassword,
          isVerified: true
        });
        await leaderUser.save();
      }
    } else {
      // teamLeader is an object with user details
      const existingLeader = await User.findOne({ email: teamLeader.email });
      if (existingLeader) {
        leaderUser = existingLeader;
      } else {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        leaderUser = new User({
          name: teamLeader.name,
          email: teamLeader.email,
          phone: teamLeader.phone,
          college: teamLeader.college,
          year: teamLeader.year,
          branch: teamLeader.branch,
          password: hashedPassword,
          isVerified: true
        });
        await leaderUser.save();
      }
    }

    // Process team members
    const processedMembers = [];
    if (teamMembers && teamMembers.length > 0) {
      for (const member of teamMembers) {
        let memberUser;
        const existingMember = await User.findOne({ email: member.email });

        if (existingMember) {
          memberUser = existingMember;
        } else {
          const hashedPassword = await bcrypt.hash(defaultPassword, 10);
          memberUser = new User({
            name: member.name,
            email: member.email,
            phone: member.phone,
            college: member.college,
            year: member.year,
            branch: member.branch,
            password: hashedPassword,
            isVerified: true
          });
          await memberUser.save();
        }

        processedMembers.push({
          userId: memberUser._id,
          name: memberUser.name,
          email: memberUser.email,
          phone: memberUser.phone
        });
      }
    }

    // Create team
    const team = new TeamComposition({
      teamName,
      eventName,
      teamLeader: leaderUser._id,
      teamMembers: processedMembers,
      isRegistered: true,
      registrationDate: new Date()
    });

    await team.save();

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team: {
        id: team._id,
        teamName: team.teamName,
        eventName: team.eventName,
        teamLeader: {
          id: leaderUser._id,
          name: leaderUser.name,
          email: leaderUser.email
        },
        teamMembers: processedMembers,
        memberCount: processedMembers.length + 1
      }
    });

  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Bulk add users from CSV data
router.post("/manage-users/bulk-add", verifyAdmin, async (req, res) => {
  try {
    const { users, defaultPassword = 'Sabrang2025!', sendEmails = false } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required'
      });
    }

    const results = {
      total: users.length,
      created: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    const bcrypt = require('bcrypt');
    const shortid = require('shortid');
    const { generateUserQRCode } = require('../utils/qrCodeService');
    const { sendRegistrationEmail } = require('../utils/emailService');

    for (const userData of users) {
      try {
        if (!userData.name || !userData.email) {
          results.failed++;
          results.details.push({
            email: userData.email || 'Unknown',
            status: 'failed',
            error: 'Name and email are required'
          });
          continue;
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
          results.skipped++;
          results.details.push({
            email: userData.email,
            status: 'skipped',
            reason: 'User already exists'
          });
          continue;
        }

        // Create user
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);

        const newUser = new User({
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          contactNo: userData.contactNo || '',
          gender: userData.gender || '',
          age: userData.age || null,
          universityName: userData.universityName || '',
          address: userData.address || '',
          events: userData.events || [],
          userType: userData.userType || 'participant',
          referalID: shortid.generate(),
          isvalidated: true,
          createdAt: new Date()
        });

        // Generate QR code
        try {
          const qrCodeBase64 = await generateUserQRCode(newUser._id, {
            name: newUser.name,
            email: newUser.email
          });

          newUser.qrCode = `${newUser._id}`;
          newUser.qrPath = `${newUser._id}`;
          newUser.qrCodeBase64 = qrCodeBase64;
        } catch (qrError) {
          console.error('QR code generation failed:', qrError);
        }

        await newUser.save();

        // Send registration email if requested
        if (sendEmails && newUser.qrCodeBase64) {
          try {
            await sendRegistrationEmail(newUser.email, {
              name: newUser.name,
              events: userData.events || [],
              qrCodeBase64: newUser.qrCodeBase64
            });
            newUser.emailSent = true;
            newUser.emailSentAt = new Date();
            await newUser.save();
          } catch (emailError) {
            console.error(`Failed to send email to ${newUser.email}:`, emailError);
          }
        }

        results.created++;
        results.details.push({
          email: userData.email,
          name: userData.name,
          status: 'created',
          emailSent: sendEmails && newUser.emailSent
        });

      } catch (userError) {
        results.failed++;
        results.details.push({
          email: userData.email || 'Unknown',
          status: 'failed',
          error: userError.message
        });
        console.error(`Error creating user ${userData.email}:`, userError);
      }
    }

    res.json({
      success: true,
      message: `Bulk user creation completed. ${results.created} created, ${results.failed} failed, ${results.skipped} skipped.`,
      results
    });

  } catch (error) {
    console.error('Error in manage-users route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get all teams with member details
router.get("/teams", async (req, res) => {
  try {
    console.log('📥 GET /admin/teams - Query params:', req.query);

    const {
      search,
      eventFilter,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 100
    } = req.query;

    // Build query filters for teams
    const filters = {};

    // Event filter
    if (eventFilter && eventFilter !== 'all') {
      filters.eventName = eventFilter;
    }

    // Search functionality (team name or leader name)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filters.$or = [
        { teamName: searchRegex },
        { 'teamLeader.name': searchRegex }
      ];
    }

    // Sort options
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get teams (without populate to avoid schema issues)
    const teams = await TeamComposition.find(filters)
      .sort(sortObject)
      .limit(parseInt(limit))
      .lean();

    // Transform teams data for frontend
    const teamsWithDetails = teams.map(team => ({
      _id: team._id,
      teamName: team.teamName,
      eventName: team.eventName,
      leader: team.teamLeader ? {
        _id: team.teamLeader.userId,
        name: team.teamLeader.name,
        email: team.teamLeader.email,
        hasEntered: team.teamLeader.hasEntered || false
      } : null,
      members: (team.teamMembers || [])
        .filter(member => member && member.userId) // Filter out empty slots
        .map(member => ({
          _id: member.userId,
          name: member.name,
          email: member.email,
          hasEntered: member.hasEntered || false
        })),
      totalMembers: team.totalMembers || 0,
      registrationComplete: team.registrationComplete || false,
      paymentStatus: team.paymentStatus || 'pending',
      purchaseId: team.purchaseId,
      createdAt: team.createdAt
    }));

    console.log(`✅ Found teams: ${teamsWithDetails.length}`);

    res.json({
      success: true,
      teams: teamsWithDetails,
      totalCount: teamsWithDetails.length
    });

  } catch (error) {
    console.error('Error in teams route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Committee Referrals Analysis endpoint
router.get('/committee-referrals', async (req, res) => {
  try {
    console.log('📊 Analyzing committee referrals...');

    const results = await analyzeCommitteeReferrals();

    // Calculate summary statistics
    const summary = {
      totalCommittees: results.length,
      totalMembers: results.reduce((sum, committee) => sum + committee.totalMembers, 0),
      totalReferrals: results.reduce((sum, committee) => sum + committee.totalReferrals, 0),
      topPerformingCommittee: results[0] || null,
      averageReferralsPerCommittee: results.length > 0 ?
        (results.reduce((sum, committee) => sum + committee.totalReferrals, 0) / results.length).toFixed(2) : 0
    };

    res.json({
      success: true,
      data: results,
      summary: summary
    });

  } catch (error) {
    console.error('Error analyzing committee referrals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze committee referrals',
      error: error.message
    });
  }
});

// Export users as CSV (admin only)
router.get("/export-csv", verifyAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });

    const fields = [
      'Name',
      'Email',
      'Contact No',
      'Gender',
      'University',
      'Address',
      'Events',
      'Has Entered',
      'Entry Time',
      'QR Code Generated'
    ];

    let csv = fields.join(',') + '\n';

    users.forEach(user => {
      const entryTime = user.entryTime ? new Date(user.entryTime).toLocaleString() : 'Not Entered';
      const events = user.events ? user.events.join('; ') : '';
      const qrGen = user.qrCodeBase64 ? 'Yes' : 'No';

      // Handle commas in content by wrapping in quotes
      const row = [
        `"${user.name || ''}"`,
        `"${user.email || ''}"`,
        `"${user.contactNo || ''}"`,
        `"${user.gender || ''}"`,
        `"${user.universityName || ''}"`,
        `"${user.address || ''}"`,
        `"${events}"`,
        user.hasEntered ? 'Yes' : 'No',
        `"${entryTime}"`,
        qrGen
      ];

      csv += row.join(',') + '\n';
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('users_export.csv');
    return res.send(csv);

  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).send('Error generating export');
  }
});

module.exports = router;
