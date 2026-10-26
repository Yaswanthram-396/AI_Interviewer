/**
 * Lifecycle of the candidate's current turn:
 *
 *   IDLE -> RECORDING -> TRANSCRIBING -> ANSWER_FINALIZED -> EVALUATING -> COMPLETED
 *                                              \________________\__________> CANCELLED
 *
 * Invariant: at most one turn is "active" (ANSWER_FINALIZED or EVALUATING). A different turn can
 * only be finalized after the active one has been cancelled, which is how a newer answer supersedes
 * an older one instead of overlapping it. COMPLETED and CANCELLED are terminal for that turn; the
 * next utterance simply starts a new one.
 */
const CANDIDATE_TURN = Object.freeze({
  IDLE: "IDLE",
  RECORDING: "RECORDING",
  TRANSCRIBING: "TRANSCRIBING",
  ANSWER_FINALIZED: "ANSWER_FINALIZED",
  EVALUATING: "EVALUATING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});

const { IDLE, RECORDING, TRANSCRIBING, ANSWER_FINALIZED, EVALUATING, COMPLETED, CANCELLED } = CANDIDATE_TURN;
const ACTIVE = new Set([ANSWER_FINALIZED, EVALUATING]);

class CandidateTurnTracker {
  constructor({ onChange } = {}) {
    this.state = IDLE;
    this.turnId = null;
    this.onChange = onChange;
  }

  get hasActiveTurn() {
    return ACTIVE.has(this.state);
  }

  _set(state, turnId = this.turnId) {
    if (state === this.state && turnId === this.turnId) return false;
    const previous = this.state;
    this.state = state;
    this.turnId = turnId;
    this.onChange?.({ from: previous, to: state, turnId });
    return true;
  }

  /** The candidate started speaking. Ignored while a turn is being evaluated (that speech becomes the next turn). */
  startRecording() {
    if (this.hasActiveTurn || this.state === RECORDING || this.state === TRANSCRIBING) return false;
    return this._set(RECORDING, null);
  }

  transcribing() {
    if (this.hasActiveTurn || this.state === TRANSCRIBING) return false;
    return this._set(TRANSCRIBING, null);
  }

  /** The answer is complete. Throws if a different turn is still active: cancel it first. */
  finalize(turnId) {
    if (this.hasActiveTurn) {
      if (this.turnId === turnId) return false; // duplicate submission of the same turn
      throw new Error(`turn ${this.turnId} is still active; cancel it before finalizing ${turnId}`);
    }
    return this._set(ANSWER_FINALIZED, turnId);
  }

  evaluating(turnId) {
    if (this.state !== ANSWER_FINALIZED || this.turnId !== turnId) return false;
    return this._set(EVALUATING);
  }

  complete(turnId) {
    if (this.state !== EVALUATING || this.turnId !== turnId) return false;
    return this._set(COMPLETED);
  }

  /** Only the active turn can be cancelled; a late cancel for an older turn is ignored. */
  cancel(turnId) {
    if (!this.hasActiveTurn || this.turnId !== turnId) return false;
    return this._set(CANCELLED);
  }
}

module.exports = { CANDIDATE_TURN, CandidateTurnTracker };
