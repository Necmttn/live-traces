import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { DocsLayout } from "../../docs/DocsLayout.js";

export const Route = createFileRoute("/docs")({
    component: () => (
        <DocsLayout>
            <Outlet />
        </DocsLayout>
    ),
});

// re-export Link so MDX content can use it via `import { Link } from "@tanstack/react-router"` directly if needed
void Link;
