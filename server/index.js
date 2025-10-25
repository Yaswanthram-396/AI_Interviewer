// const express = require("express");
// const cors = require("cors");
// const helmet = require("helmet");
// const compression = require("compression");
// const morgan = require("morgan");
// const rateLimit = require("express-rate-limit");
// const xss = require("xss-clean");
// const cookieParser = require("cookie-parser");
// const axios = require("axios");
// const WebSocket = require("ws"); // Used for client-side connection AND Deepgram connection
// const { ObjectId } = require("mongoose").Types;
// const Interview = require("./models/Interview"); // Kept for interview details lookup
// const fs = require("fs");
// const path = require("path");
// const os = require("os");
// require("dotenv").config();
// const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
// const { SpeechClient } = require("@google-cloud/speech");
// const { GoogleAuth } = require("google-auth-library");
// const InterviewSession = require("./models/interviewSession.model"); // Unused, but kept for imports

// // ❌ REMOVED Whisper/FFmpeg Dependencies
// // const ffmpeg = require("fluent-ffmpeg");
// // const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
// // ffmpeg.setFfmpegPath(ffmpegInstaller.path);
// // const FormData = require("form-data");

// // -----------------------------
// // ✅ GCP Credentials Setup (for Gemma/TTS)
// // -----------------------------
// function setupGcpCredentials() {
//   const credsJson = process.env.GCP_CREDENTIALS_JSON;
//   if (!credsJson) {
//     console.warn(
//       "⚠️ GCP_CREDENTIALS_JSON not set. Make sure to provide service account JSON."
//     );
//     return;
//   }
//   try {
//     const tempFile = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
//     fs.writeFileSync(tempFile, credsJson);
//     process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFile;
//     console.log(`✅ GCP credentials loaded from ${tempFile}`);
//   } catch (err) {
//     console.error("❌ Failed to set GCP credentials:", err);
//   }
// }
// setupGcpCredentials();

// // -----------------------------
// // ✅ Google Clients (for Gemma/TTS)
// // -----------------------------
// const sttClient = new SpeechClient(); // Retained, though unused in STT, for completeness
// const ttsClient = new TextToSpeechClient();

// // -----------------------------
// // ✅ Deepgram Credentials
// // -----------------------------
// const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
// if (!DEEPGRAM_API_KEY) {
//   console.error("FATAL: DEEPGRAM_API_KEY is not set. Live STT will fail.");
// }

// // -----------------------------
// // (Express App Setup - Omitted for brevity, assume correct)
// // -----------------------------
// const connectDB = require("./config/database");
// const errorHandler = require("./middlewares/errorHandler");
// const createInterview = require("./routes/interview.routes");
// const app = express();
// connectDB();

// app.use(
//   cors({
//     origin: ["http://localhost:3000"], // your frontend URLs
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     exposedHeaders: ["Content-Range", "X-Content-Range"],
//     maxAge: 86400,
//   })
// );
// app.use(helmet());
// app.use(
//   rateLimit({
//     windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
//     max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS),
//     message: "Too many requests from this IP, try again later.",
//   })
// );
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// app.use(xss());
// app.use(compression());
// if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
// app.use(cookieParser());
// app.use("/api", createInterview);

// app.get("/api/health", (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: "EarlyJobs API running",
//     timestamp: new Date().toISOString(),
//   });
// });
// app.use(errorHandler);
// app.use("*", (req, res) =>
//   res.status(404).json({ success: false, message: "Route not found" })
// );

// const PORT = process.env.PORT || 5001;
// const server = app.listen(PORT, () =>
//   console.log(`🚀 Server running on port ${PORT}`)
// );

// // -----------------------------
// // ✅ WebSocket Server
// // -----------------------------
// const sessions = new Map();
// const wss = new WebSocket.Server({ port: 8081 });

// wss.on("connection", (ws, req) => {
//   // 1. EXTRACT SESSION ID FROM URL QUERY PARAMETER
//   const connectionUrl = new URL(req.url, `http://localhost:8081`);
//   const requestedSessionId = connectionUrl.searchParams.get("sessionId");

