import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5175,
        proxy: {
            "/run": "http://localhost:8789",
            // Proxy the durable-streams server through Vite so the browser can
            // talk to it without CORS headaches.
            "/ds": {
                target: "http://127.0.0.1:4437",
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/ds/, ""),
            },
        },
    },
});
