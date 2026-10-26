/**
 * The single source of truth for "whose turn is it" in the browser. Components render from this
 * state instead of keeping independent booleans (speaking / loading / recording).
 *
 * The backend remains the authority: this machine only tracks what the server has told the client
 * and what the local audio player is doing. It is pure (no timers, no I/O) so every race can be
 * unit-tested.
 */

export type TurnPhase = "IDLE" | "AI_SPEAKING" | "LISTENING" | "PROCESSING" | "CANCELLED";

export interface TurnState {
  phase: TurnPhase;
  /** From the server: true means the candidate may talk over the AI; false is strict turn-taking. */
  bargeIn: boolean;
  completed: boolean;
  /** The candidate turn the AI is currently working on (set when it is committed). */
  activeTurnId: string | null;
  /** The reply currently playing; its end-of-playback report must name this generation. */
  speakingTurnId: string | null;
  speakingGenerationId: string | null;
  /** Turns whose replies must never be played (bounded). */
  cancelledTurnIds: readonly string[];
}

export type TurnEvent =
  | { type: "SESSION_READY"; bargeIn: boolean; completed?: boolean; resumed?: boolean }
  | { type: "GREETING_REQUESTED"; turnId: string }
  | { type: "TURN_COMMITTED"; turnId: string }
  | { type: "REPLY_RECEIVED"; turnId: string; generationId?: string; hasAudio: boolean }
  | { type: "PLAYBACK_ENDED"; turnId: string; generationId?: string }
  | { type: "TURN_CANCELLED"; turnId: string }
  | { type: "INTERRUPTED" }
  | { type: "SETTLE" }
  | { type: "TURN_FAILED"; turnId?: string }
  | { type: "INTERVIEW_COMPLETED" }
  | { type: "DISCONNECTED" };

const MAX_REMEMBERED_CANCELLED = 20;

export const initialTurnState: TurnState = {
  phase: "IDLE",
  bargeIn: false,
  completed: false,
  activeTurnId: null,
  speakingTurnId: null,
  speakingGenerationId: null,
  cancelledTurnIds: [],
};

const remember = (ids: readonly string[], turnId: string) =>
  ids.includes(turnId) ? ids : [...ids, turnId].slice(-MAX_REMEMBERED_CANCELLED);

const withoutSpeaking = { speakingTurnId: null, speakingGenerationId: null } as const;

export function turnReducer(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case "SESSION_READY": {
      const next = { ...state, bargeIn: event.bargeIn, completed: !!event.completed };
      // After a reconnect the old audio is gone and the server has returned the floor to the candidate
      // (or is about to replay an undelivered reply, which moves us to AI_SPEAKING).
      if (event.resumed && state.phase === "IDLE" && !next.completed) next.phase = "LISTENING";
      return next;
    }

    case "GREETING_REQUESTED":
    case "TURN_COMMITTED": {
      if (state.completed) return state;
      // A newer candidate turn supersedes whatever the AI was doing for the older one: that reply is now stale.
      const cancelled = state.activeTurnId && state.activeTurnId !== event.turnId ? remember(state.cancelledTurnIds, state.activeTurnId) : state.cancelledTurnIds;
      return { ...state, phase: "PROCESSING", activeTurnId: event.turnId, ...withoutSpeaking, cancelledTurnIds: cancelled };
    }

    case "REPLY_RECEIVED": {
      // Stale: cancelled, or for an older turn than the one being worked on.
      if (state.cancelledTurnIds.includes(event.turnId)) return state;
      if (state.activeTurnId && state.activeTurnId !== event.turnId) return state;
      if (!event.hasAudio) return { ...state, phase: "LISTENING", activeTurnId: null, ...withoutSpeaking };
      return {
        ...state,
        phase: "AI_SPEAKING",
        activeTurnId: event.turnId,
        speakingTurnId: event.turnId,
        speakingGenerationId: event.generationId ?? null,
      };
    }

    case "PLAYBACK_ENDED": {
      // Only the reply that is actually playing can hand the floor back. A late report for an older
      // reply (the AI already moved on) must not make the candidate's microphone live too early.
      if (state.phase !== "AI_SPEAKING") return state;
      if (state.speakingTurnId !== event.turnId) return state;
      if (event.generationId && state.speakingGenerationId && event.generationId !== state.speakingGenerationId) return state;
      return { ...state, phase: "LISTENING", activeTurnId: null, ...withoutSpeaking };
    }

    case "TURN_CANCELLED": {
      const cancelledTurnIds = remember(state.cancelledTurnIds, event.turnId);
      // A cancellation of an older turn does not disturb the one now in progress.
      if (event.turnId !== state.activeTurnId && event.turnId !== state.speakingTurnId) return { ...state, cancelledTurnIds };
      return { ...state, phase: "CANCELLED", activeTurnId: null, ...withoutSpeaking, cancelledTurnIds };
    }

    case "INTERRUPTED": {
      // Local barge-in: the candidate talked over the AI (or while it was thinking).
      if (state.phase !== "AI_SPEAKING" && state.phase !== "PROCESSING") return state;
      const stale = state.activeTurnId ?? state.speakingTurnId;
      return {
        ...state,
        phase: "CANCELLED",
        activeTurnId: null,
        ...withoutSpeaking,
        cancelledTurnIds: stale ? remember(state.cancelledTurnIds, stale) : state.cancelledTurnIds,
      };
    }

    case "SETTLE":
      return state.phase === "CANCELLED" ? { ...state, phase: "LISTENING" } : state;

    case "TURN_FAILED":
      // The turn failed on the server (retryable): the candidate has the floor again.
      if (state.phase !== "PROCESSING") return state;
      if (event.turnId && state.activeTurnId && event.turnId !== state.activeTurnId) return state;
      return { ...state, phase: "LISTENING", activeTurnId: null };

    case "INTERVIEW_COMPLETED":
      return { ...state, completed: true };

    case "DISCONNECTED":
      return { ...state, phase: "IDLE", activeTurnId: null, ...withoutSpeaking };
  }
}

/** Strict mode mutes the microphone only while the AI is speaking; barge-in keeps it live. */
export function isMicMuted(state: TurnState): boolean {
  return !state.bargeIn && state.phase === "AI_SPEAKING";
}

/** Whether the candidate may start (or auto-restart) recording right now. */
export function canStartRecording(state: TurnState, ctx: { sessionStarted: boolean; connected: boolean }): boolean {
  if (!ctx.sessionStarted || !ctx.connected || state.completed || state.phase === "IDLE") return false;
  return state.bargeIn || state.phase !== "AI_SPEAKING";
}

/** Whether the mic should be switched on by itself (the AI just finished and nothing is recording). */
export function shouldAutoListen(state: TurnState, ctx: { sessionStarted: boolean; connected: boolean; recording: boolean }): boolean {
  return state.phase === "LISTENING" && !ctx.recording && canStartRecording(state, ctx);
}

export const PHASE_LABEL: Record<TurnPhase, string> = {
  IDLE: "Not started",
  AI_SPEAKING: "Interviewer speaking",
  LISTENING: "Your turn: listening",
  PROCESSING: "Thinking",
  CANCELLED: "Interrupted",
};
