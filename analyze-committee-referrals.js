require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("./models/models");

// Committee data structure
const committeeData = {
  "ORGANIZING COMMITTEE": [
    "2023BTech027"
  ],
  "DISCIPLINE TEAM": [
    "2024BBA068", "2023BBA029", "2024BTECH205", "2024BTECH235", "2024BTECH092", 
    "2024BBA060", "2024BTECH190", "2024BBA101", "2024BTECH254", "2024BBA051", 
    "2024BBA019", "2025BTECH006", "2025BBA007", "2025BTECH007", "2025BBA020", 
    "2025BBA024", "2025BBA025", "2025BBA027", "2025BBA119", "2025BBA037", 
    "2025BBA039", "2025BBA040", "2025BTECH024", "2025BBA043", "2025BBA046", 
    "2025BBA047", "2025BTECH028", "2025BBA048", "2025BBA057", "2025BBA113", 
    "2025BTECH258", "2025BDES025", "2025BBA083", "2025BBA091", "2025BTECH099", 
    "2025BTECH100", "2025BBA096", "2025BTECH111", "2025BTECH116", "2025BBA110", 
    "2025BTECH117", "2025BBA112", "2025BTECH281", "2025BBA087", "2025BBA121", 
    "2025BBA074"
  ],
  "TECH & SUPPORT TEAM": [
    "2023Btech086", "2024BTECH014", "2024BTech085", "2024BTECH248", "2024Btech035", 
    "2024BTech057", "2024BTech249", "2024BTech136", "2025Btech1244", "2025BTech105", 
    "2025BTech273", "2025BTech084", "2025Btech113", "2025Btech233", "2025BTech096", 
    "2025Btech080", "2025BTech195", "2025Btech132", "2025BTech214", "2025Btech121", 
    "2025BTech092", "2025Btech051", "2025Btech086", "2025Btech188", "2025Btech083"
  ],
  "TRANSPORTATION TEAM": [
    "2023BTech010", "2024BTech193", "2024BTech198", "2024BTech220", "2024BTech028", 
    "2024BTech125", "2025BTech274"
  ],
  "PRIZE & CERTIFICATES TEAM": [
    "2023BTech091", "2023BTech069", "2024BTech104", "2024BTech224", "2023BTech061", 
    "2025BBA017", "2023BBA041", "2025BTech055", "2024BBA027", "2023BBA017", 
    "2025BTech101", "2025BTech276", "2025BBA098", "2025BDes007", "2025BTech245"
  ],
  "PHOTOGRAPHY TEAM": [
    "2023Btech076", "2023BTech028", "2024BTech147", "2024BTech148", "2024BTech129", 
    "2024BTech049", "2025BTech175", "2025BTech283", "2025BBA075", "2025BTech146", 
    "2025BBA025", "2025BBA0144", "2025BBA014", "2025BBA122", "2025BTech124", 
    "2025BTech314", "2025BTech193", "2025BTech166", "2024BDes024", "2025BTech292", 
    "2025BBA060"
  ],
  "STAGE & VENUE TEAM": [
    "2023BBA055", "2024BDes016", "2024BTech262", "2024BTech122", "2024BTech162", 
    "2024BDes009", "2024BTech029", "2025BBA111", "2025BBA082", "2025BBA075", 
    "2025BBA104", "2025BTech251", "2025BBA072", "2025BTech138", "2025BTech026", 
    "2025BTech098", "2025BDes011", "2025BBA010", "2025BTech102", "2025BTech192"
  ],
  "REGISTRATIONS TEAM": [
    "2023BBA010", "2024BTech245", "2024BBA069", "2024BBA010", "2024BBA080", 
    "2024BDes027", "2024BBA050", "2024BTech076", "2024BBA011", "2024BBA009", 
    "2025BTech126", "2025BBA041", "2025BTech059", "2025BDes004", "2025BTech182", 
    "2025BBA061", "2025BBA059", "2025BTech212", "2025BTech325", "2025BTech290", 
    "2025BBA090", "2025BBA097", "2025BTech094", "2025BTech258", "2024BBA006", 
    "2024BTech236"
  ],
  "SOCIAL MEDIA TEAM": [
    "2023BBA057", "2024BTech032", "2024BTech053", "2024BTech182", "2024BTech110", 
    "2024BTech008", "2025BTech125", "2025BTech161", "2025BTech036", "2025BTech133", 
    "2025BTech088", "2025BTech091", "2025BBA004", "2025BTech263"
  ],
  "HOSPITALITY TEAM": [
    "2023BBA002", "2024BTech100", "2024BDes007", "2024BTech118", "2024BTech234", 
    "2024BTech133", "2024BBA024", "2024BBA093", "2025BDes024", "2025BTech078", 
    "2025BTech093", "2025BTech095", "2025BTech1489", "2025BBA115", "2025BDes018", 
    "2025BDes026"
  ],
  "INTERNAL ARRANGEMENTS TEAM": [
    "2023Bba032", "2024Bba067", "2024Btech030", "2024Bba008", "2024Bdes028", 
    "2024Btech036", "2024Bba037", "2024Btech259", "2024Bba036", "2025Btech246", 
    "2025BBA029", "2025Bbba013", "2025Bbba093", "2025Btech008", "2025Btech266", 
    "2025Bba051", "2025Btech104", "2025Btech241", "2025BTech230", "2025Btech127", 
    "2025Bba095", "2025Btech049"
  ],
  "CULTURAL EVENTS TEAM": [
    "2023BBA048", "2024Btech015", "2024btech277", "2024BTech140", "2024btech183", 
    "2024BTech044", "2024Bdes005", "2024btech059", "2024Btech064", "2024BTech025", 
    "2024Btech090", "2024Btech037", "2025BTech067", "2025Btech071", "2025BTech187", 
    "2025BTech250", "2023BBA013", "2023BBA020", "2023BBA034", "2025BBA100", 
    "2025BBA101", "2023BBA052", "2025BTech291", "2025Bdes005", "2025Btech072", 
    "2025BTECH248", "2025btech327", "2025Bdes014", "2025btech144", "2025btech334", 
    "2025BBA066", "2025BTech156", "2025BBA071", "2025BTech164", "2025BBA092", 
    "2025BBA103", "2025BTech225", "2025BDes035", "2025Btech077", "2025Btech021"
  ],
  "DECOR TEAM": [
    "2023BDes023", "2023BDes024", "2024BTech063", "2024BTech241", "2024BTech094", 
    "2024BTech275", "2025BTech017", "2025BTech244", "2025BTech068", "2025BDes001", 
    "2025BTech186", "2025BTech013", "2025BBA145", "2025BTech295", "2025BTech298", 
    "2025BTech289", "2025BTech076", "2025BBA011", "2025BTech203", "2025BDes035", 
    "2025BTech038", "2025BTech316", "2025BTech318", "2025BTech047", "2025BTech056", 
    "2025BTech288"
  ],
  "SPONSORSHIP & PROMOTIONS TEAM": [
    "2024BBA054", "2024BBA072", "2024BBA032", "2024BBA084", "2024BTech215", 
    "2025BTech061", "2025BBA068", "2025BBA030", "2025BBA024", "2025BTech304", 
    "2025BTech269", "2025BTech338", "2025BTech306", "2025BTech357", "2025BTech319", 
    "2025BBA124"
  ],
  "MEDIA & REPORT TEAM": [
    "2023BBA040", "2024Btech017", "2024Btech231", "2024Btech253", "2024Btech185", 
    "2024Btech222", "2025BBA086", "2025BBA045", "2025BBA011", "2025BBA005", 
    "2025BBA058", "2025Btech073", "2025Btech165", "2025BBA044", "2025Btech087"
  ],
  "ANCHORS TEAM": [
    "2023BBA012", "2025BBA005", "2024Bdes017", "2024BBA086", "2024BTech153", 
    "2025BDes002", "2025BTech016", "2025BTech142", "2025BTech022", "2025BDes0220", 
    "2024BTech031", "2024BBA027", "2024BTech110", "2024BTech255", "2024BTech059", 
    "2025BTech011", "2025BTech084", "2025BTech025", "2025BTech070"
  ],
  "DESIGN TEAM": [
    "2024BDes032", "2025BTech171", "2025BDes040"
  ]
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.mongodb, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("Database Connected Successfully");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  }
};

