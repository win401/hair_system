import type { NextConfig } from "next";

// Style reference photos now live in Supabase Storage (see
// lib/ai/gemini-adapter.ts) instead of the local filesystem, so no
// outputFileTracingIncludes is needed anymore.
const nextConfig: NextConfig = {};

export default nextConfig;
