# livetraces

> Real-time Effect span streaming to frontend UIs. Stream traces from any backend to React with zero overhead.

[![npm version](https://img.shields.io/npm/v/livetraces.svg)](https://www.npmjs.com/package/livetraces)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/necmttn/livetraces/actions/workflows/ci.yml/badge.svg)](https://github.com/necmttn/livetraces/actions/workflows/ci.yml)

`livetraces` turns the [Effect](https://effect.website) tracer into a live UI feed. Wrap a workflow in `withTrace`, mount the React hooks, and the user sees every span - start, end, log event - as it happens.

- **Drop-in Tracer decorator.** Composes with `@effect/opentelemetry`. Both OTel and live traces emit in parallel.
- **Wire format is plain JSON.** Backends in Go, Python, Rust can produce events; React consumes them the same way.
- **Pluggable transport.** SSE included. Console for dev. WebSocket / durable queues are 30 lines.
- **Zero-Effect frontend.** `livetraces/react` is just `useSyncExternalStore` + a reducer. Works in any React 18+ app.

→ Landing page & live demo: **[livetraces.necmttn.com](https://livetraces.necmttn.com)**

---

## Install

```bash
bun add livetraces effect
# or
npm install livetraces effect
```

React consumers also need `react@>=18`.

## Quick start (Effect backend)

```ts
import { Effect, Layer } from "effect";
import {
    LiveTraceLayer,
    TraceSinkLive,
    SSETransportLayer,
    withTrace,
    step,
    liveTraceLogger,
} from "livetraces";
import { SSETransportLayer as SSE } from "livetraces/transports/sse";

// 1. Compose the layer
const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSE),
);

// 2. Wrap a workflow
const processDocument = (docId: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`Starting ${docId}`);
        yield* step("Parse")(parsePdf(docId));
        yield* step("Embed")(embedChunks(docId));
        yield* step("Index")(indexVectors(docId));
    }).pipe(
        withTrace({
            traceId: `doc:${docId}`,
            label: "Document processing",
            scope: { type: "user", id: "alice" },
        }),
    );

// 3. Run with the trace layer + the live logger
Effect.runPromise(processDocument("report.pdf").pipe(Effect.provide(TraceLive)));
```

## React frontend

```tsx
import { useActiveTraces, useTrace, useTraceSteps } from "livetraces/react";

function ActivityPanel() {
    const traces = useActiveTraces();
    return (
        <div>
            {traces.map((t) => (
                <TraceCard key={t.traceId} traceId={t.traceId} />
            ))}
        </div>
    );
}

function TraceCard({ traceId }: { traceId: string }) {
    const trace = useTrace(traceId);
    const steps = useTraceSteps(traceId);
    if (!trace) return null;

    return (
        <div>
            <h3>
                {trace.label} <span>{trace.status}</span>
            </h3>
            <ol>
                {steps.map((s) => (
                    <li key={s.spanId}>
                        {s.name} · {s.status}
                        {s.durationMs != null && ` · ${s.durationMs.toFixed(0)}ms`}
                    </li>
                ))}
            </ol>
        </div>
    );
}
```

Connect the store to a transport (SSE shown):

```ts
import { getTraceStore } from "livetraces/react";
import type { TraceEvent } from "livetraces/types";

const es = new EventSource(`/traces/user/${userId}`);
es.onmessage = (msg) => {
    const batch: TraceEvent[] = JSON.parse(msg.data);
    getTraceStore().dispatchBatch(batch);
};
```

## SSE server (Bun / Node)

```ts
import { getSseBroker } from "livetraces/transports/sse";

// Bun's built-in server
Bun.serve({
    fetch(req) {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/traces\/(team|org|user)\/(.+)$/);
        if (!match) return new Response("not found", { status: 404 });
        const [, type, id] = match;

        return new Response(
            new ReadableStream({
                start(controller) {
                    const unsub = getSseBroker().subscribe(
                        { type: type as "user", id: id! },
                        (events) => {
                            controller.enqueue(
                                new TextEncoder().encode(`data: ${JSON.stringify(events)}\n\n`),
                            );
                        },
                    );
                    req.signal.addEventListener("abort", () => {
                        unsub();
                        controller.close();
                    });
                },
            }),
            {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            },
        );
    },
});
```

## Composing with OpenTelemetry

`LiveTraceLayer` wraps the current tracer instead of replacing it. Build OTel **outermost** (so it sets the tracer first), then livetraces wraps it.

```ts
const Env = ServerLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provideMerge(LiveTraceLayer),  // inner: wraps OTel
    Layer.provideMerge(TelemetryLive),   // outer: sets OTel tracer first
);
```

OTel still receives every span. Live-traces only annotates spans inside `withTrace` scopes and streams them out - there's no double-export.

## Wire format

Events are a discriminated union on `_tag`:

```ts
type TraceEvent = TraceStart | SpanStart | SpanEnd | SpanEvent | TraceEnd;
```

See [`src/types.ts`](./src/types.ts) for the full schema. The `livetraces/types` sub-export is **dependency-free** - any backend can emit these as JSON.

## Why?

OpenTelemetry is built for ops dashboards. `livetraces` is built for **user-facing** progress UIs - the difference between "show this user what their AI agent is doing right now" and "Datadog has my p99". Same span data, different rendering target.

## License

Apache-2.0 © Necmettin Karakaya
