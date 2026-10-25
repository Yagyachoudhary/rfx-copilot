import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "sql.js", "exceljs", "mammoth"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./sample-data/**/*", "./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
