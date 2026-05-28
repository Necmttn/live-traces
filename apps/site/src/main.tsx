import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import { routeTree } from "./routeTree.gen.js";
import "./styles.css";

const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

const root = document.getElementById("root");
if (root) {
    createRoot(root).render(
        <React.StrictMode>
            <RouterProvider router={router} />
        </React.StrictMode>,
    );
}
