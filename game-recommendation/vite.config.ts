import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "game-recommendation",
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../src/playground/game-recommendation",
    emptyOutDir: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
