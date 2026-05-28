import { createFileRoute } from "@tanstack/react-router";

import Content from "../../../../../../docs/integrations/opentelemetry.md";

export const Route = createFileRoute("/docs/integrations/opentelemetry")({
    component: () => <Content />,
});
