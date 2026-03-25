import type { NextConfig } from "next";

const backendProxy = process.env.BACKEND_API_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (!backendProxy) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendProxy}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
