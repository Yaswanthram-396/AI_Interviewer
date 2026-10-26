const axios = require("axios");
const { ProviderError, withRetry } = require("../util");
const { selectVertexProtocol, extractChatCompletionsText: extractText } = require("./vertexProtocols");

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
 * Vertex AI chat provider (non-streaming). Uses serverless Gemini when `config.model` is set,
 * otherwise a dedicated endpoint. `getAccessToken` is injected so tests need no Google credentials.
 */
function createVertexChat({ config, getAccessToken, http = axios, log }) {
  const { timeoutMs, retries } = config;
  const protocol = selectVertexProtocol(config);

  /** `json` asks for a JSON object; `maxTokens` overrides the default reply cap for this call. */
  async function complete({ messages, signal, requestId, json = false, maxTokens }) {
    const url = protocol.url(config);
    const callConfig = maxTokens ? { ...config, maxTokens } : config;
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
            protocol.body(messages, callConfig, { json }),
            {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              signal: controller.signal,
              timeout: timeoutMs,
            }
          );
          const out = protocol.extractText(res.data);
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
