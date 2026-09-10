import type { NextConfig } from "next";

const apiOrigin = process.env.CLEANOPS_API_INTERNAL_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
