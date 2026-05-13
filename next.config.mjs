/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url";

const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url))
};

export default nextConfig;
