import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Tell Vercel's file tracer to include the pdfjs worker in the bundle.
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
  serverExternalPackages: ["pdf-parse", "mammoth", "pdfjs-dist"],
};

export default nextConfig;
