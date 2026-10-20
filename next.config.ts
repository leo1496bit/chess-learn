import type { NextConfig } from "next";

/** En-têtes de sécurité appliqués à toutes les réponses (HSTS est ajouté par Vercel). */
const SECURITY_HEADERS = [
  // Interdit l'affichage de l'application dans un cadre d'un autre site (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Application personnelle entièrement dynamique (session + données privées) :
  // Cache Components n'est pas activé.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
