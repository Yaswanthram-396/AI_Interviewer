const { ProviderError, withDeadline, withRetry } = require("../util");

/** Google Cloud TTS adapter (complete-response synthesis; MP3, base64 encoded). */
function createGoogleTts({ client, config, log }) {
  const { timeoutMs, retries, languageCode, voiceName } = config;

  async function synthesize({ text, signal, requestId }) {
    const started = performance.now();
    const audioBase64 = await withRetry(
      async (attempt) => {
        try {
          const [res] = await withDeadline(
            client.synthesizeSpeech(
              {
                input: { text },
                voice: { languageCode, name: voiceName },
                audioConfig: { audioEncoding: "MP3" },
              },
              { timeout: timeoutMs }
            ),
            { ms: timeoutMs, signal, code: "TTS_TIMEOUT", label: "TTS" }
          );
          if (!res?.audioContent?.length) throw new ProviderError("TTS_EMPTY", "TTS returned no audio", { retryable: true });
          return Buffer.from(res.audioContent).toString("base64");
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError("TTS_FAILED", "TTS request failed", { retryable: true, cause: e });
          if (err.code !== "ABORTED") log?.warn("tts.attempt_failed", { requestId, attempt, code: err.code });
          throw err;
        }
      },
      { retries, signal }
    );
    return { audioBase64, durationMs: performance.now() - started };
  }

  return { synthesize };
}

module.exports = { createGoogleTts };
