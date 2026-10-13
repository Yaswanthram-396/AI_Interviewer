const express = require("express");
const rateLimit = require("express-rate-limit");
const { AuthError } = require("./errors");
const { ROLES, hasRole } = require("./policies");

const COOKIE = "rt";
const COOKIE_PATH = "/api/auth";

function createAuthHttp({ service, config }) {
  const fail = (res, err) => {
    if (err instanceof AuthError) return res.status(err.status).json({ success: false, code: err.code, message: err.message });
    console.error("auth error:", err.message);
    return res.status(500).json({ success: false, code: "INTERNAL", message: "Server Error" });
  };
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => fail(res, e));

  const setRefreshCookie = (res, token) =>
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: COOKIE_PATH,
      maxAge: config.refreshTtlSec * 1000,
    });
  const clearRefreshCookie = (res) => res.clearCookie(COOKIE, { path: COOKIE_PATH });

  /** Authenticates the Bearer token and sets req.user; optionally restricts to roles. */
  const requireAuth =
    (...roles) =>
    async (req, res, next) => {
      try {
        const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
        const user = m ? await service.authenticate(m[1]) : null;
        if (!user) return res.status(401).json({ success: false, code: "UNAUTHENTICATED", message: "Authentication required" });
        if (roles.length && !hasRole(user, ...roles)) {
          return res.status(403).json({ success: false, code: "FORBIDDEN", message: "Not allowed" });
        }
        req.user = user;
        next();
      } catch (e) {
        fail(res, e);
      }
    };

  /** requireAuth when AUTH_ENFORCED=true; otherwise a pass-through (rollout flag). */
  const gate = (...roles) => (config.enforced ? requireAuth(...roles) : (req, res, next) => next());

  // Cookie-bearing endpoint: reject cross-origin browser requests from non-allowed origins.
  const originOk = (req) => {
    const origin = req.get("origin");
    return !origin || !config.allowedOrigins.length || config.allowedOrigins.includes(origin);
  };

  const body = (req) => (req.body && typeof req.body === "object" ? req.body : {});

  const router = express.Router();
  router.use(rateLimit({ ...config.rateLimit, standardHeaders: true, legacyHeaders: false, message: { success: false, code: "RATE_LIMITED", message: "Too many requests" } }));

  const sendSession = (res, s, status = 200) => {
    setRefreshCookie(res, s.refreshToken);
    res.status(status).json({ success: true, user: s.user, accessToken: s.accessToken });
  };

  router.post("/register", wrap(async (req, res) => sendSession(res, await service.register(body(req)), 201)));
  router.post("/login", wrap(async (req, res) => sendSession(res, await service.login(body(req)))));
  router.post(
    "/refresh",
    wrap(async (req, res) => {
      if (!originOk(req)) throw new AuthError("FORBIDDEN", 403, "Origin not allowed");
      try {
        sendSession(res, await service.refresh(req.cookies?.[COOKIE]));
      } catch (e) {
        clearRefreshCookie(res);
        throw e;
      }
    })
  );
  router.post(
    "/logout",
    wrap(async (req, res) => {
      await service.logout(req.cookies?.[COOKIE]);
      clearRefreshCookie(res);
      res.json({ success: true });
    })
  );
  router.get("/me", requireAuth(), (req, res) => res.json({ success: true, user: req.user }));
  // Recruiters and admins are never self-service: only an admin can create them.
  router.post(
    "/users",
    requireAuth(ROLES.ADMIN),
    wrap(async (req, res) => {
      const u = await service.createUser(body(req));
      res.status(201).json({ success: true, user: service.publicUser(u) });
    })
  );

  return { router, requireAuth, gate };
}

module.exports = { createAuthHttp };
