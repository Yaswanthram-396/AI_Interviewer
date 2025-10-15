const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const WebSocket = require("ws"); // Used for client-side connection AND Deepgram connection
const { ObjectId } = require("mongoose").Types;
const Interview = require("./models/Interview");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { SpeechClient } = require("@google-cloud/speech");
const { GoogleAuth } = require("google-auth-library");
const InterviewSession = require("./models/interviewSession.model");

// ❌ REMOVED Whisper/FFmpeg Dependencies
// const ffmpeg = require("fluent-ffmpeg");
// const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
// ffmpeg.setFfmpegPath(ffmpegInstaller.path);
// const FormData = require("form-data");

// -----------------------------
// ✅ GCP Credentials Setup (for Gemma/TTS)
// -----------------------------
function setupGcpCredentials() {
  const credsJson = process.env.GCP_CREDENTIALS_JSON;
  if (!credsJson) {
    console.warn(
      "⚠️ GCP_CREDENTIALS_JSON not set. Make sure to provide service account JSON."
    );
    return;
  }
  try {
    const tempFile = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
    fs.writeFileSync(tempFile, credsJson);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
    console.log(`✅ GCP credentials loaded from ${tempFile}`);
  } catch (err) {
    console.error("❌ Failed to set GCP credentials:", err);
  }
}
setupGcpCredentials();

// -----------------------------
// ✅ Google Clients (for Gemma/TTS)
// -----------------------------
const sttClient = new SpeechClient(); // Retained, though unused in STT, for completeness
const ttsClient = new TextToSpeechClient();

// -----------------------------
// ✅ Deepgram Credentials
// -----------------------------
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_API_KEY) {
  console.error("FATAL: DEEPGRAM_API_KEY is not set. Live STT will fail.");
}

// -----------------------------
// (Express App Setup - Omitted for brevity, assume correct)
// -----------------------------
const connectDB = require("./config/database");
const errorHandler = require("./middlewares/errorHandler");
const createInterview = require("./routes/index");
const app = express();
connectDB();

