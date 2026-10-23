import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Server actions take photo and receipt uploads; the default limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};

export default nextConfig;
