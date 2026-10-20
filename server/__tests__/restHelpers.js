const express = require("express");
const { loadAuthConfig } = require("../auth/config");
const { createMemoryAuthRepo } = require("../auth/repo");
const { createAuthService } = require("../auth/service");
const { createAuthHttp } = require("../auth/http");
const { createInterviewRoutes } = require("../routes/interview.routes");

const PW = "correct-horse-battery";
const oid = (n) => n.toString(16).padStart(24, "0");

const lookup = (doc, path) => path.split(".").reduce((value, key) => (Array.isArray(value) ? value.flatMap((item) => item?.[key]) : value?.[key]), doc);
const equalsAny = (actual, expected) => [].concat(actual).some((value) => String(value) === String(expected));
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((sub) => matches(doc, sub));
    const actual = lookup(doc, key);
    if (expected && typeof expected === "object" && "$nin" in expected) return ![].concat(actual).some((value) => expected.$nin.includes(value));
    if (expected && typeof expected === "object" && "$in" in expected) return [].concat(actual).some((value) => expected.$in.includes(value));
    return equalsAny(actual, expected);
  });

/**
 * Minimal stand-in for the Mongoose Interview model: equality, $or, $in/$nin and dotted array paths
 * for queries; $set, $push (with $each) and $pull (by _id) for updates.
 */
function fakeInterviewModel(docs) {
  let counter = 0;
  const nextId = () => oid(++counter + 5000);
  class Interview {
    constructor(data) {
      Object.assign(this, { status: "active", assignments: [] }, data);
      this.assignments = (this.assignments || []).map((a) => ({ _id: nextId(), status: "invited", ...a }));
    }
    async save() {
      if (docs.some((d) => d.code && d.code === this.code)) throw Object.assign(new Error("dup"), { code: 11000 });
      this._id = nextId();
      docs.push({ ...this });
    }
    static find(filter) {
      return { lean: async () => docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) };
    }
    static findById(id) {
      return { lean: async () => (docs.find((d) => d._id === id) ? structuredClone(docs.find((d) => d._id === id)) : null) };
    }
    static async updateOne({ _id }, update) {
      const doc = docs.find((d) => d._id === _id);
      if (!doc) return;
      if (update.$set) Object.assign(doc, update.$set);
      if (update.$push) {
        for (const [key, value] of Object.entries(update.$push)) {
          const items = value.$each ?? [value];
          doc[key] = [...(doc[key] || []), ...items.map((item) => ({ _id: nextId(), status: "invited", ...item }))];
        }
      }
      if (update.$pull) {
        for (const [key, cond] of Object.entries(update.$pull)) doc[key] = (doc[key] || []).filter((item) => String(item._id) !== String(cond._id));
      }
    }
  }
  return Interview;
}

async function restApp({ enforced = true } = {}) {
  const config = loadAuthConfig({ JWT_SECRET: "s".repeat(32), BCRYPT_COST: "4", AUTH_ENFORCED: String(enforced), AUTH_RATE_MAX: "1000" });
  const repo = createMemoryAuthRepo();
  const service = createAuthService({ repo, config });
  const http = createAuthHttp({ service, config });
  const docs = [];
  const Interview = fakeInterviewModel(docs);
  const app = express();
  app.use(express.json());
  app.use("/api/interviews", createInterviewRoutes({ Interview, auth: { ...http, service, config } }));

  const make = async (email, role) => {
    const user = await service.createUser({ email, password: PW, role });
    const session = await service.login({ email, password: PW });
    return { id: user.id, email, auth: `Bearer ${session.accessToken}` };
  };
  return { app, docs, make, service, Interview, authDeps: { ...http, service, config } };
}

module.exports = { restApp, fakeInterviewModel, oid, PW };
