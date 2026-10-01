const axios = require("axios");
const { ProviderError, withRetry } = require("../util");

/** Accepts both documented Vertex chatCompletions response shapes. */
function extractText(data) {
  const p = data?.predictions;
  const choices = p?.choices ?? p?.[0]?.choices ?? data?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function classify(e) {
  if (e instanceof ProviderError) return e;
  if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return new ProviderError("ABORTED", "Aborted");
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") {
    return new ProviderError("LLM_TIMEOUT", "LLM request timed out", { retryable: true, cause: e });
  }
  const status = e?.response?.status;
  if (status) {
    const retryable = status === 429 || status >= 500;
    return new ProviderError("LLM_UPSTREAM", `LLM upstream returned ${status}`, { retryable, cause: e });
  }
  return new ProviderError("LLM_FAILED", "LLM request failed", { retryable: true, cause: e });
}

/**
 * Vertex AI dedicated-endpoint chat provider (non-streaming).
 * `getAccessToken` is injected so tests do not need Google credentials.
 */
function createVertexChat({ config, getAccessToken, http = axios, log }) {
  const { projectNumber, endpointId, location, timeoutMs, retries, maxTokens, temperature, topP } = config;

  function endpointUrl() {
    if (!projectNumber || !endpointId) {
      throw new ProviderError("LLM_CONFIG", "VERTEX_PROJECT_NUMBER and VERTEX_ENDPOINT_ID must be set");
    }
    return (
      `https://${endpointId}.${location}-${projectNumber}.prediction.vertexai.goog` +
      `/v1/projects/${projectNumber}/locations/${location}/endpoints/${endpointId}:predict`
    );
  }

  async function complete({ messages, signal, requestId }) {
    const url = endpointUrl();
    const started = performance.now();
    const text = await withRetry(
      async (attempt) => {
        if (signal?.aborted) throw new ProviderError("ABORTED", "Aborted");
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let timedOut = false;
        controller.signal.addEventListener("abort", () => {
          timedOut = !signal?.aborted;
        });
        try {
          const token = await getAccessToken();
          const res = await http.post(
            url,
            {
              instances: [
                { "@requestFormat": "chatCompletions", messages, max_tokens: maxTokens, temperature, top_p: topP },
              ],
            },
            {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              signal: controller.signal,
              timeout: timeoutMs,
            }
          );
          const out = extractText(res.data);
          if (!out) throw new ProviderError("LLM_EMPTY", "LLM returned no text", { retryable: true });
          return out;
        } catch (e) {
          const err = timedOut
            ? new ProviderError("LLM_TIMEOUT", `LLM timed out after ${timeoutMs}ms`, { retryable: true })
            : classify(e);
          if (err.code !== "ABORTED") log?.warn("llm.attempt_failed", { requestId, attempt, code: err.code });
          throw err;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
      },
      { retries, signal }
    );
    return { text, durationMs: performance.now() - started };
  }

  return { complete };
}

module.exports = { createVertexChat, extractText };
