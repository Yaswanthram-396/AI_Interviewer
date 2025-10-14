const { spawn } = require("child_process");
const { config } = require("dotenv");
const { createClient } = require("@deepgram/sdk");
// - or -
// import { createClient } from "@deepgram/sdk";

config();

const STREAM_URL = "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

// Terminal colors for confidence
const Colors = {
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  ORANGE: "\x1b[91m",
  RED: "\x1b[31m",
  RESET: "\x1b[0m",
};

function getConfidenceColor(conf) {
  if (conf >= 0.9) return Colors.GREEN;
  if (conf >= 0.8) return Colors.YELLOW;
  if (conf >= 0.7) return Colors.ORANGE;
  return Colors.RED;
}

// Session object to track connection state
const session = {
  dgConnection: null,
  isStreamReady: false,
  streamRestartTimer: null,
};

// Optional: Dummy WS object if you want to send updates

async function startSTTStream(sessionId = "bbc_stream") {
  const deepgram = createClient(DEEPGRAM_API_KEY);

  const maxRetries = 3;
  let retryCount = 0;

  const attemptStream = async () => {
    try {
      const streamStartTime = Date.now();
      const deepgramLive = await deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        encoding: "linear16",
        sample_rate: 16000,
        interim_results: true,
        smart_format: true,
        keep_alive: true,
      });

      session.dgConnection = deepgramLive;

      deepgramLive.on("open", () => {
        session.isStreamReady = true;
        console.log(
          `✅ Deepgram stream opened after ${Date.now() - streamStartTime}ms for ${sessionId}`
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "stt_started", sessionId }));
        }
      });

      deepgramLive.on("results", (dgData) => {
        const alt = dgData.channel?.alternatives?.[0];
        if (!alt) return;

        const transcript = alt.transcript?.trim() || "";
        const confidence = alt.confidence || 0;
        const type = dgData.is_final
          ? "final_transcript"
          : "interim_transcript";

        if (transcript) {
          console.log(
            `🎤 Deepgram ${type} (conf ${confidence.toFixed(2)}): ${transcript}`
          );
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type, transcript, confidence, sessionId })
            );
          }

          // Emit TTS request if final
          if (dgData.is_final && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "tts_request",
                sessionId,
                prompt: transcript,
              })
            );
          }
        }
      });

      deepgramLive.on("error", (err) => {
        console.error(`❌ Deepgram error for ${sessionId}:`, err.message);
        session.dgConnection = null;
        session.isStreamReady = false;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "stt_error",
              message: err.message,
              sessionId,
            })
          );
        }

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(
            `Retrying Deepgram stream (${retryCount}/${maxRetries}) for ${sessionId}`
          );
          setTimeout(attemptStream, 1000 * retryCount);
        }
      });

      deepgramLive.on("close", () => {
        console.log(`🛑 Deepgram stream closed for ${sessionId}`);
        session.dgConnection = null;
        session.isStreamReady = false;
      });

      // Start ffmpeg to stream BBC -> linear16 PCM
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        STREAM_URL,
        "-f",
        "s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-",
      ]);

      ffmpeg.stdout.on("data", async (chunk) => {
        try {
          await deepgramLive.send(chunk);
        } catch (err) {
          console.error("Error sending audio chunk:", err);
        }
      });

      ffmpeg.stderr.on("data", (data) => {
        // Uncomment for ffmpeg logs
        // console.log(data.toString());
      });

      ffmpeg.on("close", () => console.log("✅ FFmpeg process finished"));

      // Auto-restart after 4 mins
      session.streamRestartTimer = setTimeout(() => {
        console.log(`[${sessionId}] Restarting Deepgram stream`);
        try {
          deepgramLive.close();
        } catch (e) {}
        attemptStream();
      }, 240000);
    } catch (err) {
      console.error(`Failed to start Deepgram stream for ${sessionId}:`, err);
      session.dgConnection = null;
      session.isStreamReady = false;

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "error", message: err.message, sessionId })
        );
      }

      if (retryCount < maxRetries) {
        retryCount++;
        console.log(
          `Retrying Deepgram stream (${retryCount}/${maxRetries}) for ${sessionId}`
        );
        setTimeout(attemptStream, 1000 * retryCount);
      }
    }
  };

  await attemptStream();
}
module.exports = startSTTStream;
// Start streaming;
