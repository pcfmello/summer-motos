import type { NextConfig } from "next";

/** O token do convite vai na URL (`/convite/<token>`, e `/login?de=/convite/<token>`): sem `Referer` (D033). */
const SEM_REFERER = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      { source: "/convite/:caminho*", headers: SEM_REFERER },
      { source: "/login", headers: SEM_REFERER },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
