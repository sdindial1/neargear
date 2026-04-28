import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.254.124"],
  devIndicators: false,
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
