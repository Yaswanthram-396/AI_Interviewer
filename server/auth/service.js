const crypto = require("crypto");
const { AuthError } = require("./errors");
const { ROLES } = require("./policies");
const { checkPasswordPolicy, hashPassword, verifyPassword } = require("./password");
const { createTokens, newRefreshToken, hashRefreshToken } = require("./tokens");

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const normalizeEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

const BAD_CREDENTIALS = () => new AuthError("INVALID_CREDENTIALS", 401, "Invalid email or password");
const BAD_REFRESH = () => new AuthError("INVALID_REFRESH_TOKEN", 401, "Session expired; please sign in again");

function createAuthService({ repo, config, now = Date.now }) {
  const tokens = createTokens({ secret: config.jwtSecret, accessTtlSec: config.accessTtlSec });
  // Compared against when the email is unknown so response time doesn't reveal which emails exist.
  const dummyHash = hashPassword(crypto.randomBytes(16).toString("hex"), config.bcryptCost);

  async function issueSession(user, familyId = crypto.randomUUID()) {
    const refreshToken = newRefreshToken();
    await repo.createRefresh({
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now() + config.refreshTtlSec * 1000),
    });
    return { user: publicUser(user), accessToken: tokens.signAccess(user), refreshToken };
  }

  async function createUser({ email, password, name, role }) {
    const e = normalizeEmail(email);
    if (!EMAIL_RE.test(e)) throw new AuthError("INVALID_EMAIL", 400, "A valid email is required");
    const problem = checkPasswordPolicy(password, e);
    if (problem) throw new AuthError("WEAK_PASSWORD", 400, problem);
    if (!Object.values(ROLES).includes(role)) throw new AuthError("INVALID_ROLE", 400, "Invalid role");
    const cleanName = typeof name === "string" ? name.trim().slice(0, 100) : undefined;
    try {
      return await repo.createUser({
        email: e,
        name: cleanName,
        role,
        passwordHash: await hashPassword(password, config.bcryptCost),
        tokenVersion: 0,
      });
    } catch (err) {
      if (err.code === "DUPLICATE") throw new AuthError("EMAIL_TAKEN", 409, "An account with this email already exists");
      throw err;
    }
  }

  return {
    createUser,
    publicUser,

    async findUserByEmail(email) {
      const u = await repo.findUserByEmail(normalizeEmail(email));
      return u && !u.disabled ? publicUser(u) : null;
    },

    /** Public self-signup: always a candidate. */
    async register({ email, password, name }) {
      const user = await createUser({ email, password, name, role: ROLES.CANDIDATE });
      return issueSession(user);
    },

    async login({ email, password }) {
      const e = normalizeEmail(email);
      const user = typeof password === "string" && e ? await repo.findUserByEmail(e) : null;
      if (!user) {
        await verifyPassword(String(password ?? ""), await dummyHash);
        throw BAD_CREDENTIALS();
      }
      if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now()) {
        throw new AuthError("ACCOUNT_LOCKED", 429, "Too many failed attempts; try again later");
      }
      if (!(await verifyPassword(password, user.passwordHash)) || user.disabled) {
        const failed = (user.failedLogins || 0) + 1;
        const locked = failed >= config.maxFailedLogins;
        await repo.updateUser(user.id, {
          failedLogins: locked ? 0 : failed,
          lockedUntil: locked ? new Date(now() + config.lockoutMs) : null,
        });
        throw BAD_CREDENTIALS();
      }
      if (user.failedLogins || user.lockedUntil) await repo.updateUser(user.id, { failedLogins: 0, lockedUntil: null });
      return issueSession(user);
    },

    /** Rotates the refresh token. Presenting an already-used token revokes the whole family. */
    async refresh(raw) {
      if (typeof raw !== "string" || !raw) throw BAD_REFRESH();
      const hash = hashRefreshToken(raw);
      const rec = await repo.findRefreshByHash(hash);
      if (!rec) throw BAD_REFRESH();
      if (rec.revokedAt) {
        await repo.revokeFamily(rec.familyId, new Date(now()));
        throw BAD_REFRESH();
      }
      if (new Date(rec.expiresAt).getTime() <= now()) throw BAD_REFRESH();
      if (!(await repo.markRefreshUsed(hash, new Date(now())))) {
        await repo.revokeFamily(rec.familyId, new Date(now()));
        throw BAD_REFRESH();
      }
      const user = await repo.findUserById(rec.userId);
      if (!user || user.disabled) throw BAD_REFRESH();
      return issueSession(user, rec.familyId);
    },

    async logout(raw) {
      if (typeof raw !== "string" || !raw) return;
      const rec = await repo.findRefreshByHash(hashRefreshToken(raw));
      if (rec) await repo.revokeFamily(rec.familyId, new Date(now()));
    },

    /** Returns the current user for a valid access token, or null. Checks tokenVersion and disabled state. */
    async authenticate(accessToken) {
      const claims = tokens.verifyAccess(accessToken);
      if (!claims) return null;
      const user = await repo.findUserById(claims.userId);
      if (!user || user.disabled || user.tokenVersion !== claims.ver) return null;
      return publicUser(user);
    },

    /** Invalidates every access and refresh token for the user (e.g. after a password change). */
    async revokeAll(userId) {
      await repo.bumpTokenVersion(userId);
      await repo.revokeAllForUser(userId, new Date(now()));
    },
  };
}

module.exports = { createAuthService };
