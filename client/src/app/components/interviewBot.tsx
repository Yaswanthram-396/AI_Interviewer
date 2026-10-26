
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { authSession } from "@/features/auth/services/authSession.instance";
import { MicrophoneController, createBrowserMicrophoneDeps } from "@/features/interview/microphoneController";
import {
  canStartRecording,
  initialTurnState,
  isMicMuted,
  shouldAutoListen,
  turnReducer,
  type TurnEvent,
  type TurnState,
} from "@/features/interview/interviewTurnMachine";
import { RoomView, type RoomMessage } from "@/features/room/RoomView";

interface ConversationMessage {
  id: number;
  sender: "bot" | "user";
  text: string;
  isAudio: boolean;
}

interface TTSResponse {
  type: "tts_audio";
  turnId: string;
  generationId?: string;
  audioBase64: string | null;
  text: string;
  ttsError?: string;
}

interface STTResponse {
  type: "interim_transcript" | "final_transcript";
  transcript: string;
}

interface SessionReady {
  type: "session_ready";
  sessionId: string;
  resumeToken: string;
  resumed: boolean;
  completed?: boolean;
  /** false = strict turn-taking (mic is muted while the AI speaks); true = the candidate may interrupt. */
  bargeIn?: boolean;
}

interface STTStartedResponse {
  type: "stt_started";
  sessionId: string;
}

interface UserTurnCommitted {
  type: "user_turn_committed";
  turnId: string;
  text: string;
}

interface TurnCancelled {
  type: "turn_cancelled";
  turnId: string;
  generationId?: string;
  reason?: string;
}

interface TurnStateMessage {
  type: "turn_state";
  turnId: string;
  state: string;
}

interface SessionEnded {
  type: "session_ended";
  message: string;
}

interface SpeechStarted {
  type: "speech_started" | "pong";
}

// Interview-engine events. The server never sends scores or feedback to the candidate.
interface InterviewCompleted {
  type: "interview_completed";
  reason: string;
}

interface InterviewEvent {
  type: "interview_state" | "answer_evaluated" | "next_question";
  mainIndex?: number;
  totalMain?: number;
}

interface ErrorResponse {
  type: "error" | "stt_error" | "warning";
  code?: string;
  turnId?: string;
  retryable?: boolean;
  message: string;
}

type WSMessage =
  | TTSResponse
  | STTResponse
  | STTStartedResponse
  | SessionReady
  | UserTurnCommitted
  | TurnCancelled
  | TurnStateMessage
  | SessionEnded
  | SpeechStarted
  | InterviewCompleted
  | InterviewEvent
  | ErrorResponse;

const newTurnId = () => `turn_${crypto.randomUUID()}`;

// The resume token lets a dropped connection continue the same server-side session.
// It is kept per interview in sessionStorage and cleared when the server rejects it.
const resumeKey = (interviewId: string) => `ai_interview_resume_${interviewId}`;
const readResumeToken = (interviewId: string): string | undefined => {
  try {
    return sessionStorage.getItem(resumeKey(interviewId)) ?? undefined;
  } catch {
    return undefined;
  }
};
const writeResumeToken = (interviewId: string, token: string | null) => {
  try {
    if (token) sessionStorage.setItem(resumeKey(interviewId), token);
    else sessionStorage.removeItem(resumeKey(interviewId));
  } catch {
    /* storage unavailable: recovery is simply disabled */
  }
};

const MAX_RECONNECT_ATTEMPTS = 8;

interface InterviewBotProps {
  /** Backend interview id (24-hex ObjectId). */
  id: string;
  title?: string;
  subtitle?: string;
  durationMinutes?: number;
  /** Called after the closing line has played, or when the candidate ends the interview. */
  onFinished?: (reason: "completed" | "ended", sessionId: string | null) => void;
}

