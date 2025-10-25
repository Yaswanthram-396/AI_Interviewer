const mongoose = require("mongoose");
const Interview = require("../models/Interview");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const interviewSessionModel = require("../models/interviewSession.model");
const { GoogleAuth } = require("google-auth-library");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const os = require("os");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const crypto = require("crypto");

const createInterview = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const {
      title,
      description,
      difficulty,
      generatedQuestions,
      interviewDate,
      interviewTime,
    } = req.body;
    if (
      !title ||
      !interviewDate ||
      !interviewTime ||
      !difficulty ||
      !generatedQuestions
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    const newInterview = new Interview({
      // assessmentId: mongoose.Types.ObjectId(assessmentId),
      title,
      description,
      difficulty,
      generatedQuestions,
      interviewDate,
      interviewTime,
    });
    await newInterview.save();
    res.status(201).json({
      success: true,
      message: "Interview created successfully",
      interview: newInterview,
    });
  } catch (error) {
    console.error("Error creating interview:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
const getInterviews = async (req, res) => {
  try {
    const interviews = await Interview.find();
    res.status(200).json({ success: true, interviews });
  } catch (error) {
    console.error("Error fetching interviews:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * POST /api/interviews/generate-questions
 * Body: { title, description, difficulty }
 */
const generateInterviewQuestions = async (req, res) => {
  const { title, description, difficulty } = req.body;

  if (!title || !difficulty || !description) {
    return res
      .status(400)
      .json({ error: "Title, description and difficulty are required" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = `
      Generate 10 high-quality technical interview questions for the topic:
      - Title: ${title}
      - Description: ${description}
      - Difficulty: ${difficulty}

      The questions should be:
      - Relevant to the topic
      - Clearly phrased
      - Increasing in difficulty
      - Each question on a new line
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();

    // Extract the text from the first candidate
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Split into individual questions and clean numbering
    const questions = text
      .split("\n")
      .map((q) => q.replace(/^\d+\.\s*/, "").trim())
      .filter((q) => q.length > 0)
      .slice(0, 10); // ensure max 10 questions

    res.json({ questions });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).json({ error: "Failed to generate interview questions" });
  }
};

const generateInterviewResults = async (req, res) => {
  const { sessionId } = req.query;

  try {
    // Fetch session from the database
    const session = await interviewSessionModel.findOne({ sessionId });
    if (!session || !session.history) {
      return res.status(404).json({ error: "Session or history not found" });
    }

    // Fetch interview details
    const interviewDetails = await Interview.findById(session.interviewId);
    if (!interviewDetails) {
      return res.status(404).json({ error: "Interview details not found" });
    }
    const requiredJsonFormat = `{
  "overallPerformanceSummary": "A comprehensive 2-3 sentence summary of the candidate's overall performance, suitability for the role, and hiring recommendation.",
  "strengths": ["List 4-6 specific, actionable strengths demonstrated by the candidate with concrete examples from the conversation."],
  "weaknesses": ["List 3-5 specific areas where the candidate could improve, phrased constructively."],
  "skillRatings": [
    {
      "skill": "Technical Knowledge",
      "rating": "X/5",
      "conclusion": "Detailed assessment of technical depth and accuracy."
    },
    {
      "skill": "Problem Solving",
      "rating": "X/5",
      "conclusion": "Evaluation of analytical thinking and approach to challenges."
    },
    {
      "skill": "Communication",
      "rating": "X/5",
      "conclusion": "Assessment of clarity, articulation, and ability to explain concepts."
    },
    {
      "skill": "Domain Expertise",
      "rating": "X/5",
      "conclusion": "Evaluation of specific knowledge relevant to ${interviewDetails.title}."
    },
    {
      "skill": "Practical Experience",
      "rating": "X/5",
      "conclusion": "Assessment of hands-on experience and real-world application."
    }
  ]
}`;
    // Construct analysis prompt
    const analysisPrompt = `
You are an expert technical interviewer and HR professional evaluating candidates for ${interviewDetails.title} positions.

**Task:** Analyze the following interview transcript comprehensively and provide a detailed assessment.

**Interview Context:**
- Position: ${interviewDetails.title}
- Difficulty Level: ${interviewDetails.difficulty}
- Assessment Focus: Technical competency, communication skills, problem-solving ability, and cultural fit

**Evaluation Criteria:**
1. **Technical Knowledge (X/5)**: Depth of understanding, accuracy of responses, technical terminology usage
2. **Problem Solving (X/5)**: Analytical thinking, approach to challenges, solution quality
3. **Communication (X/5)**: Clarity, articulation, ability to explain complex concepts
4. **Domain Expertise (X/5)**: Specific knowledge relevant to the role
5. **Practical Experience (X/5)**: Hands-on experience, real-world application examples

**Rating Scale:**
- 5/5: Exceptional - Exceeds expectations significantly
- 4/5: Strong - Meets and exceeds most expectations
- 3/5: Satisfactory - Meets basic expectations
- 2/5: Needs Improvement - Below expectations
- 1/5: Weak - Significantly below expectations

**Output Requirements:**
- Provide ONLY a valid JSON object following the structure below
- Be specific and reference actual examples from the conversation
- Keep strengths and weaknesses balanced and constructive
- Ensure the overall summary is actionable for hiring decisions
- NO text outside the JSON object

**Required JSON Structure:**
${requiredJsonFormat}
`;

    // Format transcript
    const transcript = session.history
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n");

    const messages = [
      {
        role: "user",
        content: `${analysisPrompt}\n\nTranscript:\n${transcript}`,
      },
    ];

    // Auth to GCP
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
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.8,
        },
      ],
    };

    const gemmaResponse = await axios.post(gemmaEndpoint, gemmaRequestBody, {
      headers: {
        Authorization: `Bearer ${accessToken.token || accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Cleanup temp file
    fs.unlinkSync(tempFilePath);
    let rawAnalysisText;
    try {
      rawAnalysisText =
        gemmaResponse.data.predictions.choices[0].message.content;
    } catch {
      rawAnalysisText =
        gemmaResponse.data.predictions[0].candidates[0].content.parts[0].text;
    }
    // **Crucially: Find and parse the JSON object**
    // Use regex to find the first complete JSON object and attempt to parse it.
    const jsonMatch = rawAnalysisText.match(/\{[\s\S]*\}/);
    let analysisJson = {};
    console.log("rawAnalysisText", rawAnalysisText);
    if (jsonMatch) {
      try {
        // Remove potential surrounding markdown (like ```json ... ```)
        const cleanJsonString = jsonMatch[0].replace(/```json|```/g, "").trim();
        analysisJson = JSON.parse(cleanJsonString);
      } catch (e) {
        console.error("Failed to parse JSON output from Gemma:", e);
        // Fallback for parsing failure
        return res.status(500).json({ error: "LLM returned invalid JSON" });
      }
    } else {
      console.error(
        "Gemma response did not contain a recognizable JSON object."
      );
      return res
        .status(500)
        .json({ error: "LLM did not return structured data" });
    }

    // Construct the final JSON response for the frontend
    res.json({
      interviewDetails: {
        title: interviewDetails.title,
        description: interviewDetails.description,
        difficulty: interviewDetails.difficulty,
      },
      analysis: {
        // Store the raw text or the stringified JSON for debugging/display
        fullAnalysis: JSON.stringify(analysisJson, null, 2),
        performance: analysisJson.overallPerformanceSummary || "Not provided",
        results: analysisJson.skillRatings || [], // Use the new array field
        strengths: analysisJson.strengths || [],
        weaknesses: analysisJson.weaknesses || [],
      },
    });
  } catch (error) {
    // Extract AI analysis response
    console.error("Error generating interview results:", error);
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (cleanupError) {
      console.error("Error cleaning up temporary file:", cleanupError);
    }
    res.status(500).json({ error: "Failed to generate interview results" });
  }
};

// app.post("/api/session/create",
const createSession = async (req, res) => {
  try {
    // Generate a cryptographically secure, unique session ID
    const sessionId = crypto.randomUUID();

    // Calculate the expiration time (30 minutes from now)
    const expirationDate = new Date();
    const SESSION_EXPIRY_MINUTES = 30;
    expirationDate.setMinutes(
      expirationDate.getMinutes() + SESSION_EXPIRY_MINUTES
    );

    // Optional: Destructure and sanitize interview details from request body
    const { interviewDetails, interviewId } = req.body;

    const newSession = new interviewSessionModel({
      sessionId: sessionId,
      interviewDetails: interviewDetails || {
        title: "New Interview",
        description: "No description provided.",
        difficulty: "N/A",
      },
      interviewId: interviewId || null,
      history: [], // Start with an empty chat history
      expiresAt: expirationDate,
    });

    await newSession.save();

    res.status(201).json({
      message: "Session created successfully.",
      sessionId: sessionId,
      expiresAt: newSession.expiresAt,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    // Check for duplicate key error (unlikely with UUID but good practice)
    if (error.code === 11000) {
      return res.status(500).json({
        message: "Failed to generate unique session ID. Please try again.",
      });
    }
    res
      .status(500)
      .json({ message: "Internal server error during session creation." });
  }
};

/**
 * GET /api/session/validate/:sessionId
 * Validates a given sessionId.
 * Returns 200 if valid, 404 or 410 if not found or expired.
 */
// app.get("/api/session/validate/:sessionId",
const validateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res
        .status(400)
        .json({ message: "Session ID parameter is required." });
    }

    // Find the session. The 'expiresAt' TTL index on MongoDB handles soft deletion,
    // but we still check the expiry date explicitly as a safeguard.
    const session = await interviewSessionModel.findOne({ sessionId });

    if (!session) {
      // If the document was not found, it's either invalid or already deleted by TTL
      return res
        .status(404)
        .json({ message: "Session ID not found or has expired." });
    }

    // Explicitly check expiry date (redundant if TTL is set up correctly, but safer)
    if (session.expiresAt && session.expiresAt < new Date()) {
      // Invalidate the session immediately if it somehow bypassed TTL cleanup
      await interviewSessionModel.deleteOne({ _id: session._id });
      return res
        .status(410)
        .json({ message: "Session has expired and been deleted." }); // 410 Gone
    }

    // Session is valid
    res.status(200).json({
      message: "Session is valid.",
      sessionId: session.sessionId,
      interviewDetails: session.interviewDetails,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Error validating session:", error);
    res
      .status(500)
      .json({ message: "Internal server error during session validation." });
  }
};

module.exports = {
  createInterview,
  getInterviews,
  generateInterviewQuestions,
  generateInterviewResults,
  createSession,
  validateSession,
};
