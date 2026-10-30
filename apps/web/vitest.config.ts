import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// A fixed time zone keeps the hour-to-local-time tests deterministic.
process.env.TZ = "America/Sao_Paulo"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    globals: true,
    include: ["**/*.spec.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
