/**
 * Conversation-level state machine. The backend is the only authority: states change only
 * through `ConversationState.transition`, which rejects anything not in TRANSITIONS.
 * (Per-turn delivery states live in session.js; this tracks where the *interview* is.)
 */
const STATE = Object.freeze({
  INITIALIZING: "INITIALIZING",
  AI_SPEAKING: "AI_SPEAKING",
  LISTENING: "LISTENING",
  TRANSCRIBING: "TRANSCRIBING",
  EVALUATING: "EVALUATING",
  DECIDING_NEXT_ACTION: "DECIDING_NEXT_ACTION",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const { INITIALIZING, AI_SPEAKING, LISTENING, TRANSCRIBING, EVALUATING, DECIDING_NEXT_ACTION, COMPLETED, FAILED } = STATE;

// Shortcuts such as AI_SPEAKING -> EVALUATING are deliberate: a typed answer or a barge-in can
// arrive while the AI is still speaking, before any LISTENING state was reached.
const TRANSITIONS = Object.freeze({
  [INITIALIZING]: [AI_SPEAKING, EVALUATING, FAILED, COMPLETED],
  [AI_SPEAKING]: [LISTENING, TRANSCRIBING, EVALUATING, COMPLETED, FAILED],
  [LISTENING]: [AI_SPEAKING, TRANSCRIBING, EVALUATING, COMPLETED, FAILED],
  [TRANSCRIBING]: [LISTENING, EVALUATING, AI_SPEAKING, COMPLETED, FAILED],
  [EVALUATING]: [DECIDING_NEXT_ACTION, AI_SPEAKING, LISTENING, COMPLETED, FAILED],
  [DECIDING_NEXT_ACTION]: [AI_SPEAKING, LISTENING, COMPLETED, FAILED],
  [COMPLETED]: [],
  [FAILED]: [LISTENING, AI_SPEAKING, COMPLETED],
});

class ConversationState {
  constructor(initial = INITIALIZING, { onChange, onRejected } = {}) {
    this.current = Object.values(STATE).includes(initial) ? initial : INITIALIZING;
    this.onChange = onChange;
    this.onRejected = onRejected;
  }

  get isTerminal() {
    return this.current === COMPLETED;
  }

  canTransition(to) {
    return to === this.current || (TRANSITIONS[this.current] || []).includes(to);
  }

  /** Returns true if the machine is in `to` afterwards. Invalid transitions are rejected, not thrown. */
  transition(to, reason) {
    if (to === this.current) return true;
    if (!this.canTransition(to)) {
      this.onRejected?.({ from: this.current, to, reason });
      return false;
    }
    const from = this.current;
    this.current = to;
    this.onChange?.({ from, to, reason });
    return true;
  }
}

module.exports = { STATE, TRANSITIONS, ConversationState };
