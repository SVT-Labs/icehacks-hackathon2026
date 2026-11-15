import type { NextConfig } from "next";

// Cache Components and partial prefetching are left off on purpose: the pages
// are client-driven, and neither feature has been checked on Netlify.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // Standard hardening headers on every page and API answer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Browsers must not guess a file's type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The game may not be shown inside another site's frame.
          { key: "X-Frame-Options", value: "DENY" },
          // A room link is never passed on to other sites.
          { key: "Referrer-Policy", value: "no-referrer" },
          // The microphone is for dictation on this site only; the camera,
          // location and payment features are never used.
          {
            key: "Permissions-Policy",
            value: "microphone=(self), camera=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
