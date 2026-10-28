const jwt = require("jsonwebtoken");

/** Resume tokens bind a connection to one server-issued session and interview. */
function createTokenService({ secret, ttlSec }) {
  return {
    sign: (sessionId, interviewId) => jwt.sign({ sid: sessionId, iid: interviewId }, secret, { expiresIn: ttlSec }),
    verify: (token) => {
      try {
        const p = jwt.verify(token, secret);
        return typeof p.sid === "string" && typeof p.iid === "string" ? { sessionId: p.sid, interviewId: p.iid } : null;
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createTokenService };
