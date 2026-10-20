// Usage: node interviews/templates/check-bank.js <template-slug>   (from the server directory)
const { TEMPLATE_DEFINITIONS } = require("./definitions");
const { validateBank } = require("./bank");
const slug = process.argv[2];
const template = TEMPLATE_DEFINITIONS.find((t) => t.slug === slug);
if (!template) throw new Error(`unknown template ${slug}`);
const errors = validateBank(template, require(`./questions/${slug}`));
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log(`${slug}: bank is valid`);
