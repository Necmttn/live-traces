import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5174,
        proxy: {
            "/run": "http://localhost:8788",
        },
    },
});
