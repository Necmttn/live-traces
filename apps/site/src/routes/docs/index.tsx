import { createFileRoute } from "@tanstack/react-router";

import { AgentDemo } from "../../docs/AgentDemo.js";
import Content from "../../../../../docs/overview.md";

export const Route = createFileRoute("/docs/")({
    component: () => (
        <>
            <p className="docs-lead">
                A real-time tracer for Effect. Wrap a workflow in <code>withTrace</code>, mount the
                React (or Vue / Svelte / Solid / vanilla) bindings, and the user sees every span - start,
                end, log event, generated token - as it happens. Below is the kind of UI livetrace is
                actually built for:
            </p>
            <div className="docs-feature-break">
                <AgentDemo />
            </div>
            <Content />
        </>
    ),
});
