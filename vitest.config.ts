import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import path from "path"

config()

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
