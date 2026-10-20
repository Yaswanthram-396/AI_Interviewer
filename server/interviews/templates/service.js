/**
 * Template reads and writes against MongoDB. The controller stays thin; the invariants live in validate.js.
 * Templates, topics and bank questions are separate collections linked by ids (the bank is never embedded).
 */
const mongoose = require("mongoose");
const { normalizeTemplateInput, difficultyDistribution } = require("./validate");
const { buildTemplateSnapshot } = require("./snapshot");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(String(value));
const MAX_PAGE_SIZE = 100;

const TEMPLATE_FIELDS = ["title", "description", "category", "durationMinutes", "totalQuestions", "difficulty", "followUpLimit", "timing", "evaluationCriteria", "aiInstructions"];
const TOPIC_FIELDS = ["slug", "description", "questionCount", "allocatedMinutes", "difficulty", "weightage", "sequence", "questionTypes", "evaluationCriteria"];
const pick = (source, keys) => Object.fromEntries(keys.map((k) => [k, source[k]]));

const toSummary = (t) => ({
  id: String(t._id),
  slug: t.slug,
  title: t.title,
  description: t.description,
  category: t.category,
  difficulty: t.difficulty,
  durationMinutes: t.durationMinutes,
  totalQuestions: t.totalQuestions,
  followUpLimit: t.followUpLimit,
  topicCount: (t.topics || []).length,
  status: t.status,
  version: t.version,
});

const toTopic = (t, bankSize) => ({
  id: String(t._id),
  name: t.topicName,
  slug: t.slug,
  description: t.description,
  sequence: t.sequence,
  questionCount: t.questionCount,
  allocatedMinutes: t.allocatedMinutes,
  difficulty: t.difficulty,
  weightage: t.weightage,
  questionTypes: t.questionTypes,
  evaluationCriteria: t.evaluationCriteria,
  ...(bankSize !== undefined && { bankSize }),
});

