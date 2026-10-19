import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application personnelle entièrement dynamique (session + données privées) :
  // Cache Components n'est pas activé.
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
