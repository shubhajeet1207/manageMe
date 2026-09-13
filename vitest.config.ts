import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import path from "path"

config()

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "next.config.test.ts"],
    // The first test in any DB-touching file absorbs Neon connection warm-up and
    // has measured 4990-8489ms against a remote (us-west-2) database, straddling
    // vitest's 5000ms default.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
