import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend =
    env.VITE_API_URL ||
    env.VITE_BACKEND_URL ||
    "https://api.rlcbausoftware.com";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
        "/files": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
        "/projects": {
          target: backend,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});