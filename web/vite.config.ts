/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        learn: "learn.html",
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
