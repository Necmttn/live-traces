import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "../../../docs/Sandbox.js";
import Content from "../../../../../../docs/integrations/durable-streams.md";

export const Route = createFileRoute("/docs/integrations/durable-streams")({
    component: () => (
        <>
            <Content />
            <h2>Run the example</h2>
            <Sandbox path="demo-durable-streams" title="demo-durable-streams" />
        </>
    ),
});
