# OpenTelemetry

OTel and `livetrace` aren't competitors - same span data, different sinks. OTel is for ops dashboards; `livetrace` for user-facing UIs. One line of layer composition wires both.

## Compose

```ts
const Env = ServerLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provideMerge(LiveTraceLayer),  // inner: wraps OTel
    Layer.provideMerge(TelemetryLive),   // outer: sets OTel tracer first
)
```

Effect's `Tracer` is layer-scoped. OTel outermost sets the tracer first; `LiveTraceLayer` wraps whatever's in scope. OTel receives every span. `livetrace` annotates the spans inside `withTrace` scopes and forwards them to the sink. No double-export.

## Full setup

OTel via `@effect/opentelemetry`:

```ts
import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"

const TelemetryLive = NodeSdk.layer(() => ({
    resource: { serviceName: "my-app" },
    spanProcessor: new BatchSpanProcessor(
        new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT }),
    ),
}))
```

`livetrace` on top:

```ts
import { Logger } from "effect"
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

const Env = ServerLive.pipe(
    Layer.provideMerge(ServicesLive),
    Layer.provideMerge(LoggerLive),
    Layer.provideMerge(TraceLive),       // wraps OTel
    Layer.provideMerge(TelemetryLive),   // outermost
)
```

## What sees what

| | OTel | livetrace |
| --- | --- | --- |
| `withTrace` outer span | ✓ | ✓ |
| `step()` inside `withTrace` | ✓ | ✓ |
| `Effect.withSpan` inside `withTrace` | ✓ | ✓ |
| `Effect.withSpan` **outside** `withTrace` | ✓ | ✗ |
| `Effect.log*` inside `withTrace` | ✓ | ✓ |
| Effects outside `withTrace` | ✓ | ✗ |

`livetrace` only forwards what's inside a `withTrace` scope. Deliberate - your collector wants everything; your user only wants the part they opened.

## Logger

`liveTraceLogger` translates Effect's logger calls into `SpanEvent`s on the active span. If you've already replaced the default logger, compose with `Logger.zip`:

```ts
import { Logger } from "effect"
import { liveTraceLogger } from "livetrace"

const composed = Logger.zip(myJsonLogger, liveTraceLogger)
const LoggerLive = Logger.replaceScoped(Logger.defaultLogger, Effect.succeed(composed))
```

## Attributes

| Attribute | Value |
| --- | --- |
| `live-trace` | `true` (on the outer scope's root span) |
| `live-trace.id` | the `traceId` you passed to `withTrace` |
| `live-trace.label` | the `label` you passed to `withTrace` |
| `live-trace.scope.type` | `"user" \| "team" \| "org"` |
| `live-trace.scope.id` | the scope's id |
| `ui.step` | `true` on every `step("...")(...)` span |

Search `live-trace.id` in your OTel backend to correlate a user's live UI with the ops trace.

## FAQ

**OTel required?** No. `LiveTraceLayer` works with Effect's default tracer.

**Will sampling drop user-facing spans?** OTel sampling is at the SDK level. The user-facing trace doesn't care, but tail-sampling drops ops visibility for sampled-out users. Most teams head-sample at the receiver.

**Can I correlate with OTel trace ID?** Yes - `live-trace.id` carries your `traceId`. The OTel-generated trace ID is on `Effect.currentSpan`.
