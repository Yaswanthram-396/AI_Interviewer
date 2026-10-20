const mongoose = require("mongoose");
const { DIFFICULTIES, TEMPLATE_STATUSES } = require("../interviews/templates/constants");

/**
 * A reusable interview blueprint. Topics and questions live in their own collections and are
 * referenced, so the (large) question bank is never embedded in this document.
 * `version` increases whenever the configuration changes; a session stores the configuration it
 * started with, so editing a template never alters an interview already in progress.
 */
const InterviewTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 1000 },
    category: { type: String, required: true, trim: true, lowercase: true, maxlength: 40, index: true },
    version: { type: Number, default: 1, min: 1 },
    durationMinutes: { type: Number, required: true, min: 5, max: 240 },
    totalQuestions: { type: Number, required: true, min: 1, max: 60 },
    difficulty: { type: String, enum: DIFFICULTIES, default: "INTERMEDIATE" },
    // How many main questions use each difficulty (derived from the topics; sums to totalQuestions).
    difficultyDistribution: {
      BEGINNER: { type: Number, default: 0 },
      INTERMEDIATE: { type: Number, default: 0 },
      ADVANCED: { type: Number, default: 0 },
    },
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "InterviewTopic" }], // ordered by topic.sequence
    followUpLimit: { type: Number, default: 2, min: 0, max: 5 }, // per main question
    // Time model (see interviews/templates/validate.js): follow-ups spend their parent topic's time.
    timing: {
      openingMinutes: { type: Number, default: 1, min: 0 },
      closingMinutes: { type: Number, default: 1, min: 0 },
      transitionSeconds: { type: Number, default: 10, min: 0 },
      approxAnswerSeconds: { type: Number, default: 90, min: 10 },
    },
    evaluationCriteria: [{ type: String, maxlength: 200 }],
    aiInstructions: { type: String, maxlength: 1500 },
    status: { type: String, enum: TEMPLATE_STATUSES, default: "active", index: true },
    seeded: { type: Boolean, default: false }, // created by the seeder (it may refresh these; custom templates are never touched)
    seedHash: { type: String }, // fingerprint of the seeded configuration, so an unchanged re-seed is a no-op
  },
  { timestamps: true }
);

InterviewTemplateSchema.index({ status: 1, category: 1 });

module.exports = mongoose.models.InterviewTemplate || mongoose.model("InterviewTemplate", InterviewTemplateSchema);
