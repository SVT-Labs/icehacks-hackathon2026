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
};

export default nextConfig;
