// Assigns an owner to interviews created before auth existed. Usage:
//   BACKFILL_OWNER_EMAIL=admin@example.com node scripts/backfill-interview-owner.js [--dry-run]
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user.model");
const Interview = require("../models/Interview");

(async () => {
  const email = (process.env.BACKFILL_OWNER_EMAIL || "").trim().toLowerCase();
  if (!email) throw new Error("BACKFILL_OWNER_EMAIL is required");
  await mongoose.connect(process.env.MONGODB_URI);
  const owner = await User.findOne({ email }).lean();
  if (!owner || !["admin", "recruiter"].includes(owner.role)) throw new Error("Owner must be an existing admin or recruiter");
  const filter = { $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: "" }] };
  const count = await Interview.countDocuments(filter);
  if (process.argv.includes("--dry-run")) return console.log(`${count} interviews would be assigned to ${email}`);
  const res = await Interview.updateMany(filter, { $set: { ownerId: String(owner._id) } });
  console.log(`Assigned ${res.modifiedCount} of ${count} interviews to ${email}`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
