const crypto = require("crypto");

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

function loadAuthConfig(env = process.env) {
  let jwtSecret = env.JWT_SECRET || null;
  if (!jwtSecret) {
    if (env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set in production");
    jwtSecret = crypto.randomBytes(32).toString("hex"); // dev only: tokens reset on restart
  }
  return {
    // Off by default so the existing anonymous client keeps working until it has a login flow.
    enforced: env.AUTH_ENFORCED === "true",
    jwtSecret,
    accessTtlSec: int(env.ACCESS_TOKEN_TTL_SEC, 15 * 60),
    refreshTtlSec: int(env.REFRESH_TOKEN_TTL_SEC, 14 * 24 * 3600),
    bcryptCost: int(env.BCRYPT_COST, 12),
    maxFailedLogins: int(env.AUTH_MAX_FAILED_LOGINS, 5),
    lockoutMs: int(env.AUTH_LOCKOUT_MS, 15 * 60 * 1000),
    allowedOrigins: (env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
    secureCookies: env.NODE_ENV === "production",
    rateLimit: { windowMs: int(env.AUTH_RATE_WINDOW_MS, 15 * 60 * 1000), max: int(env.AUTH_RATE_MAX, 30) },
  };
}

module.exports = { loadAuthConfig };
