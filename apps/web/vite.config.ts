import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = process.env.VITE_BACKEND_URL || "http://localhost:4000";


export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
      // serve anche per aprire /files/... (upload, PDF, immagini)
      "/files": {
        target: BACKEND,
        changeOrigin: true,
      },
      "/projects": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
