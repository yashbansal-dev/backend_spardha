const mongoose = require("mongoose");
require("dotenv").config();
const { User } = require("./models/models");

mongoose.connect(process.env.mongodb).then(async () => {
  const admin = await User.findOne({ isAdmin: true });
  if (admin) {
    console.log("Admin found:", admin.email);
  } else {
    console.log("No admins found!");
  }
  process.exit(0);
});
