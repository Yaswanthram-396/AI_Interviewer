/**
 * Deterministic candidate-intent detection for short utterances. Rule-based on purpose:
 * it is instant, free, and cannot be talked into anything by prompt injection.
 * Long utterances are always treated as answers, so "I would skip the cache" is not a skip.
 */
const INTENT = Object.freeze({
  REPEAT_QUESTION: "REPEAT_QUESTION",
  EXPLAIN_QUESTION: "EXPLAIN_QUESTION",
  HINT: "HINT",
  SKIP_QUESTION: "SKIP_QUESTION",
  DONT_KNOW: "DONT_KNOW",
  END_INTERVIEW: "END_INTERVIEW",
  CONFIRM: "CONFIRM",
  DENY: "DENY",
});

const MAX_WORDS = 14;

const RULES = [
  [
    INTENT.END_INTERVIEW,
    /\b(end|stop|finish|quit|terminate|cancel|leave)\b.{0,20}\b(interview|session|call)\b|\bi('d| would)? ?(want|like) to (end|stop|quit|leave)( here| now)?$/,
  ],
  [INTENT.REPEAT_QUESTION, /\b(repeat|say (that|it) again|come again|pardon|didn'?t (hear|catch))\b|^what\??$/],
  [
    INTENT.EXPLAIN_QUESTION,
    /\b(explain|clarify|rephrase|what do you mean|don'?t (understand|get) (the|this) question|not sure what you('re| are) asking)\b/,
  ],
  [INTENT.HINT, /\b(hint|clue|give me a (pointer|nudge))\b/],
  [INTENT.SKIP_QUESTION, /\b(skip|pass on|next question|move on|move to the next|go to the next|another question)\b/],
  [
    INTENT.DONT_KNOW,
    /^(i )?(really )?(don'?t|do not) know\b|\bno idea\b|\bnot (really )?sure\b|\bi('m| am) (not familiar|unfamiliar)\b|\bhaven'?t (worked|used|done)\b|\bcan'?t (answer|recall|remember)\b/,
  ],
];

// Only meaningful right after the interviewer asked "are you sure you want to end?".
// Otherwise a plain "yes" or "no" is a legitimate technical answer.
const CONFIRMATION_RULES = [
  [INTENT.CONFIRM, /^(yes|yeah|yep|yup|sure|correct|please do|go ahead|that'?s right|confirm(ed)?)\b/],
  [INTENT.DENY, /^(no|nope|nah|not yet|never ?mind|cancel|continue|keep going|let'?s continue)\b/],
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns an INTENT or null when the text should be treated as an answer. */
function detectIntent(text, { expectConfirmation = false } = {}) {
  const normalized = normalize(text);
  if (!normalized || normalized.split(" ").length > MAX_WORDS) return null;
  if (expectConfirmation) {
    for (const [intent, pattern] of CONFIRMATION_RULES) {
      if (pattern.test(normalized)) return intent;
    }
  }
  for (const [intent, pattern] of RULES) {
    if (pattern.test(normalized)) return intent;
  }
  return null;
}

module.exports = { INTENT, detectIntent };
