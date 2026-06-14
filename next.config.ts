import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack/turbopack from trying to bundle sql.js's wasm file.
  // The wasm binary is loaded at runtime via fs.readFileSync instead.
  serverExternalPackages: ["sql.js"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
    },
  } as any,
};

export default nextConfig;
