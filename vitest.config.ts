import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/.claude/**", "**/node_modules/**", "**/.next/**"],
    globals: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
