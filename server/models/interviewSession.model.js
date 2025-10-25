const mongoose = require("mongoose");

const InterviewSessionSchema = new mongoose.Schema({
  sessionId: { type: String },
  history: [
    {
      role: {
        type: String,
        enum: ["system", "user", "assistant"],
        required: true,
      },
      content: { type: String, required: true },
    },
  ],
  interviewId: { type: String }, // Optional
  interviewDetails: {
    title: String,
    description: String,
    difficulty: String,
  },
  created: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: { type: Date }, // <-- New field
});

module.exports = mongoose.model("InterviewSession", InterviewSessionSchema);
