require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models/models');
const bcrypt = require('bcrypt');
const shortid = require('shortid');

async function test() {
    await mongoose.connect(process.env.mongodb);
    
    // Check if yashbansal531@gmail.com exists and make them admin
    const email = 'spardha@jklu.edu.in';
    const password = 'admin';
    
    let adminUser = await User.findOne({ email });
    
    if (adminUser) {
        console.log("User exists, upgrading to admin and setting password to 'admin'");
        const hashed = await bcrypt.hash(password, 12);
        adminUser.isAdmin = true;
        adminUser.password = hashed;
        await adminUser.save();
        console.log("Updated existing user.");
    } else {
        console.log("Creating new admin user");
        const hashed = await bcrypt.hash(password, 12);
        adminUser = new User({
            name: "Spardha Admin",
            email: email,
            password: hashed,
            isAdmin: true,
            referalID: shortid.generate()
        });
        await adminUser.save();
        console.log("Created new admin user.");
    }
    
    process.exit(0);
}
test();
