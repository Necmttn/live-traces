import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/traces": {
                target: "http://localhost:8787",
                changeOrigin: true,
            },
            "/run": "http://localhost:8787",
        },
    },
});
