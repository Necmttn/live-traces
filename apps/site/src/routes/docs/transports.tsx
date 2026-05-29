import { createFileRoute } from "@tanstack/react-router";

import { TransportCards, TransportTabs } from "../../components/Transports.js";
import { Sandbox } from "../../docs/Sandbox.js";
import Content from "../../../../../docs/transports.md";

export const Route = createFileRoute("/docs/transports")({
    component: () => (
        <>
            <p className="docs-lead">
                Same workflow code; swap the transport layer. Below: identical setup, three
                different shipping mechanisms. Pick whichever matches your deploy.
            </p>
            <div className="docs-feature-break">
                <TransportTabs />
            </div>
            <Content />
            <div className="docs-feature-break">
                <TransportCards />
            </div>
            <h2>Try them</h2>
            <Sandbox path="demo-sse" title="demo-sse - Server-Sent Events" />
            <Sandbox path="demo-ws" title="demo-ws - WebSocket" />
            <Sandbox path="demo-durable-streams" title="demo-durable-streams - Durable Streams" />
        </>
    ),
});
