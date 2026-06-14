import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep alasql out of the Turbopack bundle entirely.
  // Its default entry (alasql.fs.js) has static requires for react-native-fs /
  // react-native-fetch-blob that Turbopack chokes on at build time.
  // With serverExternalPackages, Node.js loads it natively at runtime where
  // the react-native branch is guarded by `navigator.product === 'ReactNative'`
  // and never executes.
  serverExternalPackages: ["alasql", "duckdb", "duckdb-async"],
};

export default nextConfig;
