import type { NextConfig } from "next";
import { createNextSecurityHeaders } from "./src/config/securityHeaders";

const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: createNextSecurityHeaders(isDevelopment),
      },
    ];
  },
};

export default nextConfig;
