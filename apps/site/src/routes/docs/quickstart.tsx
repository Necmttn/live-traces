import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "../../docs/Sandbox.js";
import Content from "../../../../../docs/quickstart.md";

export const Route = createFileRoute("/docs/quickstart")({
    component: () => (
        <>
            <Content />
            <Sandbox path="demo-sse" title="Run the SSE example" file="src/server.ts" />
        </>
    ),
});
