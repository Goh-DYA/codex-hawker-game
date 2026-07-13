import type { NextConfig } from "next";
import { NEXT_SECURITY_HEADERS } from "./src/config/securityHeaders";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: NEXT_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
