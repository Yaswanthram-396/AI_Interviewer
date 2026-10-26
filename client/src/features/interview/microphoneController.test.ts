import { describe, expect, it, vi } from "vitest";
import { MicrophoneController, float32ToInt16, type MicPipelineLike, type MicStreamLike, type MicTrackLike } from "./microphoneController";

/** Fakes: no browser needed. Every resource records whether it was released. */
function fakeTrack(): MicTrackLike & { stopped: boolean; fireEnded(): void; listeners: Set<() => void> } {
  const listeners = new Set<() => void>();
  return {
    enabled: true,
    stopped: false,
    listeners,
    stop() {
      this.stopped = true;
    },
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    fireEnded: () => listeners.forEach((l) => l()),
  };
}

function setup() {
  const streams: Array<MicStreamLike & { track: ReturnType<typeof fakeTrack> }> = [];
  const pipelines: Array<{ tornDown: boolean; emit(samples: Float32Array): void }> = [];
  const pendingPrompts: Array<() => void> = [];
  let holdPermission = false;
  let failWith: Error | null = null;
  const pcm: ArrayBuffer[] = [];
  const states: string[] = [];
  const onEnded = vi.fn();

  const getUserMedia = vi.fn(async () => {
    if (holdPermission) await new Promise<void>((resolve) => pendingPrompts.push(resolve));
    if (failWith) throw failWith;
    const track = fakeTrack();
    const stream = { getTracks: () => [track], track };
    streams.push(stream);
    return stream;
  });
  const pipeline: MicPipelineLike = {
    async attach(_stream, onFrame) {
      const record = { tornDown: false, emit: onFrame };
      pipelines.push(record);
      return () => {
        record.tornDown = true;
      };
    },
  };
  const mic = new MicrophoneController({ getUserMedia, pipeline, onPcm: (b) => pcm.push(b), onEnded, onStateChange: (s) => states.push(s) });
  return {
    mic,
    streams,
    pipelines,
    pcm,
    states,
    onEnded,
    getUserMedia,
    holdPermission: () => (holdPermission = true),
    grantPermission: () => pendingPrompts.splice(0).forEach((release) => release()),
    deny: (error: Error) => (failWith = error),
  };
}

const frame = () => new Float32Array([0.1, -0.1, 0.2]);

describe("MicrophoneController", () => {
  it("captures one stream and forwards PCM", async () => {
    const t = setup();
    expect(await t.mic.start()).toBe(true);
    expect(t.mic.state).toBe("recording");
    t.pipelines[0].emit(frame());
    expect(t.pcm).toHaveLength(1);
    expect(new Int16Array(t.pcm[0])).toHaveLength(3);
  });

  it("rapid start calls create exactly one capture", async () => {
    const t = setup();
    t.holdPermission();
    const attempts = [t.mic.start(), t.mic.start(), t.mic.start()];
    expect(t.mic.state).toBe("starting");
    t.grantPermission();
    expect(await Promise.all(attempts)).toEqual([true, true, true]);
    expect(await t.mic.start()).toBe(true); // already recording: no-op
    expect(t.getUserMedia).toHaveBeenCalledTimes(1);
    expect(t.streams).toHaveLength(1);
    expect(t.pipelines).toHaveLength(1);
  });

  it("stop releases the tracks and the audio pipeline, and is idempotent", async () => {
    const t = setup();
    await t.mic.start();
    t.mic.stop();
    t.mic.stop();
    expect(t.streams[0].track.stopped).toBe(true);
    expect(t.pipelines[0].tornDown).toBe(true);
    expect(t.mic.state).toBe("idle");
    expect(t.streams[0].track.listeners.size).toBe(0); // event listeners removed
    t.pipelines[0].emit(frame());
    expect(t.pcm).toHaveLength(0); // nothing leaks through after stop
  });

  it("a stop issued while the permission prompt is open leaves no live microphone behind", async () => {
    const t = setup();
    t.holdPermission();
    const attempt = t.mic.start();
    t.mic.stop();
    t.grantPermission(); // the prompt resolves after the user already stopped
    expect(await attempt).toBe(false);
    expect(t.streams[0].track.stopped).toBe(true);
    expect(t.mic.state).toBe("idle");
    expect(t.pipelines).toHaveLength(0);
  });

  it("start after a stop does not reuse the cancelled attempt", async () => {
    const t = setup();
    t.holdPermission();
    const doomed = t.mic.start();
    t.mic.stop();
    const fresh = t.mic.start(); // a new attempt, not the doomed one
    t.grantPermission();
    expect(await doomed).toBe(false);
    expect(await fresh).toBe(true);
    expect(t.getUserMedia).toHaveBeenCalledTimes(2);
    expect(t.streams[0].track.stopped).toBe(true); // the doomed capture was released
    expect(t.streams[1].track.stopped).toBe(false); // the new one is live
    expect(t.mic.state).toBe("recording");
  });

  it("the gate mutes the track and drops frames without tearing the capture down", async () => {
    const t = setup();
    await t.mic.start();
    t.mic.setGate(false);
    expect(t.streams[0].track.enabled).toBe(false);
    t.pipelines[0].emit(frame());
    expect(t.pcm).toHaveLength(0);
    expect(t.mic.state).toBe("recording");
    t.mic.setGate(true);
    expect(t.streams[0].track.enabled).toBe(true);
    t.pipelines[0].emit(frame());
    expect(t.pcm).toHaveLength(1);
  });

  it("a gate closed before the stream exists is applied when it does", async () => {
    const t = setup();
    t.mic.setGate(false);
    await t.mic.start();
    expect(t.streams[0].track.enabled).toBe(false);
  });

  it("permission denial rejects and leaves the controller idle and restartable", async () => {
    const t = setup();
    t.deny(new Error("Permission denied"));
    await expect(t.mic.start()).rejects.toThrow("Permission denied");
    expect(t.mic.state).toBe("idle");
    t.deny(null as unknown as Error);
    expect(await t.mic.start()).toBe(true);
  });

  it("a device that disappears mid-recording stops cleanly and notifies the owner", async () => {
    const t = setup();
    await t.mic.start();
    t.streams[0].track.fireEnded();
    expect(t.mic.state).toBe("idle");
    expect(t.onEnded).toHaveBeenCalledTimes(1);
    expect(t.pipelines[0].tornDown).toBe(true);
  });

  it("reports state changes in order", async () => {
    const t = setup();
    await t.mic.start();
    t.mic.stop();
    expect(t.states).toEqual(["starting", "recording", "idle"]);
  });
});

describe("float32ToInt16", () => {
  it("clamps and converts", () => {
    const out = new Int16Array(float32ToInt16(new Float32Array([0, 1, -1, 0.25])));
    expect(Array.from(out)).toEqual([0, 0x7fff, -0x7fff, Math.trunc(0.5 * 0x7fff)]);
  });
});
