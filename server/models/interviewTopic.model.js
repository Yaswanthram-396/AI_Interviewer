const mongoose = require("mongoose");
const { DIFFICULTIES, QUESTION_TYPE_LIST } = require("../interviews/templates/constants");

/** One topic of an interview template: how many main questions it gets and how much time it may use. */
const InterviewTopicSchema = new mongoose.Schema(
  {
    interviewTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewTemplate", required: true },
    topicName: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    description: { type: String, required: true, maxlength: 600 },
    questionCount: { type: Number, required: true, min: 0, max: 20 }, // main questions; follow-ups never count
    allocatedMinutes: { type: Number, required: true, min: 0 }, // includes the time follow-ups spend
    difficulty: { type: String, enum: DIFFICULTIES, default: "INTERMEDIATE" },
    weightage: { type: Number, required: true, min: 0, max: 100 }, // share of the overall score; a template totals 100
    sequence: { type: Number, required: true, min: 1 }, // order in the interview, starting at 1
    questionTypes: { type: [{ type: String, enum: QUESTION_TYPE_LIST }], validate: (v) => v.length > 0 },
    evaluationCriteria: [{ type: String, maxlength: 200 }],
  },
  { timestamps: true }
);

InterviewTopicSchema.index({ interviewTemplateId: 1, sequence: 1 }, { unique: true });
InterviewTopicSchema.index({ interviewTemplateId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.models.InterviewTopic || mongoose.model("InterviewTopic", InterviewTopicSchema);