// Function to analyze committee referrals
async function analyzeCommitteeReferrals() {
  try {
    // Check if already connected, if not connect
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    
    console.log("🚀 Starting optimized committee referrals analysis...");
    
    // Step 1: Get all roll numbers from all committees
    const allRollNumbers = [];
    Object.values(committeeData).forEach(rollNumbers => {
      allRollNumbers.push(...rollNumbers.map(roll => roll.trim()));
    });
    
    console.log(`📊 Analyzing ${allRollNumbers.length} total roll numbers...`);
    
    // Step 2: Single aggregation query to get all referral counts at once
    const referralCounts = await User.aggregate([
      {
        $match: {
          referralCode: { $exists: true, $ne: "" }
        }
      },
      {
        $group: {
          _id: { $toLower: "$referralCode" },
          count: { $sum: 1 },
          users: {
            $push: {
              name: "$name",
              email: "$email",
              events: "$events",
              createdAt: "$createdAt",
              originalReferralCode: "$referralCode"
            }
          }
        }
      }
    ]);
    
    console.log(`📈 Found ${referralCounts.length} unique referral codes in database`);
    
    // Step 3: Create a lookup map for fast access
    const referralMap = new Map();
    referralCounts.forEach(item => {
      referralMap.set(item._id, {
        count: item.count,
        users: item.users
      });
    });
    
    // Step 4: Process each committee using the lookup map
    const results = [];
    
    for (const [committeeName, rollNumbers] of Object.entries(committeeData)) {
      console.log(`\n📋 Processing ${committeeName}...`);
      
      const committeeStats = {
        committeeName,
        totalMembers: rollNumbers.length,
        memberReferrals: [],
        totalReferrals: 0
      };
      
      // Process each roll number using the lookup map
      for (const rollNumber of rollNumbers) {
        const normalizedRoll = rollNumber.trim().toLowerCase();
        const referralData = referralMap.get(normalizedRoll);
        
        const memberData = {
          rollNumber,
          referralCount: referralData ? referralData.count : 0,
          referredUsers: referralData ? referralData.users : []
        };
        
        committeeStats.memberReferrals.push(memberData);
        committeeStats.totalReferrals += memberData.referralCount;
        
        if (memberData.referralCount > 0) {
          console.log(`  ✅ ${rollNumber}: ${memberData.referralCount} referrals`);
        }
      }
      
      // Sort members by referral count (highest first)
      committeeStats.memberReferrals.sort((a, b) => b.referralCount - a.referralCount);
      
      results.push(committeeStats);
      console.log(`📊 ${committeeName} Total: ${committeeStats.totalReferrals} referrals`);
    }
    
    // Sort committees by total referrals
    results.sort((a, b) => b.totalReferrals - a.totalReferrals);
    
    console.log("\n=== COMMITTEE REFERRAL SUMMARY ===");
    results.forEach(committee => {
      console.log(`${committee.committeeName}: ${committee.totalReferrals} total referrals (${committee.totalMembers} members)`);
    });
    
    return results;
    
  } catch (error) {
    console.error("Error analyzing committee referrals:", error);
    throw error;
  }
  // Don't close connection when used as API - let the main server handle it
}

// Export for use in API
module.exports = { analyzeCommitteeReferrals, committeeData };

// Run if called directly
if (require.main === module) {
  analyzeCommitteeReferrals()
    .then(results => {
      console.log("\nAnalysis complete!");
      mongoose.connection.close();
      process.exit(0);
    })
    .catch(error => {
      console.error("Analysis failed:", error);
      mongoose.connection.close();
      process.exit(1);
    });
}
