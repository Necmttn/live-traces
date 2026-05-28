/**
 * Source files shown inline by the <Sandbox> component, per example.
 *
 * Loaded at build time via Vite's `?raw` import - the same files that live in
 * `examples-sandbox/{name}/` (the npm-deps copy of `examples/{name}/`, kept in
 * sync by `scripts/sync-sandbox.ts`).
 */
import demoSseServer from "../../../../examples-sandbox/demo-sse/src/server.ts?raw";
import demoSseWorkflow from "../../../../examples-sandbox/demo-sse/src/workflow.ts?raw";
import demoSseWeb from "../../../../examples-sandbox/demo-sse/src/web/sse.ts?raw";

import demoWsServer from "../../../../examples-sandbox/demo-ws/src/server.ts?raw";
import demoWsWorkflow from "../../../../examples-sandbox/demo-ws/src/workflow.ts?raw";
import demoWsWeb from "../../../../examples-sandbox/demo-ws/src/web/ws.ts?raw";

import demoDsServer from "../../../../examples-sandbox/demo-durable-streams/src/server.ts?raw";
import demoDsWorkflow from "../../../../examples-sandbox/demo-durable-streams/src/workflow.ts?raw";
import demoDsWeb from "../../../../examples-sandbox/demo-durable-streams/src/web/ds.ts?raw";

export interface SandboxFile {
    readonly path: string;
    readonly lang: "tsx" | "typescript";
    readonly source: string;
}

export const SANDBOX_SOURCES = {
    "demo-sse": [
        { path: "src/server.ts", lang: "typescript", source: demoSseServer },
        { path: "src/workflow.ts", lang: "typescript", source: demoSseWorkflow },
        { path: "src/web/sse.ts", lang: "typescript", source: demoSseWeb },
    ],
    "demo-ws": [
        { path: "src/server.ts", lang: "typescript", source: demoWsServer },
        { path: "src/workflow.ts", lang: "typescript", source: demoWsWorkflow },
        { path: "src/web/ws.ts", lang: "typescript", source: demoWsWeb },
    ],
    "demo-durable-streams": [
        { path: "src/server.ts", lang: "typescript", source: demoDsServer },
        { path: "src/workflow.ts", lang: "typescript", source: demoDsWorkflow },
        { path: "src/web/ds.ts", lang: "typescript", source: demoDsWeb },
    ],
} as const satisfies Record<string, ReadonlyArray<SandboxFile>>;
