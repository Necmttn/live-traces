import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 4173,
    },
    build: {
        outDir: "dist",
        target: "es2022",
    },
});
