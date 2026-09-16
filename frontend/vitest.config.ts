import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@application": fileURLToPath(
        new URL("./app/application", import.meta.url),
      ),
      "@domain": fileURLToPath(new URL("./app/domain", import.meta.url)),
      "@infrastructure": fileURLToPath(
        new URL("./app/infrastructure", import.meta.url),
      ),
      "@presentation": fileURLToPath(
        new URL("./app/presentation", import.meta.url),
      ),
      "@runtime": fileURLToPath(new URL("./app/runtime", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.{test,spec}.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
