import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Only the Gemini style-reference images ship with the deployed function.
    // python/** and requirements.txt are for the local-only "python" compositor
    // mode (see lib/server/hair-compositor.ts) and are NOT needed by the
    // production "http" mode, which calls a separately-deployed service.
    "/api/generate": ["./assets/style-references/**/*"],
  },
};

export default nextConfig;
