const mongoose = require("mongoose");

/**
 * One candidate answer (or skip) with the question it answered and its evaluation.
 * The question text is stored here rather than in a separate collection: it is small, immutable,
 * and always read together with the answer. Unique on (sessionId, turnId) so a replayed turn
 * can never create a second record or a second evaluation.
 */
const InterviewAnswerSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    interviewId: { type: String },
    turnId: { type: String, required: true },
    questionId: { type: String },
    questionText: { type: String, maxlength: 600 },
    questionType: { type: String, enum: ["WARMUP", "MAIN", "FOLLOW_UP"], default: "MAIN" },
    parentQuestionId: { type: String, default: null },
    topic: { type: String, maxlength: 100 },
    difficulty: { type: String, enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"] },
    transcript: { type: String, maxlength: 8000 },
    // PENDING: transcript saved, evaluation not finished. EVALUATION_FAILED: kept for later re-evaluation.
    status: {
      type: String,
      // CLARIFICATION_REQUESTED: the evaluation is kept for audit but not scored; the clarified reply counts instead.
      // SUPERSEDED: the candidate kept talking before this was answered; its text was merged into `supersededBy`.
      enum: ["PENDING", "EVALUATED", "CLARIFICATION_REQUESTED", "EVALUATION_FAILED", "RECORDED", "SKIPPED", "SUPERSEDED"],
      default: "PENDING",
    },
    supersededBy: { type: String },
    skipped: { type: Boolean, default: false },
    evaluation: { type: mongoose.Schema.Types.Mixed },
    promptVersion: { type: String },
    // Template interviews: what the backend planned and measured for this answer.
    questionKind: { type: String }, // CONCEPTUAL | PRACTICAL | OUTPUT_BASED | CODING | SCENARIO_BASED | DESIGN_BASED
    bankQuestionId: { type: String, default: null }, // the question-bank question this was adapted from, if any
    followUpIndex: { type: Number }, // 1-based position of a follow-up under its main question; 0 for a main question
    evaluationCriteria: [{ type: String, maxlength: 200 }],
    timing: { type: mongoose.Schema.Types.Mixed }, // { responseMs, evaluationMs, generationMs }
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

InterviewAnswerSchema.index({ sessionId: 1, turnId: 1 }, { unique: true });
InterviewAnswerSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model("InterviewAnswer", InterviewAnswerSchema);
