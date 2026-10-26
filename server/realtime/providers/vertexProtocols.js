const { ProviderError } = require("../util");

/**
 * Request/response shapes for the two ways the server can reach Vertex AI.
 * Each protocol is `{ url(config), body(messages, config), extractText(data) }`;
 * transport, retries and timeouts live in vertexChat.js.
 */

// ---- Dedicated (self-deployed) endpoint, chatCompletions format -------------

/** Accepts both documented Vertex chatCompletions response shapes. */
function extractChatCompletionsText(data) {
  const p = data?.predictions;
  const choices = p?.choices ?? p?.[0]?.choices ?? data?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

const dedicatedEndpointProtocol = {
  url({ projectNumber, endpointId, location }) {
    if (!projectNumber || !endpointId) {
      throw new ProviderError("LLM_CONFIG", "VERTEX_PROJECT_NUMBER and VERTEX_ENDPOINT_ID must be set");
    }
    return (
      `https://${endpointId}.${location}-${projectNumber}.prediction.vertexai.goog` +
      `/v1/projects/${projectNumber}/locations/${location}/endpoints/${endpointId}:predict`
    );
  },
  body(messages, { maxTokens, temperature, topP }) {
    return {
      instances: [{ "@requestFormat": "chatCompletions", messages, max_tokens: maxTokens, temperature, top_p: topP }],
    };
  },
  extractText: extractChatCompletionsText,
};

// ---- Serverless Gemini (publisher model), generateContent -------------------

/** Merges consecutive same-role turns so the conversation strictly alternates. */
function toGeminiContents(messages) {
  const contents = [];
  for (const { role, content } of messages) {
    if (role === "system") continue;
    const geminiRole = role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === geminiRole) last.parts[0].text += `\n\n${content}`;
    else contents.push({ role: geminiRole, parts: [{ text: content }] });
  }
  return contents;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => typeof part?.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

const geminiProtocol = {
  url({ projectNumber, model, location }) {
    if (!projectNumber || !model) {
      throw new ProviderError("LLM_CONFIG", "VERTEX_PROJECT_NUMBER and VERTEX_MODEL must be set");
    }
    const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
    return (
      `https://${host}/v1/projects/${projectNumber}/locations/${location}` +
      `/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    );
  },
  body(messages, { maxTokens, temperature, topP }, { json = false } = {}) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    return {
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        topP,
        ...(json && { responseMimeType: "application/json" }),
      },
    };
  },
  extractText: extractGeminiText,
};

/** A configured `model` selects serverless Gemini; otherwise the dedicated endpoint is used. */
function selectVertexProtocol(config) {
  return config.model ? geminiProtocol : dedicatedEndpointProtocol;
}

module.exports = {
  dedicatedEndpointProtocol,
  geminiProtocol,
  selectVertexProtocol,
  extractChatCompletionsText,
  extractGeminiText,
  toGeminiContents,
};
