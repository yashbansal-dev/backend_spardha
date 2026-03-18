const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();
const { User } = require("./models/models");

mongoose.connect(process.env.mongodb).then(async () => {
  const email = "admin@spardha.com";
  const password = "admin";
  
  let admin = await User.findOne({ email });
  
  if (admin) {
    admin.isAdmin = true;
    const saltRounds = 12;
    admin.password = await bcrypt.hash(password, saltRounds);
    await admin.save();
    console.log("Admin account updated: admin@spardha.com / admin");
  } else {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    admin = new User({
      name: "Super Admin",
      email: email,
      password: hashedPassword,
      isAdmin: true,
      contactNo: "0000000000",
      gender: "Other",
      universityName: "JKLU",
      address: "Admin",
      isvalidated: true
    });
    await admin.save();
    console.log("Admin account created: admin@spardha.com / admin");
  }
  
  process.exit(0);
});
