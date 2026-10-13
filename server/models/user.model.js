const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxLength: 320 },
    name: { type: String, trim: true, maxLength: 100 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["candidate", "recruiter", "admin"], required: true, default: "candidate" },
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
