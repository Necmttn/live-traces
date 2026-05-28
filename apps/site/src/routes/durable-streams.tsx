import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve the inbound link from the durable-streams.com sidebar PR.
// Canonical lives at /docs/integrations/durable-streams now.
export const Route = createFileRoute("/durable-streams")({
    beforeLoad: () => {
        throw redirect({ to: "/docs/integrations/durable-streams" });
    },
});
