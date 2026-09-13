import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Deliberately above the 10MB product cap in src/server/files/pdf.ts: the
      // default 1MB rejects a real resume with an opaque framework error before
      // validatePdfUpload runs, and a limit at 10mb would make the framework,
      // not our field message, answer a 10.5MB file (§4, §8.3).
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
