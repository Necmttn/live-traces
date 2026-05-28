# Quickstart

## Install

```bash
bun add livetrace effect
```

Effect is needed on the backend. The browser needs only whichever transport client matches your transport layer. React hooks ship in `livetrace/react`; bindings for Vue / Svelte / Solid / vanilla are on the [Frontend](/docs/frontend) page.

## 1. Compose the layer

```ts
import { Effect, Layer, Logger } from "effect"
import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace"
import { SSETransportLayer } from "livetrace/transports/sse"

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
)

const LoggerLive = Logger.replaceScoped(
    Logger.defaultLogger,
    Effect.succeed(liveTraceLogger),
)

const Runtime = Layer.merge(TraceLive, LoggerLive)
```

`SSETransportLayer` is one of three - swap for `WSTransportLayer` or `DurableStreamsTransportLayer` without touching workflow code.

## 2. Wrap a workflow

```ts
import { Effect } from "effect"
import { withTrace, step } from "livetrace"

const processDocument = (docId: string) =>
    Effect.gen(function* () {
        yield* step("Parse")(parsePdf(docId))
        yield* step("Embed")(embedChunks(docId))
        yield* step("Index")(indexVectors(docId))
    }).pipe(
        withTrace({
            traceId: `doc:${docId}`,
            label: "Document processing",
            scope: { type: "user", id: "alice" },
        }),
    )

Effect.runPromise(
    processDocument("report.pdf").pipe(Effect.provide(Runtime), Effect.scoped),
)
```

`scope` decides who receives events. `step("Name")` marks a user-visible stage. Nested `Effect.withSpan` calls become child spans. `Effect.log*` calls inside the scope become `SpanEvent`s.

## 3. Serve the transport

```ts
import { getSseBroker } from "livetrace/transports/sse"

Bun.serve({
    port: 8787,
    fetch(req) {
        const url = new URL(req.url)
        const match = url.pathname.match(/^\/traces\/(user|team|org)\/(.+)$/)
        if (!match) return new Response("not found", { status: 404 })
        const [, type, id] = match

        return new Response(
            new ReadableStream({
                start(controller) {
                    const enc = new TextEncoder()
                    const unsub = getSseBroker().subscribe(
                        { type: type as "user", id: id! },
                        (events) => controller.enqueue(enc.encode(`data: ${JSON.stringify(events)}\n\n`)),
                    )
                    req.signal.addEventListener("abort", () => { unsub(); controller.close() })
                },
            }),
            { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
        )
    },
})
```

## 4. Render

```tsx
import { useEffect } from "react"
import { getTraceStore, useActiveTraces, useTraceSteps } from "livetrace/react"
import type { TraceEvent } from "livetrace/types"

useEffect(() => {
    const es = new EventSource("/traces/user/alice")
    es.onmessage = (msg) =>
        getTraceStore().dispatchBatch(JSON.parse(msg.data) as TraceEvent[])
    return () => es.close()
}, [])

function ActivityPanel() {
    return useActiveTraces().map((t) => <TraceCard key={t.traceId} traceId={t.traceId} />)
}

function TraceCard({ traceId }: { traceId: string }) {
    const steps = useTraceSteps(traceId)
    return (
        <ol>
            {steps.map((s) => (
                <li key={s.spanId}>
                    {s.name} · {s.status}
                    {s.durationMs != null ? ` · ${s.durationMs.toFixed(0)}ms` : ""}
                </li>
            ))}
        </ol>
    )
}
```

## Try it

The full example is at [`examples/demo-sse`](https://github.com/necmttn/livetrace/tree/main/examples/demo-sse). Clone, `bun install`, `bun demo:sse`, open `localhost:5173`.
