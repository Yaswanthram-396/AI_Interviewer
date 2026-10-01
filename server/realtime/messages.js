const TURN_ID = /^[A-Za-z0-9_-]{8,64}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MAX_AUDIO_B64 = 96 * 1024;

const fail = (code, message) => ({ ok: false, code, message });

/**
 * Validates one inbound frame. Binary frames are raw PCM16 audio.
 * Returns {ok:true,msg} or {ok:false,code,message}.
 */
function parseClientMessage(raw, isBinary, { maxTextChars = 4000, maxBytes = 128 * 1024 } = {}) {
  if (isBinary) {
    const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
    if (buf.length === 0 || buf.length > maxBytes) return fail("INVALID_MESSAGE", "Bad audio frame size");
    return { ok: true, msg: { type: "audio_chunk", audio: buf } };
  }
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return fail("INVALID_JSON", "Message is not valid JSON");
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.type !== "string") {
    return fail("INVALID_MESSAGE", "Message must be an object with a string `type`");
  }
  const hasTurnId = typeof msg.turnId === "string" && TURN_ID.test(msg.turnId);

  switch (msg.type) {
    case "hello": {
      if (typeof msg.interviewId !== "string" || !OBJECT_ID.test(msg.interviewId)) {
        return fail("INVALID_MESSAGE", "interviewId is required");
      }
      if (msg.resumeToken !== undefined && (typeof msg.resumeToken !== "string" || msg.resumeToken.length > 2048)) {
        return fail("INVALID_MESSAGE", "resumeToken is invalid");
      }
      return { ok: true, msg: { type: "hello", interviewId: msg.interviewId, resumeToken: msg.resumeToken } };
    }
    case "start_interview":
      if (!hasTurnId) return fail("INVALID_MESSAGE", "turnId is required");
      return { ok: true, msg: { type: "start_interview", turnId: msg.turnId } };
    case "user_turn": {
      if (!hasTurnId) return fail("INVALID_MESSAGE", "turnId is required");
      if (typeof msg.text !== "string") return fail("INVALID_MESSAGE", "text is required");
      const text = msg.text.trim();
      if (!text) return fail("INVALID_MESSAGE", "text is empty");
      if (text.length > maxTextChars) return fail("PAYLOAD_TOO_LARGE", "text is too long");
      return { ok: true, msg: { type: "user_turn", turnId: msg.turnId, text } };
    }
    case "audio_chunk": {
      if (typeof msg.audioBase64 !== "string" || !msg.audioBase64 || msg.audioBase64.length > MAX_AUDIO_B64) {
        return fail("INVALID_MESSAGE", "audioBase64 is invalid");
      }
      return { ok: true, msg: { type: "audio_chunk", audio: Buffer.from(msg.audioBase64, "base64") } };
    }
    case "playback_started":
      if (!hasTurnId) return fail("INVALID_MESSAGE", "turnId is required");
      return { ok: true, msg: { type: "playback_started", turnId: msg.turnId } };
    case "start_stt":
    case "stop_stt":
    case "interrupt":
    case "end_interview":
    case "ping":
      return { ok: true, msg: { type: msg.type } };
    default:
      return fail("UNKNOWN_TYPE", "Unknown message type");
  }
}

module.exports = { parseClientMessage, TURN_ID };
