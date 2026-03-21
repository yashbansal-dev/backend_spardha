const mongoose = require('mongoose');
const { User, Purchase } = require('/home/yashbansal/backend/models/models');
require('dotenv').config({ path: '/home/yashbansal/backend/.env' });

async function check() {
    await mongoose.connect(process.env.mongodb);
    
    console.log('--- USERS WITH EMAIL ---');
    const users = await User.find({ 
        email: /yashbansal531@gmail.com/i
    });
    console.log(JSON.stringify(users, null, 2));
    
    mongoose.connection.close();
}

check();