app.use(
  cors({
    origin: [], // your frontend URLs
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400,
  })
);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS),
    message: "Too many requests from this IP, try again later.",
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(xss());
app.use(compression());
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
app.use(cookieParser());
app.use("/api", createInterview);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "EarlyJobs API running",
    timestamp: new Date().toISOString(),
  });
});
app.use(errorHandler);
app.use("*", (req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

// -----------------------------
// ✅ WebSocket Server
// -----------------------------
const sessions = new Map();
const wss = new WebSocket.Server({ port: 8081 });
const SESSION_EXPIRY_MINUTES = 15;

/**
 * (DB/Session Utility Functions - Omitted for brevity, assume correct)
 */
function generateNewSessionId() {
  return `session_${Date.now()}`;
}
async function validateOrCreateSession(sessionId, expiresAt, interviewId) {
  // ... (Your existing DB logic)
  const now = new Date();
  let dbSession = await InterviewSession.findOne({ sessionId }).lean();

  if (dbSession) {
    if (dbSession.expiresAt < now) {
      dbSession = null;
    } else {
      return { isValid: true, isNew: false, session: dbSession };
    }
  }
  const newexpiresAt = expiresAt
    ? new Date(expiresAt)
    : new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  const newSession = await InterviewSession.create({
    sessionId,
    history: [],
    interviewId,
    interviewDetails: null,
    created: now,
    lastUpdated: now,
    expiresAt: newexpiresAt,
  });
  return { isValid: true, isNew: true, session: newSession };
}

// ❌ REMOVED processWhisperTranscription and convertPcmToMp3 functions

wss.on("connection", (ws) => {
  let currentSessionId = null;
  console.log("✅ WS client connected (Port 8081)");
  ws.on("message", async (message) => {
    console.log("📡 Received message:");
    try {
      const data = JSON.parse(message.toString());
      console.log(data);
      const { sessionId, expiresAt } = data;
      // let sessionId = clientSessionId || `session_${Date.now()}`;
      console.log("📡 Session ID:", sessionId, expiresAt);

      // -- 1. Validate or create MongoDB session (with expiry) --
      const sessionResult = await validateOrCreateSession(
        sessionId,
        expiresAt,
        data.interviewId
      );

      if (!sessionResult.isValid) {
        ws.send(
          JSON.stringify({
            type: "session_expired",
            message: "Your session has expired. Please start a new interview.",
            newSessionId: generateNewSessionId(),
          })
        );
        return;
      }

      // -- 2. Set/Resume In-memory session --
      let session = sessions.get(sessionId);
      if (!session || sessionResult.isNew) {
        session = {
          startTime: Date.now(),
          deepgramWs: null, // ✅ NEW: This will hold the connection to Deepgram
          isStreamReady: false,
          history: sessionResult.session.history || [],
          ws,
          interviewDetails: sessionResult.session.interviewDetails || null,
          expiresAt: sessionResult.session.expiresAt,
          // ❌ Removed Whisper-specific properties (audioBuffer, processInterval)
        };
        sessions.set(sessionId, session);
        currentSessionId = sessionId;
        console.log(
          sessionResult.isNew
            ? `New session created: ${sessionId}`
            : `Resumed session: ${sessionId}`
        );
      }

      if (data.type === "tts_request") {
        let prompt = data.prompt || "";
        if (data.interviewId && !session.interviewDetails) {
          if (!ObjectId.isValid(data.interviewId)) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid interviewId",
              })
            );
            return;
          }
          const interview = await Interview.findById(data.interviewId).lean();
          if (!interview) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Interview not found",
              })
            );
            return;
          }
          session.interviewDetails = {
            title: interview.title || "Software Engineer",
            description: interview.description || "No description available.",
            difficulty: interview.title.toLowerCase().includes("senior")
              ? "Advanced"
              : interview.difficulty || "Beginner",
          };
        }

        const jobTitle = session.interviewDetails?.title || "Software Engineer";
        let difficulty = session.interviewDetails?.difficulty || "Beginner";
        if (jobTitle.toLowerCase().includes("senior")) difficulty = "Advanced";

        //         const systemInstruction = `
        // You are a professional HR/technical interviewer named SIRI.
        // - Always give short, clear, and concise responses.
        // - Keep every question or statement under 20 words.
        // - On the FIRST interaction, greet the candidate and ask them to introduce themselves.
        // - If the candidate gives a very short, unclear, or incomplete response, politely motivate them to give a full introduction. For example:
        //   - "Could you tell me a bit more about your background and experience?"
        //   - "Take your time — I’d love to hear about your skills and what excites you about this role."
        // - Only proceed to technical questions once the candidate gives a proper introduction.
        // - From the second question onwards, ask one technical or experience-based question.
        // - Never repeat questions.
        // - Don't answer the Questions
        // - Never break character as the interviewer.
        // Job Title: ${jobTitle}
        // Difficulty: ${difficulty}`;
        const systemInstruction = `
You are a **professional, yet engaging HR/technical interviewer** named **SIRI**.
Your goal is to conduct a structured and challenging interview for the **${jobTitle}** role at a **${difficulty}** level.

**CONTEXT AND STRICT CONSTRAINTS (Top Priority):**
- **Job Title:** ${jobTitle}
- **Difficulty:** ${difficulty}
- **Tone & Persona:** **NEVER** break character as the interviewer (SIRI).
- **Output Format:** Keep every response **under 20 words**. Be concise and professional.
- **Safety:** **NEVER** answer a question the candidate poses.
- **Tracking:** **NEVER** repeat any question (except clarification/refocusing prompts).

**CONVERSATIONAL INTERVIEW FLOW:**
1. **First Turn:** Greet the candidate warmly, introduce yourself as SIRI, and ask them to introduce themselves and their relevant background.
2.  **Acknowledgment:** Always include a brief, positive acknowledgment (like "Understood," "Excellent," or "Thanks") before your next statement or question.
3.  **Refocusing Rule (CRITICAL):**
    * If the candidate mentions experience or skills **unrelated** to the **${jobTitle}** or **${difficulty}** level, politely acknowledge it, but immediately redirect the conversation to the job requirements.
    * *Example Refocusing Prompt:* "That’s noted. How does your graphic design experience relate to the Senior Python Developer role?"
4.  **Handling Unclear Responses (Clarification Loop):**
    * If the user's last response is vague, short, or incomplete, **DO NOT** ask a new technical question.
    * Instead, politely prompt the user for clarification using a standardized phrase like, "Understood, can you please elaborate?"
5.  **Next Question:** Once a proper and clear response is received, transition to asking **one new, relevant technical or experience-based question** per turn, based exclusively on the requirements of the **${jobTitle}**.
`;
        let messages = [
          { role: "system", content: systemInstruction },
          ...session.history,
        ];
        if (prompt.trim() !== "") {
          // Normal follow-up interaction
          messages.push({ role: "user", content: prompt });
        } else {
          // FIRST interaction
          session.history = []; // ✅ reset history to avoid stale data
          messages.push({
            role: "user",
            content: `This is the first interaction. Please greet the candidate as SIRI and ask them to introduce themselves.`,
          });
        }
        function isDuplicateQuestion(newQuestion, history) {
          const lowerQ = newQuestion.toLowerCase().trim();
          return history.some(
            (msg) =>
              msg.role === "assistant" &&
              msg.content.toLowerCase().trim() === lowerQ
          );
        }

        try {
          // Google Auth/Gemma logic
          const tempFilePath = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
          fs.writeFileSync(tempFilePath, process.env.GCP_CREDENTIALS_JSON);

          const auth = new GoogleAuth({
            keyFile: tempFilePath,
            scopes: "https://www.googleapis.com/auth/cloud-platform",
          });

          const accessToken = await auth.getAccessToken();
          const PROJECT_ID = "949170828684";
          const ENDPOINT_ID = "736262672772759552";
          const gemmaEndpoint = `https://736262672772759552.us-central1-949170828684.prediction.vertexai.goog/v1/projects/${PROJECT_ID}/locations/us-central1/endpoints/${ENDPOINT_ID}:predict`;
          const gemmaRequestBody = {
            instances: [
              {
                "@requestFormat": "chatCompletions",
                messages,
                max_tokens: 50,
                temperature: 0.7,
                top_p: 0.8,
              },
            ],
          };
          const gemmaResponse = await axios.post(
            gemmaEndpoint,
            gemmaRequestBody,
            {
              headers: {
                Authorization: `Bearer ${accessToken.token || accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          // NEW: Clean extraction from chat endpoint
          let textReply = "Let's continue with the next technical question.";
          const choices = gemmaResponse.data?.predictions?.choices; // Fixed path based on Vertex AI response structure
          if (choices && choices[0]?.message?.content) {
            console.log(`Gemma response: ${choices[0].message.content.trim()}`);
            textReply = choices[0].message.content.trim();
          }
          if (isDuplicateQuestion(textReply, session.history)) {
            console.log(
              "🌀 Duplicate question detected. Asking model to rephrase."
            );
            messages.push({
              role: "user",
              content: `You already asked this question. Ask a different technical question without repeating.`,
            });
            const gemmaResponse2 = await axios.post(
              gemmaEndpoint,
              gemmaRequestBody,
              {
                headers: {
                  Authorization: `Bearer ${accessToken.token || accessToken}`,
                  "Content-Type": "application/json",
                },
              }
            );
            textReply =
              gemmaResponse2.data?.predictions?.[0]?.choices?.[0]?.message
                ?.content || textReply;
          }
          session.history.push({ role: "user", content: prompt });
          session.history.push({ role: "assistant", content: textReply });

          // -- 4. Update expiry (slide window) and MongoDB session --
          const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
          session.expiresAt = newExpiresAt;
          await InterviewSession.findOneAndUpdate(
            { sessionId },
            {
              $set: {
                lastUpdated: new Date(),
                interviewDetails: session.interviewDetails,
                expiresAt: newExpiresAt,
              },
              $setOnInsert: { created: new Date() },
              $push: {
                history: {
                  $each: [
                    { role: "user", content: prompt },
                    { role: "assistant", content: textReply },
                  ],
                },
              },
            },
            { upsert: true }
          );
          // (Send TTS as before)
          const [ttsResponse] = await ttsClient.synthesizeSpeech({
            input: { text: textReply },
            voice: { languageCode: "en-US", name: "en-US-Standard-C" },
            audioConfig: { audioEncoding: "MP3" },
          });
          const audioBase64 = Buffer.from(ttsResponse.audioContent).toString(
            "base64"
          );
          ws.send(
            JSON.stringify({
              type: "tts_audio",
              audioBase64,
              text: textReply,
            })
          );
        } catch (e) {
          console.error("❌ Gemma/TTS call failed:", e);
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Gemma/TTS failed: ${e.message}`,
            })
          );
        }
      }

      // -----------------------------
      // ✅ DEEPGRAM LIVE STT Logic
      // -----------------------------
      if (data.type === "start_stt") {
        if (!DEEPGRAM_API_KEY) {
          ws.send(
            JSON.stringify({
              type: "stt_error",
              message: "Deepgram API key not configured on server.",
            })
          );
          return;
        }

        // Close any existing Deepgram connection before starting a new one
        if (session.deepgramWs) {
          session.deepgramWs.close(1000, "Restarting stream");
          session.deepgramWs = null;
        }

        // 1. Construct the WSS URL with parameters
        // The client must send raw LINEAR16 audio at 16kHz
        const deepgramUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2&interim_results=true&endpointing=300`;

        // 2. Open the WebSocket connection to Deepgram
        const deepgramWs = new WebSocket(deepgramUrl, {
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
          },
        });

        deepgramWs.on("open", () => {
          session.deepgramWs = deepgramWs;
          session.isStreamReady = true;
          console.log(`✅ Deepgram Stream opened for ${sessionId}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "stt_started", sessionId }));
          }
        });

        deepgramWs.on("message", (message) => {
          const dgData = JSON.parse(message.toString());

          if (
            dgData.type === "Results" &&
            dgData.channel?.alternatives?.length > 0
          ) {
            const transcript = dgData.channel.alternatives[0].transcript;
            const isFinal = dgData.is_final;
            console.log("dgData", dgData);
            const result = dgData.channel?.results?.[0]?.alternatives[0] || {};

            if (transcript.trim() !== "" && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  // 🚨 Sends each final fragment as a separate message
                  type: isFinal ? "final_transcript" : "interim_transcript",
                  transcript: transcript,
                  confidence: result.confidence,
                })
              );
            }

            if (isFinal) {
              // Optionally close the Deepgram stream after a final utterance
              // Deepgram's endpointing=300 setting will handle this on silence, but we can do it explicitly too.
              // deepgramWs.close(1000, 'Utterance finished');
              console.log(`✅ Deepgram Final Result: "${transcript}"`);
            } else if (dgData.type === "SpeechStarted") {
              console.log(`[${sessionId}] Deepgram detected speech start.`);
            }
          }
          // Ignore KeepAlive, Metadata, UtteranceEnd, etc. for simple transcription
        });

        deepgramWs.on("error", (err) => {
          console.error(
            `❌ Deepgram Stream Error for ${sessionId}: ${err.message}`
          );
          session.deepgramWs = null;
          session.isStreamReady = false;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: "stt_error", message: err.message })
            );
          }
        });

        deepgramWs.on("close", (code, reason) => {
          console.log(`Deepgram Stream closed (${code}): ${reason.toString()}`);
          session.deepgramWs = null;
          session.isStreamReady = false;
        });
      }

      // --- Audio chunks from browser (base64 PCM16 mono) ---
      if (data.type === "audio_chunk") {
        if (
          session.isStreamReady &&
          session.deepgramWs?.readyState === WebSocket.OPEN
        ) {
          try {
            // Send raw binary buffer directly to Deepgram WSS
            const audioBuffer = Buffer.from(data.audioBase64, "base64");
            session.deepgramWs.send(audioBuffer);
            // console.log(`[${sessionId}] Sent audio chunk of size: ${audioBuffer.length}`);
          } catch (e) {
            console.error("❌ Failed to send chunk to Deepgram:", e.message);
            // Optionally close the connection if a critical error occurs
            if (session.deepgramWs)
              session.deepgramWs.close(1011, "Chunk send failure");
          }
        }
      }

      // --- Stop/cleanup ---
      if (data.type === "stop_stt") {
        session.isStreamReady = false;
        if (session.deepgramWs?.readyState === WebSocket.OPEN) {
          // Signal to Deepgram that the audio stream is finished
          session.deepgramWs.send(JSON.stringify({ type: "Finalize" }));
          // Give Deepgram a moment to send the final result, then close
          setTimeout(() => {
            if (session.deepgramWs?.readyState === WebSocket.OPEN) {
              session.deepgramWs.close(1000, "Manual client stop");
            }
            session.deepgramWs = null;
          }, 500);
          console.log(`✅ Deepgram Finalize sent for ${sessionId}`);
        }
      }
    } catch (err) {
      console.error("WebSocket message processing failed:", err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    }
  });

  ws.on("close", () => {
    if (currentSessionId) {
      const session = sessions.get(currentSessionId);
      // Clean up the Deepgram connection on disconnect
      if (session && session.deepgramWs?.readyState === WebSocket.OPEN) {
        session.deepgramWs.close(1000, "Client disconnected");
      }
      sessions.delete(currentSessionId);
      console.log(
        `⚡ WS disconnected. Session ${currentSessionId} cleaned up.`
      );
    } else console.log("⚡ WS disconnected (No session tracked).");
  });
});
