const WebSocket = require("ws");

/**
 * Deepgram live-STT adapter. Expects PCM16 mono 16 kHz.
 * `open(handlers)` returns a stream: { send(buf)->bool, finalize(), close() }.
 */
function createDeepgramStt({ config, WebSocketImpl = WebSocket, log }) {
  function open(handlers) {
    const q = new URLSearchParams({
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      model: config.model,
      interim_results: "true",
      endpointing: String(config.endpointingMs),
      utterance_end_ms: String(config.utteranceEndMs),
      vad_events: "true",
    });
    const dg = new WebSocketImpl(`wss://api.deepgram.com/v1/listen?${q}`, {
      headers: { Authorization: `Token ${config.apiKey}` },
    });
    let keepAlive = null;
    let closed = false;

    dg.on("open", () => {
      keepAlive = setInterval(() => {
        if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "KeepAlive" }));
      }, config.keepAliveMs);
      keepAlive.unref?.();
      handlers.onOpen?.();
    });

    dg.on("message", (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.type === "Results") {
        const alt = m.channel?.alternatives?.[0];
        handlers.onResult?.({
          text: alt?.transcript || "",
          confidence: alt?.confidence,
          isFinal: !!m.is_final,
          speechFinal: !!m.speech_final,
          fromFinalize: !!m.from_finalize,
        });
      } else if (m.type === "UtteranceEnd") {
        handlers.onUtteranceEnd?.();
      } else if (m.type === "SpeechStarted") {
        handlers.onSpeechStarted?.();
      }
    });

    dg.on("error", (err) => {
      log?.warn("stt.error", { message: err.message });
      handlers.onError?.(err);
    });

    dg.on("close", (code) => {
      closed = true;
      clearInterval(keepAlive);
      handlers.onClose?.(code);
    });

    return {
      /** Returns false if the chunk was dropped (not open or backpressured). */
      send(buf) {
        if (dg.readyState !== WebSocket.OPEN) return false;
        if (dg.bufferedAmount > config.maxBufferedBytes) return false;
        dg.send(buf);
        return true;
      },
      finalize() {
        if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "Finalize" }));
      },
      close() {
        if (closed) return;
        try {
          if (dg.readyState === WebSocket.OPEN) {
            dg.send(JSON.stringify({ type: "CloseStream" }));
            dg.close(1000);
          } else {
            dg.terminate();
          }
        } catch {
          /* already closing */
        }
      },
    };
  }

  return { open };
}

module.exports = { createDeepgramStt };