//   if (!requestedSessionId) {
//     console.error(
//       "❌ Connection rejected: No sessionId provided in query parameter."
//     );
//     ws.close(1008, "Session ID required in URL query.");
//     return;
//   }

//   // Set the current session ID based on the URL parameter
//   let currentSessionId = requestedSessionId;
//   console.log(
//     `✅ WS client connected (Port 8081) for Session ID: ${currentSessionId}`
//   );

//   // --- Session initialization/lookup (Now uses the requested ID) ---
//   let session = sessions.get(currentSessionId);

//   if (!session) {
//     // Initialize a new in-memory session
//     session = {
//       startTime: Date.now(),
//       deepgramWs: null,
//       isStreamReady: false,
//       history: [],
//       ws, // Store the new WebSocket connection
//       nextQuestionIndex: 0,
//       interviewDetails: null, // Will be fetched on the first tts_request
//     };
//     sessions.set(currentSessionId, session);
//     console.log(`Initialized new in-memory session: ${currentSessionId}`);
//   } else {
//     // Update the websocket reference for the active session (for client reconnects)
//     session.ws = ws;
//     console.log(`Reconnected client to existing session: ${currentSessionId}`);
//   }

//   ws.on("message", async (message) => {
//     // const SINGLE_SESSION_ID = message.sessionId; // ❌ REMOVED: No longer read from message
//     // console.log("📡 Received message for Session ID:", currentSessionId);
//     try {
//       const data = JSON.parse(message.toString());
//       const sessionId = data.sessionId || currentSessionId;
//       // -------------------------------------------------------------------------------------------------
//       // ✅ TTS Request (Gemma Call)
//       // -------------------------------------------------------------------------------------------------
//       if (data.type === "tts_request") {
//         let prompt = data.prompt || "";

//         // Retained: Fetch interview details if needed, still requires DB lookup
//         if (data.interviewId && !session.interviewDetails) {
//           if (!ObjectId.isValid(data.interviewId)) {
//             ws.send(
//               JSON.stringify({
//                 type: "error",
//                 message: "Invalid interviewId",
//               })
//             );
//             return;
//           }
//           const interview = await Interview.findById(data.interviewId).lean();
//           if (!interview) {
//             ws.send(
//               JSON.stringify({
//                 type: "error",
//                 message: "Interview not found",
//               })
//             );
//             return;
//           }
//           session.interviewDetails = {
//             title: interview.title || "Software Engineer",
//             description: interview.description || "No description available.",
//             generatedQuestions: interview.generatedQuestions || [],
//             difficulty: interview.title.toLowerCase().includes("senior")
//               ? "Advanced"
//               : interview.difficulty || "Beginner",
//           };
//         }

//         const jobTitle = session.interviewDetails?.title || "Software Engineer";
//         let difficulty = session.interviewDetails?.difficulty || "Beginner";
//         if (jobTitle.toLowerCase().includes("senior")) difficulty = "Advanced";
//         const generatedQuestions =
//           session.interviewDetails?.generatedQuestions || [];
//         const currentIndex = session.nextQuestionIndex;
//         console.log("currentIndex", currentIndex, generatedQuestions);
//         if (
//           generatedQuestions.length > 0 &&
//           currentIndex < generatedQuestions.length
//         ) {
//           const nextQuestion = generatedQuestions[currentIndex];
//           // This mandatory instruction overrides Rule #4 in the system prompt below.
//           specificQuestionInstruction = `
// ***MANDATORY NEXT QUESTION:*** The candidate just responded. Your next turn MUST use the following question: "${nextQuestion}". You must **rephrase and formalize this question to be under 20 words** for the current turn.
// `;
//         } else if (
//           generatedQuestions.length > 0 &&
//           currentIndex >= generatedQuestions.length
//         ) {
//           specificQuestionInstruction = `You have used all pre-generated questions. Now, continue the interview by organically generating new, relevant questions based on the job title.`;
//         } else {
//           // No generated questions exist at all
//           specificQuestionInstruction = `The pre-generated question list is empty. Continue the interview by organically generating new, relevant questions based on the job title.`;
//         }
//         console.log("specificQuestionInstruction", specificQuestionInstruction);
//         // --- 3. Modify System Instruction with the new logic ---
//         const systemInstruction = `
// You are a **professional, yet engaging HR/technical interviewer** named **SIRI**.
// Your goal is to conduct a structured and challenging interview for the **${jobTitle}** role at a **${difficulty}** level.

