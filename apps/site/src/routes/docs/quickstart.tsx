import { createFileRoute } from "@tanstack/react-router";

import { LiterateDemo } from "../../components/LiterateDemo.js";
import { Sandbox } from "../../docs/Sandbox.js";
import Content from "../../../../../docs/quickstart.md";

export const Route = createFileRoute("/docs/quickstart")({
    component: () => (
        <>
            <p className="docs-lead">
                Wrap an Effect workflow in <code>withTrace</code>. The browser sees every span,
                every <code>Effect.log</code>, every duration - live. Here's the loop, with the
                code on the left and what your user sees on the right:
            </p>
            <div className="docs-feature-break">
                <LiterateDemo />
            </div>
            <Content />
            <Sandbox path="demo-sse" title="Run the SSE example" />
        </>
    ),
});
