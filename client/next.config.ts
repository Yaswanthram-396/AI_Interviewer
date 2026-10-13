import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Lets a second instance (e.g. an isolated test run) use its own build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
