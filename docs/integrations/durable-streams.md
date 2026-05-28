# Durable Streams

Trace batches append to a per-scope HTTP log on a [Durable Streams](https://durablestreams.com) server. The browser reads back with an opaque resume offset.

- Resumable across reloads.
- Multi-pod safe.
- CDN-friendly historical reads.
- Pub/sub state lives in the durable-streams server, not your app process.

## How it works

```
Effect workflow
  └─ withTrace + step
       └─ TraceSink
            └─ DurableStreamsTransportLayer        ─► append NDJSON
                                                      to trace/user/<id>

Browser (any framework)
  └─ @durable-streams/client stream()              ◄─ read NDJSON, resumable
       └─ TraceStore.dispatchBatch
            └─ React / Vue / Svelte / Solid / vanilla
```

Events are grouped by `TraceScope` and appended as NDJSON to `trace/{scope.type}/{scope.id}` (default; override with `scopeToPath`).

## Install

```bash
bun add livetrace effect @durable-streams/client
```

Effect is a backend peer. The browser only needs `@durable-streams/client` plus the store from `livetrace`.

## Server

```ts
import { Effect, Layer, Logger } from "effect"
import {
    LiveTraceLayer,
    TraceSinkLive,
    withTrace,
    step,
    liveTraceLogger,
} from "livetrace"
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

const LoggerLive = Logger.replaceScoped(Logger.defaultLogger, Effect.succeed(liveTraceLogger))
const Runtime = Layer.merge(TraceLive, LoggerLive)
```

## Browser

```ts
import { stream } from "@durable-streams/client"
import { getTraceStore } from "livetrace/react"
import type { TraceEvent } from "livetrace/types"

export async function connectTraces(scopeType: "user" | "team" | "org", scopeId: string) {
    const res = await stream({
        url: `${window.location.origin}/ds/trace/${scopeType}/${encodeURIComponent(scopeId)}`,
        offset: "-1",
        live: true,
    })

    let buffer = ""
    res.subscribeText((chunk) => {
        buffer += chunk.text
        let idx: number
        while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (!line) continue
            try {
                const ev = JSON.parse(line) as TraceEvent
                getTraceStore().dispatchBatch([ev])
            } catch { /* skip malformed */ }
        }
    })

    return () => res.cancel()
}
```

> `stream()` requires an absolute URL. In dev, reverse-proxy `/ds/*` → your durable-streams server (Vite `server.proxy`, Next.js `rewrites`, Caddy) to avoid CORS plumbing.

Render with whichever framework - see [Frontend](/docs/frontend).

## Resume

Persist the next-offset returned in each chunk (localStorage, URL hash, SSR prop). Pass as `offset` on the next `stream()` call.

```ts
const savedOffset = localStorage.getItem(`trace-offset:${scopeId}`) ?? "-1"
const res = await stream({ url, offset: savedOffset, live: true })

res.subscribeText((chunk) => {
    localStorage.setItem(`trace-offset:${scopeId}`, chunk.offset)
    // ...parse NDJSON...
})
```

## Multi-pod, multi-tab

Pub/sub state lives in the durable-streams server. Any pod appends, any number of browsers tail. No sticky sessions. Two tabs on the same scope see the same span sequence. Operators can tail any user's scope from a dashboard.

## Abstract appender

If you already wrap `@durable-streams/client` in an Effect service (auth, multi-tenant URL resolution, observability spans), provide your own appender:

```ts
import {
    DurableStreamsAppenderLayer,
    DurableStreamsAppenderTag,
    StreamResolverTag,
} from "livetrace/transports/durable-streams"

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(DurableStreamsAppenderLayer),
    Layer.provide(MyDurableStreamsService),  // provides Appender + Resolver
)
```

`DurableStreamsAppenderTag.appendEvents(streamId, events)` and `StreamResolverTag.getOrCreateStreamId(scope)` are the extension points. [Source](https://github.com/necmttn/livetrace/blob/main/packages/livetrace/src/transports/durable-streams.ts).

## Deployment

Local: `DurableStreamTestServer` from `@durable-streams/server`. The [`demo-durable-streams` example](https://github.com/necmttn/livetrace/tree/main/examples/demo-durable-streams) shows it.

Self-hosted: [Caddy + durable_streams](https://durablestreams.com/deployment) plugin.

Managed: Electric Cloud CLI provisions a streams service. Proxy through your app server so the secret never reaches the client.
