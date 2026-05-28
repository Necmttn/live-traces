import { createFileRoute } from "@tanstack/react-router";

import { Sandbox } from "../../docs/Sandbox.js";
import Content from "../../../../../docs/transports.md";

export const Route = createFileRoute("/docs/transports")({
    component: () => (
        <>
            <Content />
            <h2>Try them</h2>
            <Sandbox path="demo-sse" title="demo-sse - Server-Sent Events" />
            <Sandbox path="demo-ws" title="demo-ws - WebSocket" />
            <Sandbox path="demo-durable-streams" title="demo-durable-streams - Durable Streams" />
        </>
    ),
});
