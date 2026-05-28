# Overview

`livetrace` streams [Effect](https://effect.website) tracer spans to your UI as they happen. Wrap a workflow in `withTrace`, render with `livetrace/react` (or Vue / Svelte / Solid / vanilla bindings - the store is framework-agnostic), and the user sees every span - start, end, log event - live.

It's the second sink for the same span data your observability stack already collects. OTel is for ops dashboards; `livetrace` is for the panel your user actually looks at.

## Read this next

- [Quickstart](/docs/quickstart) - install to working trace in five minutes.
- [Concepts](/docs/concepts) - `TraceScope`, `TraceEvent`, sink + transport.
- [Transports](/docs/transports) - SSE, WebSocket, Durable Streams.
- [Frontend](/docs/frontend) - React, Vue, Svelte, Solid, vanilla.
- [OpenTelemetry](/docs/integrations/opentelemetry) - compose without double-export.
- [Durable Streams](/docs/integrations/durable-streams) - resumable, multi-pod.

## Examples

```bash
git clone https://github.com/necmttn/livetrace
bun install
bun demo:sse   # or demo:ws, demo:ds
```

Three runnable backends + UIs, one per transport, [`examples/`](https://github.com/necmttn/livetrace/tree/main/examples).
