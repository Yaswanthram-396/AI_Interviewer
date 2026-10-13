import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  css: { postcss: {} }, // tests never touch CSS; skip the Tailwind PostCSS config
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
