/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  server: {
    port: 5173,
  },
  build: {
    // Never inline the engine as a data URI: it must stay a separate,
    // content-hashed file so it can be cached immutably and streamed to
    // WebAssembly.instantiateStreaming rather than parsed out of the JS bundle.
    assetsInlineLimit: (filePath: string) => (filePath.endsWith(".wasm") ? false : undefined),
    rollupOptions: {
      input: {
        main: "index.html",
        learn: "learn.html",
        learnCore: "learn-core.html",
        learnAdvanced: "learn-advanced.html",
        learnVariants: "learn-variants.html",
        learnXyWing: "learn-xy-wing.html",
        learnSwordfish: "learn-swordfish.html",
        learnColoring: "learn-coloring.html",
        learnForcingChains: "learn-forcing-chains.html",
        killerCalculator: "killer-sudoku-calculator.html",
        grade: "grade.html",
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
