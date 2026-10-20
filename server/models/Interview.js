// models/Interview.js
const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxLength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxLength: 200 },
    // Optional id from the customer's own system (e.g. an employee number).
    externalId: { type: String, trim: true, maxLength: 60 },
    // Bound the first time the candidate signs in and starts the interview.
    userId: { type: String },
    status: { type: String, enum: ["invited", "not_started", "in_progress", "completed"], default: "invited" },
    invitedAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    completedAt: { type: Date },
    sessionId: { type: String },
  },
  { _id: true }
);

const InterviewSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Interview title is required"],
      trim: true,
      minLength: [5, "Title must be at least 5 characters long"],
      maxLength: [100, "Title cannot exceed 100 characters"],
    },
    assessmentId: {
      type: String,
      // required: [true, "Interview ID is required"],
      unique: true,
      sparse: true,
    },

    description: {
      type: String,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },

    timeLimit: {
      type: Number,
      // required: [true, "Time limit is required"],
      min: [1, "Time limit must be at least 1 minute"],
    },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Intermediate",
    },
    // draft: not visible to candidates. archived: hidden from lists, kept for reports.
    status: { type: String, enum: ["draft", "active", "completed", "archived"], default: "active", index: true },
    // Short public identifier shown to admins and candidates, e.g. SIRI-4F2A.
    code: { type: String, unique: true, sparse: true },
    // Set when the interview was created from a template: sessions then read the template's topics, counts and timing.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewTemplate", index: true },
    // Validated by interviews/settings.js: role, topics, question counts, behaviour, personality...
    settings: { type: mongoose.Schema.Types.Mixed },
    assignments: { type: [AssignmentSchema], default: [] },
    ownerId: { type: String, index: true }, // recruiter who created it
    candidateId: { type: String, index: true }, // legacy single assignment (kept for existing data)
    createdDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
InterviewSchema.index({ category: 1, type: 1, isActive: 1 });
InterviewSchema.index({ createdBy: 1 });
InterviewSchema.index({ "assignments.email": 1 });
InterviewSchema.index({ "assignments.userId": 1 });

module.exports = mongoose.model("Interview", InterviewSchema);
