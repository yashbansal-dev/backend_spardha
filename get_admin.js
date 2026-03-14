require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models/models');

async function test() {
    await mongoose.connect(process.env.mongodb);
    const admin = await User.findOne({ isAdmin: true }).lean();
    if(admin) {
        console.log('Admin Email:', admin.email);
        console.log('Admin Password Hash exists:', !!admin.password);
    } else {
        console.log('No admin found!');
    }
    process.exit(0);
}
test();
