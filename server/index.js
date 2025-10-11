// const express = require("express");
// const cors = require("cors");
// const helmet = require("helmet");
// const compression = require("compression");
// const morgan = require("morgan");
// const rateLimit = require("express-rate-limit");
// const xss = require("xss-clean");
// const cookieParser = require("cookie-parser");
// const axios = require("axios");

// const WebSocket = require("ws");
// const { ObjectId } = require("mongoose").Types;
// const Interview = require("./models/Interview");

// const fs = require("fs");
// const path = require("path");
// const os = require("os");
// require("dotenv").config();

// const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
// const { SpeechClient } = require("@google-cloud/speech");
// const { GoogleGenAI } = require("@google/genai");

// const connectDB = require("./config/database");
// const errorHandler = require("./middlewares/errorHandler");
// const createInterview = require("./routes/index");
// const { PredictionServiceClient } = require("@google-cloud/aiplatform").v1;
// const aiClient = new PredictionServiceClient();

// const app = express();

// function setupGcpCredentials() {
//   const credsJson = process.env.GCP_CREDENTIALS_JSON;
//   if (!credsJson) {
//     console.warn(
//       "⚠️ GCP_CREDENTIALS_JSON environment variable not set. Using default credentials or gcloud auth."
//     );
//     return;
//   }
//   try {
//     const tempDir = os.tmpdir();
//     const tempFilePath = path.join(tempDir, "gcp-sa-key-temp.json");
//     fs.writeFileSync(tempFilePath, credsJson);
//     process.env.GOOGLE_APPLICATION_CREDENTIALS = tempFilePath;
//     console.log(`✅ GCP credentials set: ${tempFilePath}`);
//   } catch (err) {
//     console.error("❌ Failed to set GCP credentials:", err);
//   }
// }

// setupGcpCredentials();
// connectDB();

// app.use(
//   cors({
//     origin: [
//       /* ... whitelisted origins ... */
//     ],
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
//     allowedHeaders: [
//       /* ... */
//     ],
//     exposedHeaders: ["Content-Range", "X-Content-Range"],
//     maxAge: 86400,
//   })
// );
// app.use(helmet());
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000,
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS),
//   message: "Too many requests from this IP, please try again later.",
// });
// app.use("/api/", limiter);

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
//     message: "EarlyJobs API is running",
//     timestamp: new Date().toISOString(),
//   });
// });
// app.use(errorHandler);
// app.use("*", (req, res) => {
//   res.status(404).json({ success: false, message: "Route not found" });
// });
// const PORT = process.env.PORT || 5001;
// const server = app.listen(PORT, () => {
//   console.log(`🚀 EarlyJobs server running on port ${PORT}`);
// });

// // ---------------------------------------------
// // Google Cloud Clients
// // ---------------------------------------------
// const sttClient = new SpeechClient();
// const ttsClient = new TextToSpeechClient();
// const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// const sessions = new Map();

// // ---------------------------------------------
// // WebSocket Server
// // ---------------------------------------------
// const wss = new WebSocket.Server({ port: 8081 });

// wss.on("connection", (ws) => {
//   console.log("✅ WebSocket client connected");
//   let currentSessionId = null;

//   ws.on("message", async (message) => {
//     try {
//       const data = JSON.parse(message.toString());
//       const sessionId = data.sessionId || `session_${Date.now()}`;

//       let session = sessions.get(sessionId);
//       if (!session) {
//         session = {
//           startTime: Date.now(),
//           recognizeStream: null,
//           isStreamReady: false,
//           history: [],
//           ws: ws,
//           interviewDetails: null,
//         };
//         sessions.set(sessionId, session);
//         currentSessionId = sessionId;
//         console.log(`New session created for sessionId: ${sessionId}`);
//       }

//       // --- STT LOGIC (unchanged) ---
//       if (data.type === "start_stt") {
//         if (session.recognizeStream) {
//           try {
//             session.recognizeStream.end();
//           } catch (e) {}
//           session.recognizeStream = null;
//         }
//         session.isStreamReady = false;