// **CONTEXT AND STRICT CONSTRAINTS (Top Priority):**
// - **Job Title:** ${jobTitle}
// - **Difficulty:** ${difficulty}
// - **Tone & Persona:** **NEVER** break character as the interviewer (SIRI).
// - **Output Format:** Keep every response **under 20 words**. Be concise and professional.
// - **Safety:** **NEVER** answer a question the candidate poses.
// - **Tracking:** **NEVER** repeat any question (except clarification/refocusing prompts).

// **QUESTION PRIORITY RULES (CRITICAL):**
// - ${specificQuestionInstruction.trim()}

// **CONVERSATIONAL INTERVIEW FLOW:**
// 1. **First Turn:** Greet the candidate warmly, introduce yourself as SIRI, and ask them to introduce themselves and their relevant background.
// 2.  **Acknowledgment:** Always include a brief, positive acknowledgment (like "Understood," "Excellent," or "Thanks") before your next statement or question.
// 3.  **Refocusing Rule (CRITICAL):**
//     * If the candidate mentions experience or skills **unrelated** to the **${jobTitle}** or **${difficulty}** level, politely acknowledge it, but immediately redirect the conversation to the job requirements.
//     * *Example Refocusing Prompt:* "That’s noted. How does your graphic design experience relate to the Senior Python Developer role?"
// 4.  **Default Next Question:** Once a proper and clear response is received, transition to asking **one new, relevant technical or experience-based question** per turn, based exclusively on the requirements of the **${jobTitle}** (This rule is overridden by the MANDATORY question above if one exists).
// `;
//         let messages = [
//           { role: "system", content: systemInstruction },
//           ...session.history,
//         ];
//         if (prompt.trim() !== "") {
//           // Normal follow-up interaction
//           messages.push({ role: "user", content: prompt });
//         } else {
//           // FIRST interaction
//           session.history = []; // ✅ reset history to avoid stale data
//           messages.push({
//             role: "user",
//             content: `This is the first interaction. Please greet the candidate as SIRI and ask them to introduce themselves.`,
//           });
//         }
//         function isDuplicateQuestion(newQuestion, history) {
//           const lowerQ = newQuestion.toLowerCase().trim();
//           return history.some(
//             (msg) =>
//               msg.role === "assistant" &&
//               msg.content.toLowerCase().trim() === lowerQ
//           );
//         }

//         try {
//           // ... (Google Auth/Gemma logic remains the same)
//           const tempFilePath = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
//           fs.writeFileSync(tempFilePath, process.env.GCP_CREDENTIALS_JSON);

//           const auth = new GoogleAuth({
//             keyFile: tempFilePath,
//             scopes: "https://www.googleapis.com/auth/cloud-platform",
//           });

//           const accessToken = await auth.getAccessToken();
//           const PROJECT_ID = "949170828684";
//           const ENDPOINT_ID = "736262672772759552";
//           const gemmaEndpoint = `https://736262672772759552.us-central1-949170828684.prediction.vertexai.goog/v1/projects/${PROJECT_ID}/locations/us-central1/endpoints/${ENDPOINT_ID}:predict`;
//           const gemmaRequestBody = {
//             instances: [
//               {
//                 "@requestFormat": "chatCompletions",
//                 messages,
//                 max_tokens: 50,
//                 temperature: 0.7,
//                 top_p: 0.8,
//               },
//             ],
//           };
//           const gemmaResponse = await axios.post(
//             gemmaEndpoint,
//             gemmaRequestBody,
//             {
//               headers: {
//                 Authorization: `Bearer ${accessToken.token || accessToken}`,
//                 "Content-Type": "application/json",
//               },
//             }
//           );