const InterviewBot = ({ id, title, subtitle, durationMinutes = 15, onFinished }: InterviewBotProps) => {
  const totalSeconds = durationMinutes * 60;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  // The server's session id: it is also the id of the report this interview produces.
  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const sessionRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isRecordingRef = useRef<boolean>(false);
  const isSTTStreamReadyRef = useRef<boolean>(false);

  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [isMicStarting, setIsMicStarting] = useState(false);

  // Whose turn it is lives in one place. `turnRef` mirrors it synchronously for socket callbacks.
  const [turn, setTurn] = useState<TurnState>(initialTurnState);
  const turnRef = useRef<TurnState>(initialTurnState);
  /** Applies an event; returns false when it was stale/ignored and changed nothing. */
  const dispatchTurn = useCallback((event: TurnEvent) => {
    const next = turnReducer(turnRef.current, event);
    if (next === turnRef.current) return false;
    turnRef.current = next;
    setTurn(next);
    return true;
  }, []);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(durationMinutes * 60);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionRecordingUrl, setSessionRecordingUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSTTStreamReady, setIsSTTStreamReady] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const micLevelRef = useRef(0);
  const [sessionReady, setSessionReady] = useState(false);

  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const helloRetriedRef = useRef(false);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playedTurnsRef = useRef<Set<string>>(new Set());
  const liveFragmentsRef = useRef<string[]>([]);
  // Set when the microphone is refused, so auto-listening does not retry in a loop; a click clears it.
  const autoListenBlockedRef = useRef(false);
  // Latest handlers for socket callbacks (avoids stale closures without re-creating the socket).
  const latestRef = useRef<{
    stopRecording: () => void;
    endSession: (reconnect?: boolean) => void;
    startRecording: () => Promise<void>;
    onMicLost: () => void;
  }>({
    stopRecording: () => {},
    endSession: () => {},
    startRecording: async () => {},
    onMicLost: () => {},
  });

  const addMessage = useCallback((sender: "bot" | "user", text: string, isAudio: boolean = false) => {
    setConversation((prev) => [...prev, { id: Date.now() + Math.random(), sender, text, isAudio }]);
  }, []);

  const getWsUrl = () => {
    const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (configuredUrl) return configuredUrl;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = host === "localhost" || host.includes("127.0.0.1") ? ":8081" : "";
    return `${protocol}//${host}${port}`;
  };

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  // Begin the interview: the server greets the candidate. The turnId correlates the reply.
  const requestGreeting = () => {
    const turnId = newTurnId();
    dispatchTurn({ type: "GREETING_REQUESTED", turnId });
    if (!sendJson({ type: "start_interview", turnId })) {
      dispatchTurn({ type: "TURN_FAILED", turnId });
      addMessage("bot", "Connection not ready. Please wait for connection or refresh.", false);
    }
  };

  // Raw PCM16 goes over the socket as a binary frame. Nothing is sent while the AI holds the floor
  // (the microphone gate already mutes the track; this is the second line of defence).
  const sendAudioData = useCallback((audioData: ArrayBuffer) => {
    if (!isRecordingRef.current || !isSTTStreamReadyRef.current) return;
    if (isMicMuted(turnRef.current)) return;
    const samples = new Int16Array(audioData);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 8) sum += (samples[i] / 32768) ** 2;
    micLevelRef.current = Math.min(1, Math.sqrt(sum / Math.ceil(samples.length / 8)) * 4);
    if (audioData.byteLength === 0) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(audioData);
  }, []);

  // The interviewer's closing line must finish playing before the session is torn down.
  const interviewCompletedRef = useRef(false);
  const audioPendingRef = useRef(false);
  const finishIfCompleted = useCallback(() => {
    if (!interviewCompletedRef.current || audioPendingRef.current || playbackSourceRef.current) return;
    interviewCompletedRef.current = false;
    if (onFinishedRef.current) {
      latestRef.current.endSession(false);
      onFinishedRef.current("completed", sessionIdRef.current);
    } else {
      latestRef.current.endSession(true);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    const src = playbackSourceRef.current;
    playbackSourceRef.current = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // Complete-response playback: the whole MP3 is decoded before it starts. The AI keeps the floor until
  // the audio has actually finished here, and only then is the server told (playback_ended).
  const playBotAudio = useCallback(
    async (turnId: string, generationId: string | undefined, audioBase64: string) => {
      if (!playbackCtxRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        playbackCtxRef.current = new Ctx();
      }
      const ctx = playbackCtxRef.current as AudioContext;
      if (ctx.state === "suspended") await ctx.resume();
      const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0)).buffer;
      const decoded = await ctx.decodeAudioData(bytes);
      // The reply may have been superseded or interrupted while it was decoding: never play stale audio.
      if (turnRef.current.speakingTurnId !== turnId) return false;
      stopPlayback();
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => {
        if (playbackSourceRef.current !== source) return; // stopped or replaced locally: nothing to report
        playbackSourceRef.current = null;
        sendJson({ type: "playback_ended", turnId, generationId });
        dispatchTurn({ type: "PLAYBACK_ENDED", turnId, generationId });
        finishIfCompleted();
      };
      playbackSourceRef.current = source;
      source.start(0);
      sendJson({ type: "playback_started", turnId, generationId });
      return true;
    },
    [sendJson, stopPlayback, finishIfCompleted, dispatchTurn]
  );

  // Barge-in only: the candidate talked over a pending/playing reply. Stop it here and cancel it server-side.
  const interruptBot = useCallback(() => {
    if (!dispatchTurn({ type: "INTERRUPTED" })) return;
    stopPlayback();
    sendJson({ type: "interrupt" });
  }, [sendJson, stopPlayback, dispatchTurn]);

  // The first message authenticates the connection; a stored resume token continues a dropped session.
  const sendHello = useCallback(
    async (resumeToken?: string) => {
      const accessToken = (await authSession.getAccessToken()) ?? undefined;
      sendJson({ type: "hello", interviewId: id, resumeToken, accessToken });
    },
    [id, sendJson]
  );

  const handleServerMessage = useCallback(
    async (data: WSMessage) => {
      switch (data.type) {
        case "session_ready": {
          writeResumeToken(id, data.resumeToken);
          sessionIdRef.current = data.sessionId;
          reconnectAttemptsRef.current = 0;
          helloRetriedRef.current = false;
          setSessionReady(true);
          setWsStatus("connected");
          dispatchTurn({ type: "SESSION_READY", bargeIn: !!data.bargeIn, completed: data.completed, resumed: data.resumed });
          break;
        }
        case "tts_audio": {
          // The server replays responses after duplicates/resume; play each turn once.
          if (playedTurnsRef.current.has(data.turnId)) break;
          // The turn machine rejects replies for cancelled or superseded turns (stale audio is never shown or played).
          if (!dispatchTurn({ type: "REPLY_RECEIVED", turnId: data.turnId, generationId: data.generationId, hasAudio: !!data.audioBase64 })) break;
          playedTurnsRef.current.add(data.turnId);
          addMessage("bot", data.text, true);
          if (data.audioBase64) {
            audioPendingRef.current = true;
            try {
              await playBotAudio(data.turnId, data.generationId, data.audioBase64);
            } catch (e) {
              console.error("Audio playback failed:", e);
              setErrorMessage("Could not play the interviewer's audio. The text is shown instead.");
              // Nothing is playing, so hand the floor back instead of leaving the interview waiting.
              if (dispatchTurn({ type: "PLAYBACK_ENDED", turnId: data.turnId, generationId: data.generationId })) {
                sendJson({ type: "playback_ended", turnId: data.turnId, generationId: data.generationId });
              }
            } finally {
              audioPendingRef.current = false;
            }
          } else {
            setErrorMessage("Voice is temporarily unavailable. The text is shown instead.");
            sendJson({ type: "playback_ended", turnId: data.turnId, generationId: data.generationId }); // nothing to wait for
          }
          finishIfCompleted();
          break;
        }
        case "interview_completed":
          interviewCompletedRef.current = true;
          dispatchTurn({ type: "INTERVIEW_COMPLETED" });
          addMessage("bot", "The interview is complete. Thank you!", false);
          finishIfCompleted();
          break;
        case "next_question":
          // The introduction is index 0; real questions are numbered from 1.
          if (typeof data.mainIndex === "number" && data.mainIndex > 0 && typeof data.totalMain === "number") setProgress({ current: data.mainIndex, total: data.totalMain });
          break;
        case "interview_state":
        case "answer_evaluated":
          break; // progress events; the UI is driven by playback and transcript state
        case "user_turn_committed":
          liveFragmentsRef.current = [];
          setLiveTranscript("");
          addMessage("user", data.text, true);
          dispatchTurn({ type: "TURN_COMMITTED", turnId: data.turnId });
          break;
        case "turn_cancelled":
          dispatchTurn({ type: "TURN_CANCELLED", turnId: data.turnId });
          break;
        case "turn_state":
          break;
        case "stt_started":
          setIsSTTStreamReady(true);
          isSTTStreamReadyRef.current = true;
          break;
        case "interim_transcript":
          setLiveTranscript([...liveFragmentsRef.current, data.transcript].join(" "));
          break;
        case "final_transcript":
          if (data.transcript.trim()) {
            liveFragmentsRef.current.push(data.transcript.trim());
            setLiveTranscript(liveFragmentsRef.current.join(" "));
          }
          break;
        case "speech_started":
          // Only with barge-in. In strict mode the server ignores the mic while the AI speaks, and speech during
          // "thinking" is handled server-side: the new answer supersedes the old one and carries its text.
          if (turnRef.current.bargeIn) interruptBot();
          break;
        case "pong":
          break;
        case "session_ended":
          latestRef.current.endSession(true);
          addMessage("bot", data.message, false);
          break;
        case "stt_error":
          setErrorMessage(data.message);
          setIsSTTStreamReady(false);
          isSTTStreamReadyRef.current = false;
          latestRef.current.stopRecording();
          break;
        case "error":
        case "warning": {
          if (data.code === "INVALID_RESUME_TOKEN" || data.code === "SESSION_EXPIRED") {
            // Recovery is not possible; start a fresh server session once.
            writeResumeToken(id, null);
            if (!helloRetriedRef.current) {
              helloRetriedRef.current = true;
              await sendHello();
              break;
            }
          }
          setErrorMessage(data.message);
          // A failed turn hands the floor back; an error about an older turn does not disturb the current one.
          if (data.type === "error") dispatchTurn({ type: "TURN_FAILED", turnId: data.turnId });
          break;
        }
        default:
          console.warn("Unknown message type:", data);
      }
    },
    [id, addMessage, playBotAudio, interruptBot, sendJson, sendHello, finishIfCompleted, dispatchTurn]
  );

  const startWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setWsStatus("connecting");
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // First message must identify the interview; a stored token resumes the prior session.
      void sendHello(readResumeToken(id));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        void handleServerMessage(JSON.parse(event.data) as WSMessage);
      } catch (e) {
        console.error("Error processing WebSocket message:", e);
        dispatchTurn({ type: "TURN_FAILED" });
        setErrorMessage("Failed to process server message");
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setWsStatus("disconnected");
      setSessionReady(false);
      dispatchTurn({ type: "DISCONNECTED" });
      setIsSTTStreamReady(false);
      isSTTStreamReadyRef.current = false;
      latestRef.current.stopRecording();
      if (intentionalCloseRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setErrorMessage("Connection lost. Please refresh the page to continue.");
        return;
      }
      const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 15000) + Math.random() * 500;
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(startWebSocket, delay);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [id, handleServerMessage, sendHello, dispatchTurn]);

