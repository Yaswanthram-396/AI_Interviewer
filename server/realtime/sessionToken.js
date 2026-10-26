const jwt = require("jsonwebtoken");

/** Resume tokens bind a connection to one server-issued session and interview. */
function createTokenService({ secret, ttlSec }) {
  return {
    sign: (sessionId, interviewId, userId = null) => jwt.sign({ sid: sessionId, iid: interviewId, uid: userId }, secret, { expiresIn: ttlSec }),
    verify: (token) => {
      try {
        const p = jwt.verify(token, secret);
        return typeof p.sid === "string" && typeof p.iid === "string" ? { sessionId: p.sid, interviewId: p.iid, userId: p.uid ?? null } : null;
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createTokenService };
