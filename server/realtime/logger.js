const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal structured JSON logger. Callers must pass identifiers and sizes, never
 * transcripts, audio, credentials or other candidate content.
 */
function createLogger(base = {}, { level = process.env.LOG_LEVEL || "info", write } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const out = write || ((line) => process.stdout.write(line + "\n"));
  const make = (ctx) => {
    const log = (lvl) => (msg, fields = {}) => {
      if (LEVELS[lvl] < min) return;
      out(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...ctx, ...fields }));
    };
    return {
      debug: log("debug"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
      child: (extra) => make({ ...ctx, ...extra }),
    };
  };
  return make(base);
}

module.exports = { createLogger };
