import { describe, expect, it } from "vitest";
import {
  canStartRecording,
  initialTurnState,
  isMicMuted,
  shouldAutoListen,
  turnReducer,
  type TurnEvent,
  type TurnState,
} from "./interviewTurnMachine";

const run = (events: TurnEvent[], from: TurnState = { ...initialTurnState }) => events.reduce(turnReducer, from);
const ready = (bargeIn = false): TurnEvent => ({ type: "SESSION_READY", bargeIn });
const ctx = { sessionStarted: true, connected: true };

/** Session ready, greeting asked and delivered with audio (generation g1), so the AI is speaking. */
const speaking = (bargeIn = false) =>
  run([ready(bargeIn), { type: "GREETING_REQUESTED", turnId: "t1" }, { type: "REPLY_RECEIVED", turnId: "t1", generationId: "g1", hasAudio: true }]);

describe("normal flow", () => {
  it("goes PROCESSING -> AI_SPEAKING -> LISTENING only after playback actually ends", () => {
    let s = run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }]);
    expect(s.phase).toBe("PROCESSING");
    s = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t1", generationId: "g1", hasAudio: true });
    expect(s.phase).toBe("AI_SPEAKING"); // the backend finishing is not enough
    s = turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t1", generationId: "g1" });
    expect(s.phase).toBe("LISTENING");
    s = turnReducer(s, { type: "TURN_COMMITTED", turnId: "t2" });
    expect(s.phase).toBe("PROCESSING");
  });

  it("a text-only reply (TTS failed) hands the floor straight back", () => {
    const s = run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }, { type: "REPLY_RECEIVED", turnId: "t1", hasAudio: false }]);
    expect(s.phase).toBe("LISTENING");
  });
});

describe("reconnecting", () => {
  it("a resumed session gives the floor back; a fresh one waits for the greeting", () => {
    expect(turnReducer(initialTurnState, { type: "SESSION_READY", bargeIn: false, resumed: true }).phase).toBe("LISTENING");
    expect(turnReducer(initialTurnState, { type: "SESSION_READY", bargeIn: false }).phase).toBe("IDLE");
    expect(turnReducer(initialTurnState, { type: "SESSION_READY", bargeIn: false, resumed: true, completed: true }).phase).toBe("IDLE");
  });

  it("an undelivered reply replayed after a resume is accepted and played", () => {
    const s = run([{ type: "SESSION_READY", bargeIn: false, resumed: true }, { type: "REPLY_RECEIVED", turnId: "t7", generationId: "g7", hasAudio: true }]);
    expect(s).toMatchObject({ phase: "AI_SPEAKING", speakingTurnId: "t7" });
  });
});

describe("microphone rules", () => {
  it("is muted only while the AI speaks in strict mode, and never with barge-in", () => {
    expect(isMicMuted(speaking(false))).toBe(true);
    expect(isMicMuted(speaking(true))).toBe(false);
    expect(isMicMuted(run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }]))).toBe(false); // processing: mic stays live
  });

  it("cannot be started while the AI is speaking, but can with barge-in", () => {
    expect(canStartRecording(speaking(false), ctx)).toBe(false);
    expect(canStartRecording(speaking(true), ctx)).toBe(true);
  });

  it("cannot be started before the session, while disconnected, or after completion", () => {
    expect(canStartRecording(initialTurnState, ctx)).toBe(false);
    const listening = run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }, { type: "REPLY_RECEIVED", turnId: "t1", hasAudio: false }]);
    expect(canStartRecording(listening, ctx)).toBe(true);
    expect(canStartRecording(listening, { ...ctx, connected: false })).toBe(false);
    expect(canStartRecording(listening, { ...ctx, sessionStarted: false })).toBe(false);
    expect(canStartRecording(turnReducer(listening, { type: "INTERVIEW_COMPLETED" }), ctx)).toBe(false);
  });

  it("switches the microphone on by itself when the AI finishes and nothing is recording", () => {
    const done = turnReducer(speaking(), { type: "PLAYBACK_ENDED", turnId: "t1", generationId: "g1" });
    expect(shouldAutoListen(done, { ...ctx, recording: false })).toBe(true);
    expect(shouldAutoListen(done, { ...ctx, recording: true })).toBe(false);
    expect(shouldAutoListen(speaking(), { ...ctx, recording: false })).toBe(false);
  });
});

