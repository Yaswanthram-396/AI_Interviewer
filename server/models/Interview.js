// models/Interview.js
const mongoose = require("mongoose");

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
      // unique: true,
    },
    generatedQuestions: [
      {
        type: String,
        // required: [true, "Generated questions are required"],
      },
    ],
    description: {
      type: String,
      // maxLength: [500, "Description cannot exceed 500 characters"],
    },

    timeLimit: {
      type: Number,
      // required: [true, "Time limit is required"],
      min: [1, "Time limit must be at least 1 minute"],
    },
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "medium",
    },
    createdDate: {
      type: Date,
      default: Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
InterviewSchema.index({ category: 1, type: 1, isActive: 1 });
InterviewSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Interview", InterviewSchema);
