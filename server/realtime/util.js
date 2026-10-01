/** Error raised by provider adapters; `code` is safe to expose to clients. */
class ProviderError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

/** Resolves after `ms`, rejecting with ABORTED if `signal` fires first. */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError("ABORTED", "Aborted"));
    const onAbort = () => {
      clearTimeout(t);
      reject(new ProviderError("ABORTED", "Aborted"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Races `promise` against a timeout and an abort signal. The underlying work is
 * not cancelled unless the caller also passes the signal to it.
 */
function withDeadline(promise, { ms, signal, code = "TIMEOUT", label = "operation" }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError("ABORTED", "Aborted"));
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new ProviderError(code, `${label} timed out after ${ms}ms`, { retryable: true }));
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new ProviderError("ABORTED", "Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e) => {
        cleanup();
        reject(e);
      }
    );
  });
}

/** Runs `fn(attempt)` with retries on retryable ProviderErrors. */
async function withRetry(fn, { retries, backoffMs = 250, signal }) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (e.code === "ABORTED" || !e.retryable || attempt >= retries) throw e;
      attempt += 1;
      await sleep(backoffMs * 2 ** (attempt - 1), signal);
    }
  }
}

module.exports = { ProviderError, sleep, withDeadline, withRetry };
