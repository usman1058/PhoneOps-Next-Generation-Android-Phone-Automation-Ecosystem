export function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  const cleaned = ip.replace(/^::ffff:/, "");
  return cleaned === "::1" || cleaned === "127.0.0.1" || cleaned.startsWith("127.");
}

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}
