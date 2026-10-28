const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();
const { startRealtimeServer } = require("./realtime/bootstrap");

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
// (Express App Setup - Omitted for brevity, assume correct)
// -----------------------------
const connectDB = require("./config/database");
const errorHandler = require("./middlewares/errorHandler");
const createInterview = require("./routes/index");
const app = express();
connectDB();

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : false,
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
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
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
const realtime = startRealtimeServer({
  port: parseInt(process.env.WS_PORT || "8081", 10),
});

// Latency/error metrics. Disabled unless METRICS_TOKEN is set.
app.get("/api/metrics", (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (!token || req.get("authorization") !== `Bearer ${token}`) {
    return res.status(404).json({ success: false, message: "Route not found" });
  }
  res.json({ success: true, ...realtime.metrics.snapshot() });
});

app.use(errorHandler);
app.use("*", (req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
