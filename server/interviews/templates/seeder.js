/**
 * Idempotent seeder for the predefined interview templates.
 *
 * - Safe to run any number of times: templates are matched by slug, topics by (template, slug) and
 *   questions by (topic, content hash). A second run with unchanged definitions writes nothing but
 *   the (idempotent) question upserts.
 * - A changed definition updates the template and bumps its `version`. Sessions keep the configuration
 *   they started with, so history is never rewritten.
 * - Never deletes interviews, sessions, answers or evaluations. A template that exists but was not
 *   created by the seeder is left alone.
 */
const crypto = require("crypto");
const { validateTemplateConfig, difficultyDistribution } = require("./validate");
const { validateBank, contentHash } = require("./bank");

const hashOf = (value) => crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
const pick = (source, keys) => Object.fromEntries(keys.map((k) => [k, source[k]]));

/** The definition as the validator expects it (sequence from position, totals derived). */
function normalizeDefinition(definition) {
  const topics = definition.topics.map((t, i) => ({ ...t, sequence: i + 1 }));
  return { ...definition, topics, totalQuestions: topics.reduce((sum, t) => sum + t.questionCount, 0) };
}

/** Throws with every problem found, so a bad definition or bank never reaches the database. */
function assertSeedable(definition, bank) {
  const problems = [...validateTemplateConfig(normalizeDefinition(definition)), ...validateBank(definition, bank)];
  if (problems.length) throw new Error(`Template "${definition.slug}" is invalid:\n- ${problems.join("\n- ")}`);
}

const TEMPLATE_FIELDS = ["title", "description", "category", "durationMinutes", "totalQuestions", "difficulty", "followUpLimit", "timing", "evaluationCriteria", "aiInstructions"];
const TOPIC_FIELDS = ["topicName", "slug", "description", "questionCount", "allocatedMinutes", "difficulty", "weightage", "sequence", "questionTypes", "evaluationCriteria"];

async function seedTemplate({ InterviewTemplate, InterviewTopic, InterviewQuestionBank }, definition, bank) {
  assertSeedable(definition, bank);
  const normalized = normalizeDefinition(definition);
  const seedHash = hashOf(normalized);
  const existing = await InterviewTemplate.findOne({ slug: definition.slug }).lean();
  if (existing && !existing.seeded) return { slug: definition.slug, action: "skipped", reason: "a custom template already uses this slug" };

  const fields = { ...pick(normalized, TEMPLATE_FIELDS), difficultyDistribution: difficultyDistribution(normalized.topics) };
  let action = "unchanged";
  let template = existing;
  if (!existing) {
    await InterviewTemplate.create({ ...fields, slug: definition.slug, status: "active", seeded: true, seedHash, version: 1, topics: [] });
    template = await InterviewTemplate.findOne({ slug: definition.slug }).lean();
    action = "created";
  } else if (existing.seedHash !== seedHash) {
    // Move existing topics out of the way of the unique (template, sequence) index before re-sequencing.
    await InterviewTopic.updateMany({ interviewTemplateId: existing._id }, { $inc: { sequence: 1000 } });
    await InterviewTemplate.updateOne({ _id: existing._id }, { $set: fields, $inc: { version: 1 } });
    template = await InterviewTemplate.findOne({ slug: definition.slug }).lean();
    action = "updated";
  }

  const topicIds = [];
  for (const topic of normalized.topics) {
    const values = { ...pick(topic, TOPIC_FIELDS), topicName: topic.name };
    await InterviewTopic.updateOne({ interviewTemplateId: template._id, slug: topic.slug }, { $set: values }, { upsert: true });
    const stored = await InterviewTopic.findOne({ interviewTemplateId: template._id, slug: topic.slug }).lean();
    topicIds.push(stored._id);

    const questions = bank[topic.slug];
    const hashes = questions.map((q) => contentHash(topic.slug, q.text));
    await InterviewQuestionBank.bulkWrite(
      questions.map((q, i) => ({
        updateOne: {
          filter: { topicId: stored._id, contentHash: hashes[i] },
          update: {
            $set: {
              interviewTemplateId: template._id,
              questionText: q.text,
              difficulty: q.difficulty,
              questionType: q.type,
              expectedConcepts: q.concepts,
              evaluationCriteria: q.criteria,
              suggestedAnswerPoints: q.points,
              tags: q.tags,
            },
            // isActive is set once: an admin who deactivated a question keeps it deactivated across re-seeds.
            $setOnInsert: { isActive: true, createdAt: new Date() },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    // A question that was reworded or removed from the definition is retired, not deleted.
    await InterviewQuestionBank.updateMany({ topicId: stored._id, contentHash: { $nin: hashes } }, { $set: { isActive: false } });
  }

  // Topics dropped from the definition are retired from the template; their questions stop being served.
  const keep = new Set(topicIds.map(String));
  const stale = (await InterviewTopic.find({ interviewTemplateId: template._id }).lean()).filter((t) => !keep.has(String(t._id)));
  for (const topic of stale) {
    await InterviewQuestionBank.updateMany({ topicId: topic._id }, { $set: { isActive: false } });
    await InterviewTopic.deleteMany({ _id: topic._id });
  }
  // The fingerprint is written last: a run interrupted part-way is redone in full next time.
  await InterviewTemplate.updateOne({ _id: template._id }, { $set: { topics: topicIds, seedHash } });

  const updated = await InterviewTemplate.findOne({ slug: definition.slug }).lean();
  return { slug: definition.slug, action, version: updated.version, topics: topicIds.length, questions: Object.values(bank).reduce((sum, list) => sum + list.length, 0) };
}

/** Seeds every definition. `banks` maps a template slug to its question bank. */
async function seedTemplates({ models, definitions, banks, log = () => {} }) {
  const results = [];
  for (const definition of definitions) {
    const result = await seedTemplate(models, definition, banks[definition.slug]);
    log(result);
    results.push(result);
  }
  return results;
}

module.exports = { seedTemplates, seedTemplate, assertSeedable, normalizeDefinition };
