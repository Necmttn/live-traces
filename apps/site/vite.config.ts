import mdx from "@mdx-js/rollup";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        TanStackRouterVite({ target: "react", autoCodeSplitting: true, routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts" }),
        {
            enforce: "pre",
            ...mdx({
                jsxImportSource: "react",
                providerImportSource: undefined,
                remarkPlugins: [remarkGfm],
                rehypePlugins: [
                    rehypeSlug,
                    [rehypePrettyCode, { theme: "github-dark-dimmed", keepBackground: false }],
                    [rehypeAutolinkHeadings, { behavior: "wrap" }],
                ],
            }),
        },
        react({ include: /\.(jsx|tsx|md|mdx)$/ }),
    ],
    // Markdown lives outside apps/site (at repo root); dedupe ensures
    // those .md modules resolve react/react-dom from apps/site's deps
    // instead of failing when Rollup walks up from docs/.
    resolve: {
        dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    server: {
        port: 4173,
        fs: {
            allow: [".."],
        },
    },
    build: {
        outDir: "dist",
        target: "es2022",
        commonjsOptions: {
            include: [/node_modules/],
        },
    },
});
