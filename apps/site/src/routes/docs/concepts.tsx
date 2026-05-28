import { createFileRoute } from "@tanstack/react-router";

import Content from "../../../../../docs/concepts.md";

export const Route = createFileRoute("/docs/concepts")({
    component: () => <Content />,
});
