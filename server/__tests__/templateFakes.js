/**
 * An in-memory stand-in for the few Mongoose model methods the template seeder uses
 * (equality and $nin filters, $set/$setOnInsert/$inc updates, upsert, bulkWrite, unique indexes).
 */
function fakeCollection({ unique = [] } = {}) {
  const docs = [];
  let counter = 0;
  const newId = () => `id${String(++counter).padStart(22, "0")}`;
  const same = (a, b) => String(a) === String(b);
  const match = (doc, filter) =>
    Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object" && "$nin" in value) return !value.$nin.some((x) => same(x, doc[key]));
      return same(doc[key], value);
    });
  const assertUnique = (candidate) => {
    for (const keys of unique) {
      const clash = docs.find((d) => d !== candidate && d._id !== candidate._id && keys.every((k) => same(d[k], candidate[k])));
      if (clash) throw Object.assign(new Error(`duplicate key on ${keys.join(",")}`), { code: 11000 });
    }
  };
  const apply = (doc, update) => {
    const next = { ...doc, ...(update.$set || {}) };
    for (const [key, by] of Object.entries(update.$inc || {})) next[key] = (next[key] || 0) + by;
    return next;
  };
  const chain = (rows) => ({
    sort(spec) {
      const [[key, dir]] = Object.entries(spec);
      return chain([...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * dir));
    },
    lean: async () => structuredClone(rows),
  });

  const api = {
    docs,
    find: (filter = {}) => chain(docs.filter((d) => match(d, filter))),
    findOne: (filter = {}) => ({ lean: async () => structuredClone(docs.find((d) => match(d, filter)) ?? null) }),
    async create(data) {
      const doc = { _id: newId(), createdAt: new Date(), ...structuredClone(data) };
      assertUnique(doc);
      docs.push(doc);
      return doc;
    },
    async updateOne(filter, update, { upsert = false } = {}) {
      const index = docs.findIndex((d) => match(d, filter));
      if (index === -1) {
        if (!upsert) return;
        const plain = Object.fromEntries(Object.entries(filter).filter(([, v]) => !(v && typeof v === "object")));
        const doc = apply({ _id: newId(), ...plain, ...structuredClone(update.$setOnInsert || {}) }, { ...update, $set: structuredClone(update.$set || {}) });
        assertUnique(doc);
        docs.push(doc);
        return;
      }
      const next = apply(docs[index], structuredClone(update));
      assertUnique(next);
      docs[index] = next;
    },
    async updateMany(filter, update) {
      const targets = docs.filter((d) => match(d, filter));
      // $inc on a unique key is applied to every target before the check, as the database would do at the end of the statement.
      const updated = targets.map((d) => apply(d, update));
      for (const next of updated) assertUnique(next);
      targets.forEach((d, i) => docs.splice(docs.indexOf(d), 1, updated[i]));
    },
    async deleteMany(filter) {
      for (let i = docs.length - 1; i >= 0; i -= 1) if (match(docs[i], filter)) docs.splice(i, 1);
    },
    async bulkWrite(ops) {
      for (const { updateOne } of ops) await api.updateOne(updateOne.filter, updateOne.update, { upsert: !!updateOne.upsert });
    },
    async countDocuments(filter = {}) {
      return docs.filter((d) => match(d, filter)).length;
    },
  };
  return api;
}

/** Fake template/topic/question-bank models with the same unique keys as the real schemas. */
function fakeTemplateModels() {
  return {
    InterviewTemplate: fakeCollection({ unique: [["slug"]] }),
    InterviewTopic: fakeCollection({ unique: [["interviewTemplateId", "sequence"], ["interviewTemplateId", "slug"]] }),
    InterviewQuestionBank: fakeCollection({ unique: [["topicId", "contentHash"]] }),
  };
}

module.exports = { fakeCollection, fakeTemplateModels };
