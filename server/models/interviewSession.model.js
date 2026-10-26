const mongoose = require("mongoose");

const InterviewSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  history: [
    {
      role: {
        type: String,
        enum: ["system", "user", "assistant"],
        required: true,
      },
      content: { type: String, required: true },
      turnId: { type: String },
      at: { type: Date, default: Date.now },
    },
  ],
  interviewId: { type: String }, // Optional
  userEmail: { type: String },
  userName: { type: String },
  templateId: { type: String, index: true }, // queryable copy of interviewDetails.template.templateId
  templateVersion: { type: Number },
  userId: { type: String }, // authenticated user the session is bound to (null while auth is not enforced)
  interviewDetails: {
    title: String,
    description: String,
    difficulty: String,
    timeLimit: Number, // minutes
    settings: mongoose.Schema.Types.Mixed, // per-interview configuration; must survive a restart-resume
    // Frozen copy of the interview template (topics, counts, timing) taken when the session started.
    // Editing the template later never changes a session already in progress.
    template: mongoose.Schema.Types.Mixed,
  },
  // Small, bounded snapshot of the interview engine (current question, counters, rolling summary).
  engineState: { type: mongoose.Schema.Types.Mixed },
  conversationState: { type: String }, // INITIALIZING | AI_SPEAKING | LISTENING | ... | COMPLETED
  completedAt: { type: Date },
  created: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

InterviewSessionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("InterviewSession", InterviewSessionSchema);
