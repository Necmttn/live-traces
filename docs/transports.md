# Transports

`send(events: ReadonlyArray<TraceEvent>): Effect.Effect<void>` - three built-ins ship with the package, swappable without touching workflow code.

| Transport | Wire | Resumable | Multi-pod | When |
| --- | --- | --- | --- | --- |
| **SSE** | One-way HTTP | No | Sticky | Default. |
| **WebSocket** | Full-duplex | No | Sticky | Client needs to send back. |
| **Durable Streams** | HTTP NDJSON | Yes | Yes | Production scale. |

```ts
const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(/* ONE of the transport layers below */),
)
```

Runnable examples: [`demo-sse`](https://github.com/necmttn/livetrace/tree/main/examples/demo-sse), [`demo-ws`](https://github.com/necmttn/livetrace/tree/main/examples/demo-ws), [`demo-durable-streams`](https://github.com/necmttn/livetrace/tree/main/examples/demo-durable-streams).

## Server-Sent Events

```ts
import { SSETransportLayer, getSseBroker } from "livetrace/transports/sse"

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
)
```

Subscribe in your route handler:

```ts
Bun.serve({
    fetch(req) {
        const url = new URL(req.url)
        const match = url.pathname.match(/^\/traces\/(user|team|org)\/(.+)$/)
        if (!match) return new Response("not found", { status: 404 })
        const [, type, id] = match

        return new Response(
            new ReadableStream({
                start(controller) {
                    const enc = new TextEncoder()
                    controller.enqueue(enc.encode(": connected\n\n"))
                    const unsub = getSseBroker().subscribe(
                        { type: type as "user", id: id! },
                        (events) => controller.enqueue(enc.encode(`data: ${JSON.stringify(events)}\n\n`)),
                    )
                    const hb = setInterval(() => controller.enqueue(enc.encode(": hb\n\n")), 15_000)
                    req.signal.addEventListener("abort", () => { clearInterval(hb); unsub(); controller.close() })
                },
            }),
            { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
        )
    },
})
```

Browser:

```ts
const es = new EventSource(`/traces/user/${userId}`)
es.onmessage = (msg) => getTraceStore().dispatchBatch(JSON.parse(msg.data))
```

The broker is in-process - multi-pod requires sticky sessions or [Durable Streams](#durable-streams). Edges close idle HTTP at 30–60s; the heartbeat keeps it warm. SSE has no replay.

## WebSocket

Same fan-out, full-duplex. Use when the browser needs to send acks, replay cursors, or commands back.

```ts
import { WSTransportLayer, getWsBroker } from "livetrace/transports/ws"

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(WSTransportLayer),
)

Bun.serve<{ unsub: () => void; scope: { type: "user"; id: string } }>({
    fetch(req, server) {
        const url = new URL(req.url)
        const match = url.pathname.match(/^\/traces\/(user|team|org)\/(.+)$/)
        if (!match) return new Response("not found", { status: 404 })
        const [, type, id] = match
        const ok = server.upgrade(req, { data: { unsub: () => void 0, scope: { type: type as "user", id: id! } } })
        return ok ? undefined : new Response("upgrade failed", { status: 426 })
    },
    websocket: {
        open(ws) {
            ws.data.unsub = getWsBroker().subscribe(
                ws.data.scope,
                (events) => ws.send(JSON.stringify(events)),
            )
        },
        message() { /* handle inbound here */ },
        close(ws) { ws.data.unsub?.() },
    },
})
```

```ts
const ws = new WebSocket(`wss://api.example.com/traces/user/${userId}`)
ws.onmessage = (msg) => getTraceStore().dispatchBatch(JSON.parse(msg.data))
```

Vite's dev `proxy: { ws: true }` is flaky; in `demo-ws` the browser connects to the backend directly.

## Durable Streams

Trace batches append to a per-scope HTTP log on a [Durable Streams](https://durablestreams.com) server. The browser reads back with an opaque resume offset.

- Resumable across reloads via saved offsets.
- Multi-pod safe - any pod appends, any browser tails.
- CDN-friendly: past offsets are immutable.

```ts
import { DurableStreamsTransportLayer } from "livetrace/transports/durable-streams"

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(
        DurableStreamsTransportLayer({
            baseUrl: process.env.DURABLE_STREAMS_URL!,
            headers: { Authorization: () => `Bearer ${getToken()}` },
        }),
    ),
)
```

Browser-side walkthrough on the dedicated page: [Integrations → Durable Streams](/docs/integrations/durable-streams).

Don't bother in local dev or for workflows that finish in <1s without reloads - SSE is fewer moving parts.

## Custom

Implement `TraceTransport` and provide it as a layer:

```ts
import { Effect, Layer } from "effect"
import { TraceTransportTag, type TraceTransport } from "livetrace/sink"

const MyTransport: TraceTransport = {
    send: (events) =>
        Effect.tryPromise({
            try: () => fetch("https://my-bus/events", { method: "POST", body: JSON.stringify(events) }),
            catch: (e) => e,
        }).pipe(Effect.asVoid),
}

export const MyTransportLayer = Layer.succeed(TraceTransportTag, MyTransport)
```

Kafka, NATS, Redis Streams, a database - as long as the browser can subscribe to the same fan-out, the store doesn't care.