//         try {
//           const request = {
//             config: {
//               encoding: "LINEAR16",
//               sampleRateHertz: 16000,
//               languageCode: "en-US",
//               enableAutomaticPunctuation: true,
//             },
//             interimResults: true,
//           };
//           session.recognizeStream = sttClient
//             .streamingRecognize(request)
//             .on("error", (err) => {
//               console.error(`STT stream error for ${sessionId}:`, err.message);
//               if (ws.readyState === WebSocket.OPEN) {
//                 ws.send(
//                   JSON.stringify({
//                     type: "stt_error",
//                     message: err.message,
//                     sessionId,
//                   })
//                 );
//               }
//               session.recognizeStream = null;
//               session.isStreamReady = false;
//             })
//             .on("data", (data) => {
//               if (
//                 data.results &&
//                 data.results[0] &&
//                 data.results[0].alternatives &&
//                 data.results[0].alternatives[0]
//               ) {
//                 const transcript = data.results[0].alternatives[0].transcript;
//                 const type = data.results[0].isFinal
//                   ? "final_transcript"
//                   : "interim_transcript";

//                 console.log(`Transcription (${type}): ${transcript}`);

//                 if (ws.readyState === WebSocket.OPEN) {
//                   ws.send(JSON.stringify({ type, transcript }));
//                 }
//               }
//             });

