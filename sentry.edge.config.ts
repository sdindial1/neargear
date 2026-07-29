import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Gated on the DSN only — see sentry.server.config.ts.
  enabled: !!process.env.SENTRY_DSN,
});
