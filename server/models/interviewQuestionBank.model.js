const mongoose = require("mongoose");
const { DIFFICULTIES, QUESTION_TYPE_LIST } = require("../interviews/templates/constants");

/**
 * A reference question for a topic. The bank holds the *intent* and the answer key (expected concepts,
 * suggested answer points); the model adapts a bank question to the conversation or writes a new one
 * in its place. `suggestedAnswerPoints` is an evaluator answer key and must never reach a candidate.
 */
const InterviewQuestionBankSchema = new mongoose.Schema(
  {
    interviewTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewTemplate", required: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewTopic", required: true },
    questionText: { type: String, required: true, maxlength: 500 },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    questionType: { type: String, enum: QUESTION_TYPE_LIST, required: true },
    expectedConcepts: [{ type: String, maxlength: 200 }],
    evaluationCriteria: [{ type: String, maxlength: 200 }],
    suggestedAnswerPoints: [{ type: String, maxlength: 300 }],
    tags: [{ type: String, lowercase: true, trim: true, maxlength: 40 }],
    isActive: { type: Boolean, default: true },
    // Identity of the question within its topic, so seeding twice never creates a duplicate.
    contentHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Selection query: active questions of a topic, narrowed by type and difficulty.
InterviewQuestionBankSchema.index({ interviewTemplateId: 1, topicId: 1, isActive: 1, questionType: 1, difficulty: 1 });
InterviewQuestionBankSchema.index({ topicId: 1, contentHash: 1 }, { unique: true });

module.exports = mongoose.models.InterviewQuestionBank || mongoose.model("InterviewQuestionBank", InterviewQuestionBankSchema);
