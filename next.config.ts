import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.254.124"],
  devIndicators: false,
  async redirects() {
    return [
      // /browse was consolidated into /marketplace; keep old links working.
      { source: "/browse", destination: "/marketplace", permanent: true },
      {
        source: "/browse/:path*",
        destination: "/marketplace/:path*",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