//           // NEW: Clean extraction from chat endpoint
//           let textReply = "Let's continue with the next technical question.";
//           const choices = gemmaResponse.data?.predictions?.choices; // Fixed path based on Vertex AI response structure
//           if (choices && choices[0]?.message?.content) {
//             console.log(`Gemma response: ${choices[0].message.content.trim()}`);
//             if (
//               generatedQuestions.length > 0 &&
//               currentIndex < generatedQuestions.length
//             ) {
//               session.nextQuestionIndex++;
//               console.log(
//                 `Incremented nextQuestionIndex to: ${session.nextQuestionIndex}`
//               );
//             }
//             textReply = choices[0].message.content.trim();
//           }
//           if (isDuplicateQuestion(textReply, session.history)) {
//             console.log(
//               "🌀 Duplicate question detected. Asking model to rephrase."
//             );
//             messages.push({
//               role: "user",
//               content: `You already asked this question. Ask a different technical question without repeating.`,
//             });
//             const gemmaResponse2 = await axios.post(
//               gemmaEndpoint,
//               gemmaRequestBody,
//               {
//                 headers: {
//                   Authorization: `Bearer ${accessToken.token || accessToken}`,
//                   "Content-Type": "application/json",
//                 },
//               }
//             );
//             textReply =
//               gemmaResponse2.data?.predictions?.[0]?.choices?.[0]?.message
//                 ?.content || textReply;
//           }

//           // ✅ ONLY UPDATE IN-MEMORY HISTORY
//           session.history.push({ role: "user", content: prompt });
//           session.history.push({ role: "assistant", content: textReply });

//           // ❌ REMOVED: Database session update (findOneAndUpdate) logic

//           // (Send TTS as before)
//           const [ttsResponse] = await ttsClient.synthesizeSpeech({
//             input: { text: textReply },
//             voice: { languageCode: "en-US", name: "en-US-Standard-C" },
//             audioConfig: { audioEncoding: "MP3" },
//           });
//           const audioBase64 = Buffer.from(ttsResponse.audioContent).toString(
//             "base64"
//           );
//           ws.send(
//             JSON.stringify({
//               type: "tts_audio",
//               audioBase64,
//               text: textReply,
//             })
//           );
//         } catch (e) {
//           console.error("❌ Gemma/TTS call failed:", e);
//           ws.send(
//             JSON.stringify({
//               type: "error",
//               message: `Gemma/TTS failed: ${e.message}`,
//             })
//           );
//         }
//       }

//       // -----------------------------
//       // ✅ DEEPGRAM LIVE STT Logic (remains the same)
//       // -----------------------------
//       if (data.type === "start_stt") {
//         if (!DEEPGRAM_API_KEY) {
//           ws.send(
//             JSON.stringify({
//               type: "stt_error",
//               message: "Deepgram API key not configured on server.",
//             })
//           );
//           return;
//         }

//         // Close any existing Deepgram connection before starting a new one
//         if (session.deepgramWs) {
//           session.deepgramWs.close(1000, "Restarting stream");
//           session.deepgramWs = null;
//         }

//         // 1. Construct the WSS URL with parameters
//         // const deepgramUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2&interim_results=true&endpointing=300`;
//         const deepgramUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2&interim_results=true&endpointing=300&language=hi`;

//         // 2. Open the WebSocket connection to Deepgram
//         const deepgramWs = new WebSocket(deepgramUrl, {
//           headers: {
//             Authorization: `Token ${DEEPGRAM_API_KEY}`,
//           },
//         });

//         // ... (Deepgram event handlers remain the same)
//         deepgramWs.on("open", () => {
//           session.deepgramWs = deepgramWs;
//           session.isStreamReady = true;
//           console.log(`✅ Deepgram Stream opened for ${sessionId}`);
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify({ type: "stt_started", sessionId }));
//           }
//         });

//         deepgramWs.on("message", (message) => {
//           const dgData = JSON.parse(message.toString());

//           if (
//             dgData.type === "Results" &&
//             dgData.channel?.alternatives?.length > 0
//           ) {
//             const transcript = dgData.channel.alternatives[0].transcript;
//             const isFinal = dgData.is_final;
//             // console.log("dgData", dgData);
//             const result = dgData.channel?.results?.[0]?.alternatives[0] || {};