function createTemplateService({ InterviewTemplate, InterviewTopic, InterviewQuestionBank }) {
  const findTemplate = async (ref) => {
    const key = String(ref || "");
    const filter = isObjectId(key) ? { _id: key } : { slug: key.toLowerCase().slice(0, 80) };
    return InterviewTemplate.findOne(filter).lean();
  };
  const loadTopics = (template) => InterviewTopic.find({ interviewTemplateId: template._id }).sort({ sequence: 1 }).lean();

  return {
    /** Everyone sees active templates; managers may also list drafts and archived ones. */
    async list({ includeInactive = false } = {}) {
      const templates = await InterviewTemplate.find(includeInactive ? {} : { status: "active" }).sort({ createdAt: 1 }).lean();
      return templates.map(toSummary);
    },

    async get(ref, { withBankSize = false } = {}) {
      const template = await findTemplate(ref);
      if (!template) return null;
      const topics = await loadTopics(template);
      let sizes = null;
      if (withBankSize) {
        const counts = await InterviewQuestionBank.aggregate([
          { $match: { interviewTemplateId: template._id, isActive: true } },
          { $group: { _id: "$topicId", total: { $sum: 1 } } },
        ]);
        sizes = new Map(counts.map((c) => [String(c._id), c.total]));
      }
      return {
        ...toSummary(template),
        difficultyDistribution: template.difficultyDistribution,
        timing: template.timing,
        evaluationCriteria: template.evaluationCriteria,
        aiInstructions: template.aiInstructions,
        topics: topics.map((t) => toTopic(t, sizes ? sizes.get(String(t._id)) || 0 : undefined)),
      };
    },

    async topics(ref) {
      const template = await findTemplate(ref);
      return template ? (await loadTopics(template)).map((t) => toTopic(t)) : null;
    },

    /** The frozen configuration form used by sessions; null when the template does not exist or is not active. */
    async snapshot(ref) {
      const template = await findTemplate(ref);
      if (!template || template.status !== "active") return null;
      return buildTemplateSnapshot(template, await loadTopics(template));
    },

    /** A page of a topic's bank, including the evaluator answer key. Callers must restrict this to managers. */
    async questions(ref, topicId, { difficulty, type, page = 1, limit = 20 } = {}) {
      const template = await findTemplate(ref);
      if (!template || !isObjectId(topicId)) return null;
      const topic = await InterviewTopic.findOne({ _id: topicId, interviewTemplateId: template._id }).lean();
      if (!topic) return null;
      const size = Math.min(Math.max(Number(limit) || 20, 1), MAX_PAGE_SIZE);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
      const filter = { interviewTemplateId: template._id, topicId: topic._id, isActive: true, ...(difficulty && { difficulty: String(difficulty).toUpperCase() }), ...(type && { questionType: String(type).toUpperCase() }) };
      const [items, total] = await Promise.all([
        InterviewQuestionBank.find(filter).sort({ _id: 1 }).skip(skip).limit(size).lean(),
        InterviewQuestionBank.countDocuments(filter),
      ]);
      return {
        topic: toTopic(topic),
        total,
        page: Math.floor(skip / size) + 1,
        limit: size,
        questions: items.map((q) => ({
          id: String(q._id),
          questionText: q.questionText,
          difficulty: q.difficulty,
          questionType: q.questionType,
          expectedConcepts: q.expectedConcepts,
          evaluationCriteria: q.evaluationCriteria,
          suggestedAnswerPoints: q.suggestedAnswerPoints,
          tags: q.tags,
        })),
      };
    },

    /** Returns { ok, template } or { ok: false, status, message }. */
    async create(input) {
      const normalized = normalizeTemplateInput(input);
      if (!normalized.ok) return { ok: false, status: 400, message: normalized.message };
      if (await InterviewTemplate.findOne({ slug: normalized.value.slug }).lean()) return { ok: false, status: 409, message: "A template with this slug already exists" };
      const { topics, ...fields } = normalized.value;
      const template = await InterviewTemplate.create({ ...fields, status: "draft", version: 1, topics: [] });
      const created = await InterviewTopic.insertMany(topics.map((t) => ({ ...pick(t, TOPIC_FIELDS), topicName: t.name, interviewTemplateId: template._id })));
      await InterviewTemplate.updateOne({ _id: template._id }, { $set: { topics: created.map((t) => t._id) } });
      return { ok: true, template: await this.get(template._id) };
    },

    /**
     * Replaces the template's configuration and bumps its version. Topics are matched by slug; topics left out are
     * removed (their questions stop being served). Sessions already started keep the configuration they froze.
     */
    async update(ref, input, { status } = {}) {
      const template = await findTemplate(ref);
      if (!template) return { ok: false, status: 404, message: "Template not found" };
      const normalized = normalizeTemplateInput({ ...input, slug: template.slug });
      if (!normalized.ok) return { ok: false, status: 400, message: normalized.message };
      const { topics, slug: _slug, ...fields } = normalized.value;
      void _slug;
      await InterviewTopic.updateMany({ interviewTemplateId: template._id }, { $inc: { sequence: 1000 } });
      const ids = [];
      for (const topic of topics) {
        await InterviewTopic.updateOne({ interviewTemplateId: template._id, slug: topic.slug }, { $set: { ...pick(topic, TOPIC_FIELDS), topicName: topic.name } }, { upsert: true });
        ids.push((await InterviewTopic.findOne({ interviewTemplateId: template._id, slug: topic.slug }).lean())._id);
      }
      const keep = new Set(ids.map(String));
      for (const old of await InterviewTopic.find({ interviewTemplateId: template._id }).lean()) {
        if (keep.has(String(old._id))) continue;
        await InterviewQuestionBank.updateMany({ topicId: old._id }, { $set: { isActive: false } });
        await InterviewTopic.deleteMany({ _id: old._id });
      }
      await InterviewTemplate.updateOne(
        { _id: template._id },
        { $set: { ...pick(fields, TEMPLATE_FIELDS), difficultyDistribution: difficultyDistribution(topics), topics: ids, ...(status && { status }) }, $inc: { version: 1 } }
      );
      return { ok: true, template: await this.get(template._id) };
    },
  };
}

module.exports = { createTemplateService, isObjectId };
