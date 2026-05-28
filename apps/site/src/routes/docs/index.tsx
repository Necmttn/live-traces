import { createFileRoute } from "@tanstack/react-router";

import Content from "../../../../../docs/overview.md";

export const Route = createFileRoute("/docs/")({
    component: () => <Content />,
});