// One microphone for the whole interview: a single capture, a gate that mutes it while the AI speaks,
// and one place that releases every audio resource.
const micRef = useRef<MicrophoneController | null>(null);
if (!micRef.current) {
  micRef.current = new MicrophoneController(
    createBrowserMicrophoneDeps((pcm) => sendAudioData(pcm), { onEnded: () => latestRef.current.onMicLost() })
  );
}
const mic = micRef.current;

const startRecording = async () => {
  // Not the candidate's turn (e.g. the AI is speaking) or already capturing: ignore, however fast this is clicked.
  if (!canStartRecording(turnRef.current, { sessionStarted, connected: wsStatus === "connected" })) return;
  if (isRecordingRef.current || mic.state !== "idle") return;

  setIsSTTStreamReady(false);
  isSTTStreamReadyRef.current = false;
  setLiveTranscript("");
  setIsMicStarting(true);

  try {
    if (!(await mic.start())) {
      setIsMicStarting(false); // stopped while the permission prompt was open
      return;
    }
    mic.setGate(!isMicMuted(turnRef.current));
    sendJson({ type: "start_stt" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error accessing microphone:", message);
    autoListenBlockedRef.current = true; // do not retry by itself; a click will
    addMessage("bot", `Could not start microphone: ${message}. Check permissions.`, false);
    cleanup();
    setIsRecording(false);
    setIsMicStarting(false);
    setIsSTTStreamReady(false);
    isSTTStreamReadyRef.current = false;
  }
};

  // Releases the stream, worklet and audio context (also cancels a start that is still in flight).
  const cleanup = () => {
    mic.stop();
  };

const stopRecording = () => {
  const wasRecording = isRecordingRef.current;
  isRecordingRef.current = false;
  setIsRecording(false);
  setIsMicStarting(false);
  setIsSTTStreamReady(false);
  isSTTStreamReadyRef.current = false;
  cleanup();
  if (!wasRecording) return;
  // Tell the server to finalize any remaining audio; it commits whatever was heard (manual end of turn).
  sendJson({ type: "stop_stt" });
};

// The input device disappeared (unplugged, permission revoked) while recording.
const handleMicLost = () => {
  isRecordingRef.current = false;
  setIsRecording(false);
  setIsMicStarting(false);
  setIsSTTStreamReady(false);
  isSTTStreamReadyRef.current = false;
  autoListenBlockedRef.current = true;
  sendJson({ type: "stop_stt" });
  setErrorMessage("The microphone was disconnected. Reconnect it and press the microphone button.");
};

  useEffect(() => {
    if (isSTTStreamReady && mic.state === "recording" && !isRecording) {
      isRecordingRef.current = true;
      setIsRecording(true);
      setIsMicStarting(false);
    }
  }, [isSTTStreamReady, isRecording, mic]);

  // The microphone follows the turn: muted while the AI speaks (strict turn-taking), live otherwise.
  useEffect(() => {
    mic.setGate(!isMicMuted(turn));
  }, [turn, mic]);

  // Audio that is no longer the current reply (cancelled, superseded, a new candidate turn) is silenced at once.
  useEffect(() => {
    if (turn.phase !== "AI_SPEAKING" && playbackSourceRef.current) stopPlayback();
  }, [turn.phase, stopPlayback]);

  // CANCELLED is shown briefly, then the candidate has the floor again.
  useEffect(() => {
    if (turn.phase !== "CANCELLED") return;
    const timer = setTimeout(() => dispatchTurn({ type: "SETTLE" }), 700);
    return () => clearTimeout(timer);
  }, [turn.phase, dispatchTurn]);

  // When the AI has actually finished speaking, start listening again by itself.
  useEffect(() => {
    if (autoListenBlockedRef.current) return;
    const ctx = { sessionStarted, connected: wsStatus === "connected", recording: isRecording || isMicStarting };
    if (shouldAutoListen(turn, ctx)) void latestRef.current.startRecording();
  }, [turn, sessionStarted, wsStatus, isRecording, isMicStarting]);

  const handleStartInterview = async () => {
    if (wsStatus !== "connected" || sessionStarted) return;

    try {
      const userStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = userStream;
        userVideoRef.current.muted = true;
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const combinedAudioTracks = [...userStream.getAudioTracks(), ...displayStream.getAudioTracks()];
      const combinedVideoTracks = [...displayStream.getVideoTracks(), ...userStream.getVideoTracks()];
      const combinedStream = new MediaStream([...combinedVideoTracks, ...combinedAudioTracks]);

      sessionRecorderRef.current = new MediaRecorder(combinedStream);
      sessionChunksRef.current = [];

      sessionRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) sessionChunksRef.current.push(e.data);
      };

      sessionRecorderRef.current.onstop = () => {
        const blob = new Blob(sessionChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setSessionRecordingUrl(url);
        const a = document.createElement("a");
        a.href = url;
        a.download = "interview_session.webm";
        a.click();
      };

      sessionRecorderRef.current.start();

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = totalSeconds - elapsed;
        setTimeRemaining(remaining);
        if (remaining <= 0) endSession(true);
      }, 1000);

      setSessionStarted(true);
      requestGreeting();
    } catch (error) {
      console.error("Error starting session:", error);
      addMessage(
        "bot",
        "Could not start session recording or access media. Continuing without recording.",
        false
      );
      setSessionStarted(true);
      requestGreeting();
    }
  };

  // reconnect=false is for unmount; true re-opens a fresh connection so a new interview can start.
  const endSession = (reconnect = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSessionStarted(false);
    setIsRecording(false);
    stopPlayback();
    setIsSTTStreamReady(false);
    isRecordingRef.current = false;
    isSTTStreamReadyRef.current = false;
    setTimeRemaining(totalSeconds);
    dispatchTurn({ type: "DISCONNECTED" });
    setIsMicStarting(false);
    autoListenBlockedRef.current = false;
    liveFragmentsRef.current = [];
    setLiveTranscript("");

    cleanup();

    if (sessionRecorderRef.current && sessionRecorderRef.current.state !== "inactive") {
      sessionRecorderRef.current.stop();
    }

    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    writeResumeToken(id, null);
    const ws = wsRef.current;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end_interview" }));
      ws.close();
      wsRef.current = null;
    }
    if (reconnect) {
      reconnectTimerRef.current = setTimeout(() => {
        intentionalCloseRef.current = false;
        playedTurnsRef.current.clear();
        startWebSocket();
      }, 1000);
    }

    if (userVideoRef.current && userVideoRef.current.srcObject) {
      (userVideoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
    }
  };

  latestRef.current = { stopRecording, endSession, startRecording, onMicLost: handleMicLost };

  useEffect(() => {
    intentionalCloseRef.current = false;
    startWebSocket();
    return () => latestRef.current.endSession(false);
  }, [startWebSocket]);

  // Push the microphone level to the visualizer about ten times a second.
  useEffect(() => {
    const timer = setInterval(() => {
      const next = isRecordingRef.current && !isMicMuted(turnRef.current) ? micLevelRef.current : 0;
      setMicLevel((current) => (Math.abs(current - next) > 0.03 ? next : current));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const messages: RoomMessage[] = conversation.map((message) => ({ id: String(message.id), sender: message.sender === "bot" ? "ai" : "candidate", text: message.text }));
  const connected = wsStatus === "connected";
  const micState: "off" | "starting" | "live" | "muted" = isMicStarting ? "starting" : isMicMuted(turn) ? "muted" : isRecording ? "live" : "off";

  const handleToggleMic = () => {
    autoListenBlockedRef.current = false; // an explicit click re-enables automatic listening
    if (isRecording) stopRecording();
    else void startRecording();
  };

  return (
    <RoomView
      title={title ?? "AI interview"}
      subtitle={subtitle}
      mode="live"
      phase={turn.phase}
      connection={wsStatus}
      started={sessionStarted}
      completed={turn.completed}
      messages={messages}
      liveTranscript={isRecording && turn.phase !== "AI_SPEAKING" ? liveTranscript : ""}
      remainingSeconds={timeRemaining}
      totalSeconds={totalSeconds}
      question={progress}
      mic={{ state: micState, level: micLevel, disabled: !sessionStarted || !connected || isMicStarting || (!isRecording && !canStartRecording(turn, { sessionStarted, connected })) }}
      error={errorMessage}
      selfVideoRef={userVideoRef}
      onStart={() => void handleStartInterview()}
      onToggleMic={handleToggleMic}
      onEnd={() => {
        const hasHandler = Boolean(onFinishedRef.current);
        endSession(!hasHandler);
        onFinishedRef.current?.("ended", sessionIdRef.current);
      }}
      onDismissError={() => setErrorMessage(null)}
    />
  );
};

export default InterviewBot;