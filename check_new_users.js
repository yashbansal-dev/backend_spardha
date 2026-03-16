require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    // Get ALL users sorted by creation date (newest first)
    const users = await User.find().sort({ _id: -1 }).limit(10).lean();
    
    console.log('=== 10 Most Recently Created Users ===\n');
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const hasDetails = !!(u.contactNo && u.universityName);
        console.log(`#${i+1} ${hasDetails ? '✅' : '⚠️  MISSING DETAILS'}`);
        console.log(`   Name: ${u.name || 'EMPTY'}`);
        console.log(`   Email: ${u.email || 'EMPTY'}`);
        console.log(`   Phone: ${u.contactNo || 'EMPTY'}`);
        console.log(`   University: ${u.universityName || 'EMPTY'}`);
        console.log(`   Gender: ${u.gender || 'EMPTY'}`);
        console.log(`   Events: ${(u.events || []).join(', ') || 'NONE'}`);
        console.log(`   isvalidated: ${u.isvalidated}`);
        console.log(`   Created: ${u.createdAt || u._id.getTimestamp()}`);
        console.log('');
    }
    
    process.exit(0);
}
test();
