const crypto = require("crypto");

const toUser = (d) =>
  d && {
    id: String(d._id ?? d.id),
    email: d.email,
    name: d.name,
    role: d.role,
    passwordHash: d.passwordHash,
    tokenVersion: d.tokenVersion ?? 0,
    failedLogins: d.failedLogins ?? 0,
    lockedUntil: d.lockedUntil ?? null,
    disabled: !!d.disabled,
  };

/** MongoDB-backed repository. Duplicate emails surface as { code: "DUPLICATE" }. */
function createMongoAuthRepo({ User, RefreshToken }) {
  return {
    async findUserByEmail(email) {
      return toUser(await User.findOne({ email }).lean());
    },
    async findUserById(id) {
      if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
      return toUser(await User.findById(id).lean());
    },
    async createUser(u) {
      try {
        return toUser((await User.create(u)).toObject());
      } catch (e) {
        if (e.code === 11000) throw Object.assign(new Error("duplicate"), { code: "DUPLICATE" });
        throw e;
      }
    },
    async updateUser(id, patch) {
      await User.updateOne({ _id: id }, { $set: patch });
    },
    async bumpTokenVersion(id) {
      await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } });
    },
    async createRefresh(r) {
      await RefreshToken.create(r);
    },
    async findRefreshByHash(tokenHash) {
      return RefreshToken.findOne({ tokenHash }).lean();
    },
    async markRefreshUsed(tokenHash, at) {
      // Atomic: only one concurrent caller can consume a given token.
      const res = await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: at } });
      return res.modifiedCount === 1;
    },
    async revokeFamily(familyId, at) {
      await RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: at } });
    },
    async revokeAllForUser(userId, at) {
      await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } });
    },
  };
}

/** In-memory repository for tests. */
function createMemoryAuthRepo() {
  const users = new Map();
  const refresh = new Map();
  return {
    users,
    refresh,
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email === email) || null;
    },
    async findUserById(id) {
      return users.get(String(id)) || null;
    },
    async createUser(u) {
      if ([...users.values()].some((x) => x.email === u.email)) {
        throw Object.assign(new Error("duplicate"), { code: "DUPLICATE" });
      }
      const id = crypto.randomBytes(12).toString("hex");
      const user = toUser({ ...u, _id: id });
      users.set(id, user);
      return { ...user };
    },
    async updateUser(id, patch) {
      Object.assign(users.get(String(id)), patch);
    },
    async bumpTokenVersion(id) {
      users.get(String(id)).tokenVersion += 1;
    },
    async createRefresh(r) {
      refresh.set(r.tokenHash, { ...r, revokedAt: null });
    },
    async findRefreshByHash(h) {
      return refresh.get(h) || null;
    },
    async markRefreshUsed(h, at) {
      const r = refresh.get(h);
      if (!r || r.revokedAt) return false;
      r.revokedAt = at;
      return true;
    },
    async revokeFamily(familyId, at) {
      for (const r of refresh.values()) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = at;
    },
    async revokeAllForUser(userId, at) {
      for (const r of refresh.values()) if (r.userId === String(userId) && !r.revokedAt) r.revokedAt = at;
    },
  };
}

module.exports = { createMongoAuthRepo, createMemoryAuthRepo };
