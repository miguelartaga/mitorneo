import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-expect-error - eslint is a valid config but types might be strict
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i0.wp.com",
      },
    ],
  },
};

export default nextConfig;
