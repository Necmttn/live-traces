# Concepts

Four parts: **scope** decides who sees events, **event** is the wire format, **sink** buffers, **transport** ships.

## TraceScope

Every trace is opened inside a `withTrace` block tagged with a scope:

```ts
{ type: "user" | "team" | "org", id: string }
```

The scope decides which subscribers receive events. One scope per user is the common shape for AI agents. The scope is encoded on `TraceStart`; later events are routed by `traceId` until the transport sees `TraceEnd`.

## TraceEvent

Discriminated union on `_tag`:

```ts
type TraceEvent =
    | TraceStart
    | SpanStart
    | SpanEnd
    | SpanEvent
    | TraceEnd
```

- `TraceStart` / `TraceEnd` - open and close the `withTrace` scope.
- `SpanStart` / `SpanEnd` - every `step` and `Effect.withSpan` inside.
- `SpanEvent` - `Effect.log*` calls (via `liveTraceLogger`).

The `livetrace/types` sub-export is dependency-free. Any backend (Go, Python, Rust) can emit the same JSON. Full schema: [`types.ts`](https://github.com/necmttn/livetrace/blob/main/packages/livetrace/src/types.ts).

## step()

```ts
step("Parse")(effect)
// ≡ Effect.withSpan("Parse", effect, { attributes: { "ui.step": true } })
```

The `ui.step` attribute is what `useTraceSteps` filters on. Anything else is still in the span tree - useful for telemetry, hidden from the user UI by default.

- `step` - what your user sees: Parse → Embed → Index.
- `Effect.withSpan` - what your ops dashboard sees: read-bytes, openai.embed, vector-store.upsert.

## TraceSink

`TraceSinkLive({ flushIntervalMs: 100 })` is a buffered queue. The `Tracer` pushes events; the sink flushes batches on the interval. You rarely interact with it directly - it exists so transports stay simple (one `send(events)` per batch).

## TraceTransport

```ts
interface TraceTransport {
    send: (events: ReadonlyArray<TraceEvent>) => Effect.Effect<void>
}
```

Built-ins:

| Layer | Use case |
| --- | --- |
| `SSETransportLayer` | One-way, simplest. |
| `WSTransportLayer` | Full-duplex; client can talk back. |
| `DurableStreamsTransportLayer` | Resumable, multi-pod-safe. |

Write your own by implementing the interface - see [Transports](/docs/transports).

## Frontend store

```ts
interface TraceStore {
    subscribe(listener: () => void): () => void
    getSnapshot(): Map<string, TraceState>
    dispatchBatch(events: TraceEvent[]): void
}
```

`useSyncExternalStore`-shaped. React hooks ship in the box; Vue / Svelte / Solid / vanilla bindings are a few lines.

## OpenTelemetry

`LiveTraceLayer` wraps the current tracer instead of replacing it. Build OTel outermost:

```ts
const Env = ServerLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provideMerge(LiveTraceLayer),  // inner: wraps OTel
    Layer.provideMerge(TelemetryLive),   // outer: sets OTel tracer first
)
```

OTel gets every span; livetrace additionally streams the spans inside `withTrace` scopes. No double-export. See [OpenTelemetry](/docs/integrations/opentelemetry).
