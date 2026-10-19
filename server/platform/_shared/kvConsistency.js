// ESA EdgeKV guarantees eventual consistency rather than read-after-write consistency.
// Keep retries short inside one edge request. Longer propagation waiting is handled
// by the ESA-only rating page so a single Functions request does not block for long.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function esaKvRetryOptions(env = {}) {
  return {
    attempts: toInt(env.ESA_KV_API_RETRY_ATTEMPTS, 3, 1, 5),
    baseDelayMs: toInt(env.ESA_KV_API_RETRY_BASE_MS, 250, 50, 1000),
    maxDelayMs: toInt(env.ESA_KV_API_RETRY_MAX_MS, 800, 100, 2000)
  };
}

/**
 * Retry only when a KV read returns null/undefined.
 * Real errors are rethrown immediately and valid falsey values are preserved.
 *
 * Return shape:
 *   { value, attempts, retried }
 */
export async function readKvWithPropagationRetry(read, env = {}) {
  const options = esaKvRetryOptions(env);
  let value;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    value = await read();
    if (value !== null && value !== undefined) {
      return { value, attempts: attempt, retried: attempt > 1 };
    }

    if (attempt < options.attempts) {
      const delay = Math.min(options.baseDelayMs * (2 ** (attempt - 1)), options.maxDelayMs);
      await sleep(delay);
    }
  }

  return { value: value ?? null, attempts: options.attempts, retried: options.attempts > 1 };
}
