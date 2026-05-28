# demo-ws

Runnable end-to-end example using the **WebSocket transport**. Same fake document-processing Effect workflow as `demo-sse`, only the wire is full-duplex WebSocket instead of one-way SSE.

```bash
bun install         # at the repo root
bun demo:ws         # runs both server (:8788) + web (:5174)
```

Open http://localhost:5174. Click **Run successful workflow** or **Run failing workflow** and watch the cards populate live.

### What this shows

- **Server** (`src/server.ts`) - composes `LiveTraceLayer + TraceSinkLive + WSTransportLayer`. `Bun.serve` upgrades `/traces/:scope/:id` to a WebSocket; on `open` each socket subscribes to the in-process `WsBroker` for its scope, on `close` it unsubscribes. `POST /run` kicks off a workflow.
- **Workflow** (`src/workflow.ts`) - identical to `demo-sse` so the UI render is comparable across transports.
- **Web** (`src/web/`) - opens a `WebSocket`, parses each message as a `TraceEvent[]` batch, dispatches into `getTraceStore()`.

### When to pick WS over SSE

- You want a single full-duplex channel so the client can send acks / replay cursors / control messages back.
- You're already terminating WebSockets at your edge (no separate `Content-Type: text/event-stream` plumbing).

### Companion examples

- [`../demo-sse`](../demo-sse) - same workflow over Server-Sent Events.
- [`../demo-durable-streams`](../demo-durable-streams) - same workflow durably persisted via [`@durable-streams/server`](https://durablestreams.com).
