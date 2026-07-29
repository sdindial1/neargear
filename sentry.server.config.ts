import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Gated on the DSN only — NOT on NODE_ENV. Local money-path testing
  // (payments Phase 3) must report, otherwise we test with alerting off.
  enabled: !!process.env.SENTRY_DSN,
});