describe("stale and out-of-order events", () => {
  it("ignores a playback report for an older reply once a newer one is playing", () => {
    let s = speaking();
    s = turnReducer(s, { type: "TURN_COMMITTED", turnId: "t2" });
    s = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t2", generationId: "g2", hasAudio: true });
    const late = turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t1", generationId: "g1" });
    expect(late.phase).toBe("AI_SPEAKING"); // the old audio finishing must not open the microphone
    const wrongGeneration = turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t2", generationId: "g-old" });
    expect(wrongGeneration.phase).toBe("AI_SPEAKING");
    expect(turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t2", generationId: "g2" }).phase).toBe("LISTENING");
  });

  it("ignores a playback report when nothing is playing", () => {
    const s = run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }]);
    expect(turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t1" })).toBe(s);
  });

  it("rejects a reply for a turn that was superseded by a newer candidate turn", () => {
    let s = run([ready(), { type: "TURN_COMMITTED", turnId: "t1" }, { type: "TURN_COMMITTED", turnId: "t2" }]);
    const late = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t1", generationId: "g1", hasAudio: true });
    expect(late).toBe(s); // not played, no state change
    s = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t2", generationId: "g2", hasAudio: true });
    expect(s.phase).toBe("AI_SPEAKING");
    expect(s.speakingTurnId).toBe("t2");
  });

  it("rejects a reply for a turn the server cancelled", () => {
    let s = run([ready(), { type: "TURN_COMMITTED", turnId: "t1" }, { type: "TURN_CANCELLED", turnId: "t1" }]);
    expect(s.phase).toBe("CANCELLED");
    s = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t1", generationId: "g1", hasAudio: true });
    expect(s.phase).toBe("CANCELLED");
    expect(s.speakingTurnId).toBeNull();
  });

  it("a cancellation of an older turn does not disturb the one in progress", () => {
    let s = run([ready(), { type: "TURN_COMMITTED", turnId: "t1" }, { type: "TURN_COMMITTED", turnId: "t2" }]);
    s = turnReducer(s, { type: "TURN_CANCELLED", turnId: "t1" }); // the server confirms t1 was superseded
    expect(s.phase).toBe("PROCESSING");
    expect(s.activeTurnId).toBe("t2");
  });
});

describe("cancellation and interruption", () => {
  it("shows CANCELLED, then settles back to LISTENING", () => {
    let s = run([ready(), { type: "TURN_COMMITTED", turnId: "t1" }, { type: "TURN_CANCELLED", turnId: "t1" }]);
    expect(s.phase).toBe("CANCELLED");
    expect(isMicMuted(s)).toBe(false);
    s = turnReducer(s, { type: "SETTLE" });
    expect(s.phase).toBe("LISTENING");
    expect(turnReducer(s, { type: "SETTLE" })).toBe(s);
  });

  it("a local interruption stops what is playing and ignores that reply from then on", () => {
    let s = turnReducer(speaking(true), { type: "INTERRUPTED" });
    expect(s.phase).toBe("CANCELLED");
    expect(s.speakingTurnId).toBeNull();
    s = turnReducer(s, { type: "REPLY_RECEIVED", turnId: "t1", generationId: "g1", hasAudio: true });
    expect(s.phase).toBe("CANCELLED");
    expect(turnReducer(s, { type: "PLAYBACK_ENDED", turnId: "t1", generationId: "g1" })).toBe(s);
  });

  it("interrupting while the AI is thinking cancels that pending turn", () => {
    const s = turnReducer(run([ready(true), { type: "TURN_COMMITTED", turnId: "t1" }]), { type: "INTERRUPTED" });
    expect(s.phase).toBe("CANCELLED");
    expect(s.cancelledTurnIds).toContain("t1");
  });

  it("an interrupt with nothing to interrupt changes nothing", () => {
    const listening = run([ready(), { type: "GREETING_REQUESTED", turnId: "t1" }, { type: "REPLY_RECEIVED", turnId: "t1", hasAudio: false }]);
    expect(turnReducer(listening, { type: "INTERRUPTED" })).toBe(listening);
  });

  it("a failed turn returns the floor; a failure of an old turn does not", () => {
    const processing = run([ready(), { type: "TURN_COMMITTED", turnId: "t2" }]);
    expect(turnReducer(processing, { type: "TURN_FAILED", turnId: "t2" }).phase).toBe("LISTENING");
    expect(turnReducer(processing, { type: "TURN_FAILED", turnId: "t1" })).toBe(processing);
  });

  it("disconnecting resets to IDLE and drops what was playing", () => {
    const s = turnReducer(speaking(), { type: "DISCONNECTED" });
    expect(s).toMatchObject({ phase: "IDLE", activeTurnId: null, speakingTurnId: null });
  });

  it("remembers only a bounded number of cancelled turns", () => {
    let s: TurnState = { ...initialTurnState };
    for (let i = 0; i < 50; i += 1) s = turnReducer(s, { type: "TURN_CANCELLED", turnId: `t${i}` });
    expect(s.cancelledTurnIds.length).toBeLessThanOrEqual(20);
    expect(s.cancelledTurnIds).toContain("t49");
  });
});

describe("completion", () => {
  it("stops accepting new turns once the interview is complete", () => {
    const s = turnReducer(speaking(), { type: "INTERVIEW_COMPLETED" });
    expect(turnReducer(s, { type: "TURN_COMMITTED", turnId: "t9" })).toBe(s);
  });
});
