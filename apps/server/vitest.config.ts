import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  /* .env optional */
}

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
