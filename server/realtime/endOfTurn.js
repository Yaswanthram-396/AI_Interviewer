/**
 * Decides when the candidate has finished an answer. Final STT fragments are
 * buffered; a turn is committed on the earliest of:
 *  - Deepgram `UtteranceEnd` (+ utteranceEndGraceMs)
 *  - a fragment flagged `speech_final` followed by speechFinalGraceMs of no new speech
 *  - fallbackMs after the last final fragment with no endpoint signal
 *  - an explicit flush (manual stop, STT stream closed)
 * Any new speech (interim or final) cancels a pending commit.
 */
class EndOfTurnDetector {
  constructor({ speechFinalGraceMs, utteranceEndGraceMs, fallbackMs, onCommit, now = Date.now }) {
    Object.assign(this, { speechFinalGraceMs, utteranceEndGraceMs, fallbackMs, onCommit, now });
    this.fragments = [];
    this.timer = null;
    this.lastFinalAt = null;
  }

  noteSpeech() {
    this._clear();
  }

  addFinal(text, { speechFinal = false } = {}) {
    const t = (text || "").trim();
    this._clear();
    if (!t) return;
    this.fragments.push(t);
    this.lastFinalAt = this.now();
    this._arm(speechFinal ? this.speechFinalGraceMs : this.fallbackMs, speechFinal ? "speech_final" : "fallback");
  }

  utteranceEnd() {
    if (!this.fragments.length) return;
    this._clear();
    this._arm(this.utteranceEndGraceMs, "utterance_end");
  }

  flush(reason = "manual") {
    this._clear();
    this._commit(reason);
  }

  reset() {
    this._clear();
    this.fragments = [];
    this.lastFinalAt = null;
  }

  _arm(ms, reason) {
    this.timer = setTimeout(() => {
      this.timer = null;
      this._commit(reason);
    }, ms);
  }

  _clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  _commit(reason) {
    if (!this.fragments.length) return;
    const text = this.fragments.join(" ").trim();
    const waitedMs = this.lastFinalAt ? this.now() - this.lastFinalAt : 0;
    this.fragments = [];
    this.lastFinalAt = null;
    if (text) this.onCommit({ text, reason, waitedMs });
  }
}

module.exports = { EndOfTurnDetector };