//           session.isStreamReady = true;
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify({ type: "stt_started", sessionId }));
//             console.log(
//               `STT stream ready and 'stt_started' sent for ${sessionId}`
//             );
//           }
//         } catch (err) {
//           console.error(`Failed to start STT stream for ${sessionId}:`, err);
//           session.recognizeStream = null;
//           session.isStreamReady = false;
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send(
//               JSON.stringify({
//                 type: "error",
//                 message: `Failed to start STT: ${err.message}`,
//                 sessionId,
//               })
//             );
//           }
//         }
//       }

//       // --- TTS + AI AGENT LOGIC ---
//       if (data.type === "tts_request") {
//         let prompt = data.prompt || "";

//         // Interview context lookup...
//         if (data.interviewId && !ObjectId.isValid(data.interviewId)) {
//           ws.send(
//             JSON.stringify({ type: "error", message: "Invalid interviewId" })
//           );
//           return;
//         }

//         if (!session.interviewDetails && data.interviewId) {
//           const interview = await Interview.findById(data.interviewId).lean();
//           if (!interview) {
//             ws.send(
//               JSON.stringify({ type: "error", message: "Interview not found" })
//             );
//             return;
//           }
//           session.interviewDetails = {
//             title: interview.title || "Software Engineer",
//             description: interview.description || "No description available.",
//             difficulty: interview.title.toLowerCase().includes("senior")
//               ? "Advanced"
//               : interview.difficulty || "Beginner",
//           };
//         }

//         const jobTitle = session.interviewDetails?.title || "Software Engineer";
//         const jobDescription =
//           session.interviewDetails?.description || "No description available.";
//         let difficulty = session.interviewDetails?.difficulty || "Beginner";
//         if (jobTitle.toLowerCase().includes("senior")) difficulty = "Advanced";

//         let promptToSend;
//         if (prompt.trim() === "") {
//           promptToSend = `Hi, My name is SIRI. I am your interviewer for the ${jobTitle} position.
// Let's begin the interview. ${jobDescription ? "Here is the JD: " + jobDescription : ""}
// First question: Can you briefly introduce yourself and share your experience relevant to the ${jobTitle} role?`;
//           session.history = [];
//         } else {
//           promptToSend = `Thank you for your answer: "${prompt}". Next, as your interviewer, ask a new question strictly related to the skills, experience, or tasks for ${jobTitle} (${difficulty}). Base the question on the JD when possible, and don't repeat earlier questions.`;
//         }

//         // Vertex AI Gemma call
//         let textReply = "Let's continue with the next technical question.";
//         try {
//           const modelEndpoint =
//             "projects/earlyjobs-20/locations/us-central1/publishers/google/models/gemma-3-12b";
//           // usually "projects/xxx/locations/xxx/publishers/google/models/gemma-2b"
//           const instance = { content: `${promptToSend}` };
//           const parameters = { temperature: 0.7, maxOutputTokens: 100 };
//           const request = {
//             endpoint: modelEndpoint,
//             instances: [instance],
//             parameters,
//           };

//           const [aiResponse] = await aiClient.predict(request);
//           if (
//             aiResponse &&
//             aiResponse.predictions &&
//             aiResponse.predictions[0] &&
//             aiResponse.predictions[0].content
//           ) {
//             textReply = aiResponse.predictions[0].content.trim();
//           }
//         } catch (e) {
//           console.error("Vertex Gemma call failed:", e.message);
//         }

//         textReply = textReply.replace(
//           /(Great answer!|Interesting|Well done)[\s,.-]*/gi,
//           ""
//         );

//         session.history.push(
//           { role: "user", parts: [{ text: promptToSend }] },
//           { role: "model", parts: [{ text: textReply }] }
//         );

//         // TTS block (unchanged)
//         try {
//           const [ttsResponse] = await ttsClient.synthesizeSpeech({
//             input: { text: textReply },
//             voice: { languageCode: "en-US", name: "en-US-Standard-C" },
//             audioConfig: { audioEncoding: "MP3" },
//           });
//           const audioBase64 = Buffer.from(ttsResponse.audioContent).toString(
//             "base64"
//           );
//           ws.send(
//             JSON.stringify({ type: "tts_audio", audioBase64, text: textReply })
//           );
//         } catch (e) {
//           ws.send(
//             JSON.stringify({
//               type: "error",
//               message: `Text-to-speech failed: ${e.message}`,
//             })
//           );
//         }
//       }
//       // --- AUDIO CHUNK for STT (unchanged) ---
//       if (data.type === "audio_chunk") {
//         if (!session || !data.audioBase64) {
//           console.warn("audio_chunk with missing session/data");
//           return;
//         }

//         const audioBuffer = Buffer.from(data.audioBase64, "base64");
//         if (session.recognizeStream && session.isStreamReady) {
//           if (audioBuffer.length === 0) {
//             console.warn(`[${sessionId}] Received empty audio buffer, dropped`);
//             return;
//           }
//           session.recognizeStream.write(audioBuffer);
//         } else {
//           console.warn(
//             `[${sessionId}] Dropped audio chunk: STT stream not ready.`
//           );
//         }
//       }

//       if (data.type === "stop_stt") {
//         if (session && session.recognizeStream) {
//           try {
//             session.recognizeStream.end();
//           } catch (e) {}
//           console.log(`STT stream manually stopped for session ${sessionId}`);
//         }
//       }
//     } catch (err) {
//       const errorMessage = err.message || "Unknown error occurred.";
//       console.error("WebSocket error:", errorMessage, err);
//       if (ws.readyState === WebSocket.OPEN) {
//         ws.send(
//           JSON.stringify({
//             type: "error",
//             message: `Server error: ${errorMessage}`,
//           })
//         );
//       }
//     }
//   });

//   ws.on("close", () => {
//     if (currentSessionId) {
//       const session = sessions.get(currentSessionId);
//       if (session && session.recognizeStream) {
//         try {
//           session.recognizeStream.end();
//         } catch (e) {}
//         sessions.delete(currentSessionId);
//         console.log(
//           `⚡ WS disconnected. Session ${currentSessionId} cleaned up.`
//         );
//       }
//     } else {
//       console.log("⚡ WS disconnected (No session ID tracked).");
//     }
//   });
// });

// wss.on("listening", () => {
//   console.log(`🌐 WebSocket server running on port 8081`);
// });

// module.exports = wss;
// ---------------------------------------------
// ✅ Imports & Setup
// ---------------------------------------------

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
const InterviewSession = require("./models/interviewSession.model");

// -----------------------------
// ✅ GCP Credentials Setup
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
// ✅ Google Clients
// -----------------------------
const sttClient = new SpeechClient();
const ttsClient = new TextToSpeechClient();

// -----------------------------
// ✅ Express App Setup
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

async function validateOrCreateSession(
  sessionId,
  clientExpiresAt,
  interviewId
) {
  const now = new Date();

  // Check if session exists in DB
  let dbSession = await InterviewSession.findOne({ sessionId }).lean();

  if (dbSession) {
    // Check if session is expired
    if (dbSession.expiresAt < now) {
      console.log(`Session ${sessionId} expired, will create new`);
      // Mark as expired - we'll create a new one
      dbSession = null;
    } else {
      return {
        isValid: true,
        isNew: false,
        session: dbSession,
      };
    }
  }

  // Create new session (either doesn't exist or was expired)
  const expiresAt = clientExpiresAt
    ? new Date(clientExpiresAt)
    : new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  const newSession = await InterviewSession.create({
    sessionId,
    history: [],
    interviewId,
    interviewDetails: null,
    created: now,
    lastUpdated: now,
    expiresAt,
  });

  console.log(`New session created: ${sessionId}, expires: ${expiresAt}`);
  return {
    isValid: true,
    isNew: true,
    session: newSession,
  };
}
wss.on("connection", (ws) => {
  console.log("✅ WS client connected");
  let currentSessionId = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { sessionId: clientSessionId, expiresAt: clientExpiresAt } = data;
      let sessionId = clientSessionId || `session_${Date.now()}`;

      // -- 1. Validate or create MongoDB session (with expiry) --
      const sessionResult = await validateOrCreateSession(
        sessionId,
        clientExpiresAt,
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
          recognizeStream: null,
          isStreamReady: false,
          history: sessionResult.session.history || [],
          ws,
          interviewDetails: sessionResult.session.interviewDetails || null,
          expiresAt: sessionResult.session.expiresAt,
        };
        sessions.set(sessionId, session);
        currentSessionId = sessionId;
        console.log(
          sessionResult.isNew
            ? `New session created: ${sessionId}`
            : `Resumed session: ${sessionId}`
        );
      }

      // -- 3. TTS + Vertex AI (only changed for reply extraction & history update) --
      if (data.type === "tts_request") {
        let prompt = data.prompt || "";
        if (data.interviewId && !session.interviewDetails) {
          if (!ObjectId.isValid(data.interviewId)) {
            ws.send(
              JSON.stringify({ type: "error", message: "Invalid interviewId" })
            );
            return;
          }
          const interview = await Interview.findById(data.interviewId).lean();
          if (!interview) {
            ws.send(
              JSON.stringify({ type: "error", message: "Interview not found" })
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

        const systemInstruction = `
You are a professional HR/technical interviewer named SIRI.
- Always give short, clear, and concise responses.
- Keep every question or statement under 20 words.
- On the FIRST interaction, greet the candidate and ask them to introduce themselves.
- If the candidate gives a very short, unclear, or incomplete response, politely motivate them to give a full introduction. For example:
  - "Could you tell me a bit more about your background and experience?"
  - "Take your time — I’d love to hear about your skills and what excites you about this role."
- Only proceed to technical questions once the candidate gives a proper introduction.
- From the second question onwards, ask one technical or experience-based question.
- Never repeat questions.
- Don't answer the Questions
- Never break character as the interviewer.
Job Title: ${jobTitle}
Difficulty: ${difficulty}`;

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
          const tempFilePath = path.join(os.tmpdir(), "gcp-sa-key-temp.json");
          fs.writeFileSync(tempFilePath, process.env.GCP_CREDENTIALS_JSON);

          const auth = new GoogleAuth({
            keyFile: tempFilePath,
            scopes: "https://www.googleapis.com/auth/cloud-platform",
          });

          const accessToken = await auth.getAccessToken();

          const PROJECT_ID = process.env.GCP_PROJECT_ID;
          const ENDPOINT_ID = process.env.GCP_ENDPOINT_ID;
          const gemmaEndpoint = `https://${ENDPOINT_ID}.us-central1-949170828684.prediction.vertexai.goog/v1/projects/${PROJECT_ID}/locations/us-central1/endpoints/${ENDPOINT_ID}:predict`;
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
            JSON.stringify({ type: "tts_audio", audioBase64, text: textReply })
          );

          // -- STT, audio_chunk, stop_stt logic: unchanged --
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
      // ✅ STT logic with minor logging/optimization
      // -----------------------------
      if (data.type === "start_stt") {
        if (session.recognizeStream) {
          try {
            session.recognizeStream.end();
          } catch (e) {}
          session.recognizeStream = null;
        }
        session.isStreamReady = false;

        const maxRetries = 3;
        let retryCount = 0;

        const startSTTStream = () => {
          try {
            const request = {
              config: {
                encoding: "LINEAR16",
                sampleRateHertz: 16000,
                languageCode: "en-US",
                enableAutomaticPunctuation: true,
                enableVoiceActivityEvents: true,
                // model: "command_and_search", // Better for short, technical phrases
                model: "latest_long",

                speechContexts: [
                  {
                    phrases: [
                      "MERN stack",
                      "MERN stack developer",
                      "full stack developer",
                      "React",
                      "Node.js",
                      "Express",
                      "MongoDB",
                      "software engineer",
                      "technical interview",
                      "coding",
                      "JavaScript",
                      "web development",
                    ],
                    boost: 15.0, // Higher boost for technical terms
                  },
                ],
              },
              interimResults: true,
              singleUtterance: false,
            };
            const streamStartTime = Date.now();
            session.recognizeStream = sttClient
              .streamingRecognize(request)
              .on("error", (err) => {
                console.error(
                  `STT stream error for ${sessionId}: ${err.message}`
                );
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "stt_error",
                      message: err.message,
                      sessionId,
                    })
                  );
                }
                session.recognizeStream = null;
                session.isStreamReady = false;
                if (err.code === 14 && retryCount < maxRetries) {
                  retryCount++;
                  console.log(
                    `Retrying STT stream (${retryCount}/${maxRetries}) for ${sessionId}`
                  );
                  setTimeout(startSTTStream, 2000 * retryCount);
                }
              })
              .on("data", (data) => {
                const timeSinceStart = Date.now() - streamStartTime;
                console.log(
                  `STT data received after ${timeSinceStart}ms:`,
                  JSON.stringify(data, null, 2)
                );
                if (
                  data.results &&
                  data.results[0] &&
                  data.results[0].alternatives &&
                  data.results[0].alternatives[0]
                ) {
                  const transcript = data.results[0].alternatives[0].transcript;
                  const type = data.results[0].isFinal
                    ? "final_transcript"
                    : "interim_transcript";

                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type, transcript }));
                  } // 🔥 CRITICAL EOU LOGIC: If a final transcript is received, trigger LLM response.

                  if (data.results[0].isFinal) {
                    if (session.recognizeStream) {
                      // Stream is already ending due to singleUtterance:true, but manual cleanup is safer.
                      try {
                        session.recognizeStream.end();
                      } catch (e) {}
                    }
                    session.recognizeStream = null;
                    session.isStreamReady = false;
                    console.log(
                      `[${sessionId}] Final transcript received. Triggering LLM response.`
                    ); // 1. Simulate a new "tts_request" message to trigger the LLM/TTS logic
                    ws.emit(
                      "message",
                      JSON.stringify({
                        type: "tts_request",
                        sessionId: sessionId,
                        prompt: transcript, // Use the detected speech as the prompt
                      })
                    );
                  }
                } // REMOVE END_OF_SINGLE_UTTERANCE handler block as it's redundant with singleUtterance:true
              });

            session.isStreamReady = true;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "stt_started", sessionId }));
              console.log(
                `STT stream ready after ${Date.now() - streamStartTime}ms for ${sessionId}`
              );
            }
          } catch (err) {
            console.error(`Failed to start STT stream for ${sessionId}:`, err);
            session.recognizeStream = null;
            session.isStreamReady = false;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Failed to start STT: ${err.message}`,
                  sessionId,
                })
              );
            }
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(
                `Retrying STT stream (${retryCount}/${maxRetries}) for ${sessionId}`
              );
              setTimeout(startSTTStream, 2000 * retryCount);
            }
          }
        };

        startSTTStream();
      }

      if (data.type === "audio_chunk") {
        if (!session || !data.audioBase64) {
          console.warn("audio_chunk with missing session/data");
          return;
        }

        const audioBuffer = Buffer.from(data.audioBase64, "base64");
        const chunkReceiveTime = Date.now();
        if (audioBuffer.length < 512) {
          console.warn(
            `[${sessionId}] Small audio chunk received (size: ${audioBuffer.length}) at ${chunkReceiveTime}ms`
          );
        } else if (audioBuffer.length > 10240) {
          console.warn(
            `[${sessionId}] Large audio chunk received (size: ${audioBuffer.length}) at ${chunkReceiveTime}ms`
          );
        }
        if (audioBuffer.length === 0) {
          console.warn(`[${sessionId}] Received empty audio buffer, dropped`);
          return;
        }
        if (session.recognizeStream && session.isStreamReady) {
          session.recognizeStream.write(audioBuffer);
          console.log(
            `[${sessionId}] Audio chunk written to stream (size: ${audioBuffer.length}) at ${chunkReceiveTime}ms`
          );
        } else {
          console.warn(
            `[${sessionId}] Dropped audio chunk: STT stream not ready at ${chunkReceiveTime}ms`
          );
        }
      }
      if (data.type === "stop_stt") {
        if (session && session.recognizeStream) {
          try {
            session.recognizeStream.end();
          } catch (e) {}
          console.log(`STT stream manually stopped for session ${sessionId}`);
        }
      }
    } catch (err) {
      console.error("WebSocket error:", err.message, err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Server error: ${err.message}`,
          })
        );
      }
    }
  });

  ws.on("close", () => {
    if (currentSessionId) {
      const session = sessions.get(currentSessionId);
      if (session && session.recognizeStream) {
        try {
          session.recognizeStream.end();
        } catch (e) {}
      }
      sessions.delete(currentSessionId);
      console.log(
        `⚡ WS disconnected. Session ${currentSessionId} cleaned up.`
      );
    } else console.log("⚡ WS disconnected (No session tracked).");
  });
});
