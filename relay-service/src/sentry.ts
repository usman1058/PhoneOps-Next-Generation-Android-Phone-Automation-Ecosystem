export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set, skipping initialization");
    return;
  }
  let sentry;
  try {
    sentry = require("@sentry/node");
  } catch (err) {
    console.warn(
      "[sentry] @sentry/node unavailable, skipping:",
      (err as Error).message,
    );
    return;
  }
  sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? "development",
  });
  console.log("[sentry] initialized with DSN");
}