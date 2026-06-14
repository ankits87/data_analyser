import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
    },
  } as any,
};

export default nextConfig;