//             if (transcript.trim() !== "" && ws.readyState === WebSocket.OPEN) {
//               ws.send(
//                 JSON.stringify({
//                   type: isFinal ? "final_transcript" : "interim_transcript",
//                   transcript: transcript,
//                   confidence: result.confidence,
//                 })
//               );
//             }

//             if (isFinal) {
//               console.log(`✅ Deepgram Final Result: "${transcript}"`);
//             } else if (dgData.type === "SpeechStarted") {
//               console.log(`[${sessionId}] Deepgram detected speech start.`);
//             }
//           }
//         });

//         deepgramWs.on("error", (err) => {
//           console.error(
//             `❌ Deepgram Stream Error for ${sessionId}: ${err.message}`
//           );
//           session.deepgramWs = null;
//           session.isStreamReady = false;
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send(
//               JSON.stringify({ type: "stt_error", message: err.message })
//             );
//           }
//         });

//         deepgramWs.on("close", (code, reason) => {
//           console.log(`Deepgram Stream closed (${code}): ${reason.toString()}`);
//           session.deepgramWs = null;
//           session.isStreamReady = false;
//         });
//       }

//       // --- Audio chunks from browser (base64 PCM16 mono) --- (remains the same)
//       if (data.type === "audio_chunk") {
//         if (
//           session.isStreamReady &&
//           session.deepgramWs?.readyState === WebSocket.OPEN
//         ) {
//           try {
//             // Send raw binary buffer directly to Deepgram WSS
//             const audioBuffer = Buffer.from(data.audioBase64, "base64");
//             session.deepgramWs.send(audioBuffer);
//             // console.log(`[${sessionId}] Sent audio chunk of size: ${audioBuffer.length}`);
//           } catch (e) {
//             console.error("❌ Failed to send chunk to Deepgram:", e.message);
//             // Optionally close the connection if a critical error occurs
//             if (session.deepgramWs)
//               session.deepgramWs.close(1011, "Chunk send failure");
//           }
//         }
//       }

//       // --- Stop/cleanup --- (remains the same)
//       if (data.type === "stop_stt") {
//         session.isStreamReady = false;
//         if (session.deepgramWs?.readyState === WebSocket.OPEN) {
//           // Signal to Deepgram that the audio stream is finished
//           session.deepgramWs.send(JSON.stringify({ type: "Finalize" }));
//           // Give Deepgram a moment to send the final result, then close
//           setTimeout(() => {
//             if (session.deepgramWs?.readyState === WebSocket.OPEN) {
//               session.deepgramWs.close(1000, "Manual client stop");
//             }
//             session.deepgramWs = null;
//           }, 500);
//           console.log(`✅ Deepgram Finalize sent for ${sessionId}`);
//         }
//       }
//     } catch (err) {
//       console.error("WebSocket message processing failed:", err);
//       if (ws.readyState === WebSocket.OPEN) {
//         ws.send(JSON.stringify({ type: "error", message: err.message }));
//       }
//     }
//   });

//   // ... (ws.on("close") logic remains the same)
//   ws.on("close", () => {
//     if (currentSessionId) {
//       const session = sessions.get(currentSessionId);
//       // Clean up the Deepgram connection on disconnect
//       if (session && session.deepgramWs?.readyState === WebSocket.OPEN) {
//         session.deepgramWs.close(1000, "Client disconnected");
//       }
//       sessions.delete(currentSessionId);
//       console.log(
//         `⚡ WS disconnected. Session ${currentSessionId} cleaned up.`
//       );
//     } else console.log("⚡ WS disconnected (No session tracked).");
//   });
// });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const WebSocket = require("ws");
const { ObjectId } = require("mongoose").Types;
const Interview = require("./models/Interview");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { SpeechClient } = require("@google-cloud/speech");
const { GoogleAuth } = require("google-auth-library");
const InterviewSession = require("./models/interviewSession.model"); // Now used for persistence

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
const sttClient = new SpeechClient();
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
const createInterview = require("./routes/interview.routes");
const app = express();
connectDB();

app.use(
  cors({
    origin: ["http://localhost:3000"], // your frontend URLs
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

wss.on("connection", (ws, req) => {
  // 1. EXTRACT SESSION ID FROM URL QUERY PARAMETER
  const connectionUrl = new URL(req.url, `http://localhost:8081`);
  const requestedSessionId = connectionUrl.searchParams.get("sessionId");

  if (!requestedSessionId) {
    console.error(
      "❌ Connection rejected: No sessionId provided in query parameter."
    );
    ws.close(1008, "Session ID required in URL query.");
    return;
  }

  // Set the current session ID based on the URL parameter
  let currentSessionId = requestedSessionId;

  // Use an async IIFE to handle the DB setup immediately upon connection
  (async () => {
    let session = sessions.get(currentSessionId);

    try {
      // 1. Load or Create DB Document (Upsert)
      const dbSession = await InterviewSession.findOneAndUpdate(
        { sessionId: currentSessionId },
        {
          // Set these values only if creating a new document (upsert)
          $setOnInsert: {
            sessionId: currentSessionId,
            history: [],
            nextQuestionIndex: 0,
            startTime: Date.now(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (!session) {
        // 2. Initialize new in-memory session from DB data
        session = {
          startTime: dbSession.startTime,
          deepgramWs: null,
          isStreamReady: false,
          deepgramStartTime: null, // Track when Deepgram connection was established
          deepgramRefreshTimer: null, // Timer for auto-refresh before 5min limit
          history: dbSession.history || [], // Load history from DB
          ws, // Store the current WebSocket connection
          nextQuestionIndex: dbSession.nextQuestionIndex || 0, // Load index from DB
          interviewDetails: null, // Will be fetched on the first tts_request
          dbDocId: dbSession._id, // Store DB document ID for easy updates
        };
        sessions.set(currentSessionId, session);
        console.log(
          `✅ WS client connected. Session ${currentSessionId} initialized (History size: ${session.history.length})`
        );
      } else {
        // 3. Update existing in-memory session with new WebSocket ref and latest DB data
        session.ws = ws;
        session.history = dbSession.history || [];
        session.nextQuestionIndex = dbSession.nextQuestionIndex || 0;
        session.dbDocId = dbSession._id;
        console.log(
          `✅ Reconnected client to existing session: ${currentSessionId}. History updated from DB.`
        );
      }
    } catch (error) {
      console.error(
        `❌ DB Error during session setup for ${currentSessionId}:`,
        error.message
      );
      ws.close(1011, "Internal server error during session setup.");
      return;
    }

    // Now that the session is initialized, set up the message listener
    ws.on("message", async (message) => {
      // Re-fetch session inside the message handler in case of concurrent access (good practice)
      const session = sessions.get(currentSessionId);
      if (!session) {
        console.error(
          `Session ${currentSessionId} not found during message processing.`
        );
        ws.close(1008, "Session not initialized.");
        return;
      }

      try {
        const data = JSON.parse(message.toString());
        const sessionId = data.sessionId || currentSessionId;
        // -------------------------------------------------------------------------------------------------
        // ✅ TTS Request (Gemma Call)
        // -------------------------------------------------------------------------------------------------
        if (data.type === "tts_request") {
          let prompt = data.prompt || "";

          // Retained: Fetch interview details if needed, still requires DB lookup
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
              generatedQuestions: interview.generatedQuestions || [],
              difficulty: interview.title.toLowerCase().includes("senior")
                ? "Advanced"
                : interview.difficulty || "Beginner",
            };
          }

          const jobTitle =
            session.interviewDetails?.title || "Software Engineer";
          let difficulty = session.interviewDetails?.difficulty || "Beginner";
          if (jobTitle.toLowerCase().includes("senior"))
            difficulty = "Advanced";
          const generatedQuestions =
            session.interviewDetails?.generatedQuestions || [];
          const currentIndex = session.nextQuestionIndex;
          console.log("currentIndex", currentIndex, generatedQuestions);
          let specificQuestionInstruction;

          if (
            generatedQuestions.length > 0 &&
            currentIndex < generatedQuestions.length
          ) {
            const nextQuestion = generatedQuestions[currentIndex];
            // This mandatory instruction overrides Rule #4 in the system prompt below.
            specificQuestionInstruction = `
***MANDATORY NEXT QUESTION:*** The candidate just responded. Your next turn MUST use the following question: "${nextQuestion}". You must **rephrase and formalize this question to be under 20 words** for the current turn.
`;
          } else if (
            generatedQuestions.length > 0 &&
            currentIndex >= generatedQuestions.length
          ) {
            specificQuestionInstruction = `You have used all pre-generated questions. Now, continue the interview by organically generating new, relevant questions based on the job title.`;
          } else {
            // No generated questions exist at all
            specificQuestionInstruction = `The pre-generated question list is empty. Continue the interview by organically generating new, relevant questions based on the job title.`;
          }
          console.log(
            "specificQuestionInstruction",
            specificQuestionInstruction
          );
          // --- 3. Modify System Instruction with the new logic ---
          const systemInstruction = `You are SIRI, a professional friendly AI interviewer for ${jobTitle} (${difficulty} level).

**CRITICAL RULES - NEVER BREAK:**
- MAX 15 words per response - BE EXTREMELY BRIEF
- Use natural, conversational language
- Ask ONE simple question at a time
- Acknowledge answers with 2-3 words (e.g., "Good.", "I see.", "Great!")
- NEVER explain, lecture, or give long context
- If candidate goes off-topic: "That's noted. Back to ${jobTitle}—[short question]?"

**QUESTION PRIORITY:**
${specificQuestionInstruction.trim()}

**YOUR STYLE:**
✓ "Tell me about yourself." (4 words)
✓ "Good. What's your experience with React?" (6 words)
✓ "Interesting. Describe a recent project you built." (7 words)
✗ WRONG: "That's great to hear! Now I'd like to learn more about your technical background and experience..." (NO! Too long!)

**FLOW:**
1st turn: "Hi! I'm SIRI. Tell me about yourself." (8 words)
After each answer: "[Brief acknowledgment]. [One short question]?"
Last turn: "Great job! Score: [X/25]. Thanks for your time!" (9 words)

KEEP IT CONVERSATIONAL, BRIEF, NATURAL. Like texting a friend.`;

          let messages = [
            { role: "system", content: systemInstruction },
            ...session.history,
          ];
          if (prompt.trim() !== "") {
            // Normal follow-up interaction
            messages.push({ role: "user", content: prompt });
          } else {
            // FIRST interaction
            session.history = []; // Always reset for first interaction
            await InterviewSession.findOneAndUpdate(
              { sessionId: currentSessionId },
              {
                history: [],
              }
            );
            // Note: History is already loaded from DB if exists.
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
            // ... (Google Auth/Gemma logic remains the same)
            const tempFilePath = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
            fs.writeFileSync(tempFilePath, process.env.GCP_CREDENTIALS_JSON);

            const auth = new GoogleAuth({
              keyFile: tempFilePath,
              scopes: "https://www.googleapis.com/auth/cloud-platform",
            });

            const accessToken = await auth.getAccessToken();

            const PROJECT_ID = process.env.GCP_PROJECT_ID;
            const ENDPOINT_ID = process.env.GCP_ENDPOINT_ID;
            const gemmaEndpoint = `https://${ENDPOINT_ID}.us-central1-${PROJECT_ID}.prediction.vertexai.goog/v1/projects/${PROJECT_ID}/locations/us-central1/endpoints/${ENDPOINT_ID}:predict`;
            const gemmaRequestBody = {
              instances: [
                {
                  "@requestFormat": "chatCompletions",
                  messages,
                  max_tokens: 30, // Reduced to enforce brevity (15 words max)
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
            const choices = gemmaResponse.data?.predictions?.choices;
            if (choices && choices[0]?.message?.content) {
              console.log(
                `Gemma response: ${choices[0].message.content.trim()}`
              );
              if (
                generatedQuestions.length > 0 &&
                currentIndex < generatedQuestions.length
              ) {
                session.nextQuestionIndex++;
                console.log(
                  `Incremented nextQuestionIndex to: ${session.nextQuestionIndex}`
                );
              }
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

            // ✅ UPDATE IN-MEMORY HISTORY
            session.history.push({ role: "user", content: prompt });
            session.history.push({ role: "assistant", content: textReply });

            // ✅ PERSIST HISTORY AND INDEX TO DATABASE
            try {
              await InterviewSession.findByIdAndUpdate(session.dbDocId, {
                history: session.history,
                nextQuestionIndex: session.nextQuestionIndex,
              });
              console.log(
                `DB: Updated history and index for session ${currentSessionId}`
              );
            } catch (e) {
              console.error(
                `❌ DB Update failed for session ${currentSessionId}:`,
                e.message
              );
            }

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
        // ✅ DEEPGRAM LIVE STT Logic (remains the same)
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

          // Clear existing refresh timer
          if (session.deepgramRefreshTimer) {
            clearTimeout(session.deepgramRefreshTimer);
            session.deepgramRefreshTimer = null;
          }

          // Helper function to create new Deepgram connection
          const createDeepgramConnection = () => {
            const deepgramUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=nova-2&interim_results=true&endpointing=4500&language=hi`;

            const deepgramWs = new WebSocket(deepgramUrl, {
              headers: {
                Authorization: `Token ${DEEPGRAM_API_KEY}`,
              },
            });

            deepgramWs.on("open", () => {
              session.deepgramWs = deepgramWs;
              session.isStreamReady = true;
              session.deepgramStartTime = Date.now();
              console.log(
                `✅ Deepgram Stream opened for ${sessionId} at ${new Date().toISOString()}`
              );

              // Set timer to refresh connection before 5-minute limit (refresh at 4.5 minutes)
              session.deepgramRefreshTimer = setTimeout(() => {
                console.log(
                  `🔄 Auto-refreshing Deepgram connection for ${sessionId} (approaching 5min limit)`
                );
                if (session.isStreamReady && session.deepgramWs) {
                  const oldWs = session.deepgramWs;
                  session.deepgramWs = null;
                  session.isStreamReady = false;

                  // Create new connection
                  createDeepgramConnection();

                  // Close old connection after brief delay
                  setTimeout(() => {
                    if (oldWs && oldWs.readyState === WebSocket.OPEN) {
                      oldWs.close(1000, "Refreshing for 5min limit");
                    }
                  }, 1000);
                }
              }, 270000); // 4.5 minutes = 270000ms

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
                const result =
                  dgData.channel?.results?.[0]?.alternatives[0] || {};

                if (
                  transcript.trim() !== "" &&
                  ws.readyState === WebSocket.OPEN
                ) {
                  ws.send(
                    JSON.stringify({
                      type: isFinal ? "final_transcript" : "interim_transcript",
                      transcript: transcript,
                      confidence: result.confidence,
                    })
                  );
                }

                if (isFinal) {
                  console.log(`✅ Deepgram Final Result: "${transcript}"`);
                } else if (dgData.type === "SpeechStarted") {
                  console.log(`[${sessionId}] Deepgram detected speech start.`);
                }
              }
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
              console.log(
                `Deepgram Stream closed (${code}): ${reason.toString()}`
              );
              session.deepgramWs = null;
              session.isStreamReady = false;
              // Clear refresh timer on close
              if (session.deepgramRefreshTimer) {
                clearTimeout(session.deepgramRefreshTimer);
                session.deepgramRefreshTimer = null;
              }
            });
          };

          // Initialize the first Deepgram connection
          createDeepgramConnection();
        }

        // --- Audio chunks from browser (base64 PCM16 mono) --- (remains the same)
        if (data.type === "audio_chunk") {
          if (
            session.isStreamReady &&
            session.deepgramWs?.readyState === WebSocket.OPEN
          ) {
            try {
              // Send raw binary buffer directly to Deepgram WSS
              const audioBuffer = Buffer.from(data.audioBase64, "base64");
              session.deepgramWs.send(audioBuffer);
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

          // Clear Deepgram refresh timer
          if (session.deepgramRefreshTimer) {
            clearTimeout(session.deepgramRefreshTimer);
            session.deepgramRefreshTimer = null;
          }

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

    // ... (ws.on("close") logic remains the same)
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
  })(); // End of async IIFE
});
