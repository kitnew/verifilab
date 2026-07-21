import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: process.env.NEXT_TURBOPACK_ROOT ?? path.resolve(__dirname, "..") },
};

export default nextConfig;
