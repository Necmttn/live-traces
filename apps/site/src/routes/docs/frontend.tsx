import { createFileRoute } from "@tanstack/react-router";

import Content from "../../../../../docs/frontend.md";

export const Route = createFileRoute("/docs/frontend")({
    component: () => <Content />,
});
