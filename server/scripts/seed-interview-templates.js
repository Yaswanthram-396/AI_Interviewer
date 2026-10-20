// Seeds (or refreshes) the predefined interview templates. Safe to run repeatedly. Usage:
//   node scripts/seed-interview-templates.js        (or: npm run seed:templates)
require("dotenv").config();
const mongoose = require("mongoose");
const { seedTemplates } = require("../interviews/templates/seeder");
const { TEMPLATE_DEFINITIONS } = require("../interviews/templates/definitions");
const banks = require("../interviews/templates/banks");

(async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(process.env.MONGODB_URI);
  const results = await seedTemplates({
    models: {
      InterviewTemplate: require("../models/interviewTemplate.model"),
      InterviewTopic: require("../models/interviewTopic.model"),
      InterviewQuestionBank: require("../models/interviewQuestionBank.model"),
    },
    definitions: TEMPLATE_DEFINITIONS,
    banks,
    log: (r) => console.log(`${r.slug}: ${r.action}${r.version ? ` (v${r.version}, ${r.topics} topics, ${r.questions} questions)` : r.reason ? ` - ${r.reason}` : ""}`),
  });
  console.log(`Done: ${results.length} templates processed`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
