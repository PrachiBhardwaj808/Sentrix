import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const backendUrl = process.env.DOCKER_BACKEND_URL || "http://127.0.0.1:8000";
    const mediaRelayUrl = process.env.DOCKER_MEDIA_RELAY_URL || "http://127.0.0.1:8888";
    return [
      {
        source: "/api/:path(.*)",
        destination: `${backendUrl}/api/:path`,
      },
      {
        source: "/relay-media/:path(.*)",
        destination: `${mediaRelayUrl}/:path`,
      },
      {
        source: "/CAM\\-:path(.*)",
        destination: `${mediaRelayUrl}/CAM-:path`,
      },
    ];
  },
};

export default nextConfig;
