const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function createTokens({ secret, accessTtlSec }) {
  return {
    signAccess(user) {
      return jwt.sign({ role: user.role, ver: user.tokenVersion }, secret, {
        subject: String(user.id),
        expiresIn: accessTtlSec,
        algorithm: "HS256",
      });
    },
    verifyAccess(token) {
      try {
        const p = jwt.verify(token, secret, { algorithms: ["HS256"] });
        return typeof p.sub === "string" ? { userId: p.sub, role: p.role, ver: p.ver } : null;
      } catch {
        return null;
      }
    },
  };
}

/** Refresh tokens are random opaque values; only their SHA-256 is stored. */
const newRefreshToken = () => crypto.randomBytes(32).toString("base64url");
const hashRefreshToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

module.exports = { createTokens, newRefreshToken, hashRefreshToken };
