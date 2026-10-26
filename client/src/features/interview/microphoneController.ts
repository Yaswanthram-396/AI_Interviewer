/**
 * Owns the microphone for the whole interview: one MediaStream, one AudioContext, one worklet,
 * created together and released together. Framework-agnostic so its lifecycle can be unit-tested
 * with fakes; the browser wiring is in `createBrowserMicrophoneDeps`.
 *
 * Guarantees:
 * - at most one capture exists at a time, however fast `start()` is called (clicks, auto-restart);
 * - `stop()` is idempotent and also cancels a capture that is still being set up, so a permission
 *   prompt that resolves after the user stopped cannot leave a live microphone behind;
 * - closing the gate silences the stream (`track.enabled = false`) and drops frames, without
 *   tearing down the capture, so the next turn starts instantly.
 */

export type MicState = "idle" | "starting" | "recording";

export interface MicTrackLike {
  enabled: boolean;
  stop(): void;
  addEventListener(type: "ended", listener: () => void): void;
  removeEventListener(type: "ended", listener: () => void): void;
}

export interface MicStreamLike {
  getTracks(): MicTrackLike[];
}

export interface MicPipelineLike {
  /** Connects the stream to the PCM worklet; `onFrame` receives Float32 samples. Returns a teardown. */
  attach(stream: MicStreamLike, onFrame: (samples: Float32Array) => void): Promise<() => Promise<void> | void>;
}

export interface MicrophoneDeps {
  getUserMedia(): Promise<MicStreamLike>;
  pipeline: MicPipelineLike;
  /** Receives 16-bit PCM for every frame that passes the gate. */
  onPcm(pcm: ArrayBuffer): void;
  /** The device went away (unplugged, permission revoked) while recording. */
  onEnded?(): void;
  onStateChange?(state: MicState): void;
}

export function float32ToInt16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * 2)); // same gain as the previous implementation
    out[i] = clamped * 0x7fff;
  }
  return out.buffer;
}

export class MicrophoneController {
  private current: MicState = "idle";
  private starting: Promise<boolean> | null = null;
  private startingGeneration = -1;
  private generation = 0; // bumps on every stop so a stale async start can tell it was cancelled
  private stream: MicStreamLike | null = null;
  private teardownPipeline: (() => Promise<void> | void) | null = null;
  private gateOpen = true;
  private endedListeners: Array<{ track: MicTrackLike; listener: () => void }> = [];

  constructor(private readonly deps: MicrophoneDeps) {}

  get state(): MicState {
    return this.current;
  }

  private setState(next: MicState) {
    if (this.current === next) return;
    this.current = next;
    this.deps.onStateChange?.(next);
  }

  /**
   * Starts capturing. Concurrent calls share one attempt; calling while already recording is a
   * no-op that resolves true. Resolves false if the attempt was cancelled by `stop()`; rejects with
   * the underlying error if the device or permission is unavailable.
   */
  start(): Promise<boolean> {
    if (this.current === "recording") return Promise.resolve(true);
    // Share an in-flight attempt, but never one that a stop() has already doomed.
    if (this.starting && this.startingGeneration === this.generation) return this.starting;
    const generation = this.generation;
    this.startingGeneration = generation;
    this.setState("starting");
    const attempt: Promise<boolean> = this.open(generation).finally(() => {
      if (this.starting === attempt) this.starting = null;
    });
    this.starting = attempt;
    return attempt;
  }

  private async open(generation: number): Promise<boolean> {
    let stream: MicStreamLike | null = null;
    try {
      stream = await this.deps.getUserMedia();
      if (generation !== this.generation) return this.abandon(stream, null); // stopped while the prompt was open
      const teardown = await this.deps.pipeline.attach(stream, (samples) => {
        if (this.gateOpen && this.current === "recording") this.deps.onPcm(float32ToInt16(samples));
      });
      if (generation !== this.generation) return this.abandon(stream, teardown);
      this.stream = stream;
      this.teardownPipeline = teardown;
      this.applyGate();
      for (const track of stream.getTracks()) {
        const listener = () => this.handleDeviceEnded();
        track.addEventListener("ended", listener);
        this.endedListeners.push({ track, listener });
      }
      this.setState("recording");
      return true;
    } catch (error) {
      this.abandon(stream, null);
      if (generation === this.generation) this.setState("idle");
      throw error;
    }
  }

  /** Releases everything created by a start attempt that no longer wanted it. */
  private abandon(stream: MicStreamLike | null, teardown: (() => Promise<void> | void) | null): false {
    stream?.getTracks().forEach((track) => track.stop());
    void Promise.resolve(teardown?.()).catch(() => undefined);
    return false;
  }

  private handleDeviceEnded() {
    if (this.current !== "recording") return;
    this.stop();
    this.deps.onEnded?.();
  }

  /** Opens or closes the gate. Closed: the track is muted and frames are dropped; the capture stays alive. */
  setGate(open: boolean) {
    this.gateOpen = open;
    this.applyGate();
  }

  get isGateOpen() {
    return this.gateOpen;
  }

  private applyGate() {
    this.stream?.getTracks().forEach((track) => {
      track.enabled = this.gateOpen;
    });
  }

  /** Stops capturing and releases the stream, worklet and audio context. Safe to call at any time, any number of times. */
  stop() {
    this.generation += 1; // invalidates a start that is still in flight
    for (const { track, listener } of this.endedListeners) track.removeEventListener("ended", listener);
    this.endedListeners = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const teardown = this.teardownPipeline;
    this.teardownPipeline = null;
    void Promise.resolve(teardown?.()).catch(() => undefined);
    this.setState("idle");
  }
}

// ---- browser wiring ---------------------------------------------------------

/** Real-browser dependencies: 16 kHz mono capture through the `pcm-processor` AudioWorklet. */
export function createBrowserMicrophoneDeps(onPcm: (pcm: ArrayBuffer) => void, extra: Pick<MicrophoneDeps, "onEnded" | "onStateChange"> = {}): MicrophoneDeps {
  return {
    ...extra,
    onPcm,
    getUserMedia: () =>
      navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }) as Promise<MicStreamLike>,
    pipeline: {
      async attach(stream, onFrame) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioContextClass({ sampleRate: 16000 });
        try {
          const source = context.createMediaStreamSource(stream as unknown as MediaStream);
          await context.audioWorklet.addModule("/pcm-processor.js");
          const node = new AudioWorkletNode(context, "pcm-processor");
          node.port.onmessage = (event: MessageEvent<Float32Array>) => onFrame(event.data);
          source.connect(node);
          node.connect(context.destination);
          return async () => {
            node.port.onmessage = null;
            node.disconnect();
            source.disconnect();
            await context.close();
          };
        } catch (error) {
          await context.close().catch(() => undefined);
          throw error;
        }
      },
    },
  };
}
