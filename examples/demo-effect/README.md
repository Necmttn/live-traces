# demo-effect

Runnable end-to-end example. Bun HTTP server runs a fake document-processing Effect workflow that's wrapped in `withTrace`. Spans stream over SSE to a Vite-served React frontend that uses `livetraces/react` to render them.

```bash
bun install     # at the repo root
bun demo        # runs both server (:8787) + web (:5173)
```

Open http://localhost:5173. Click **Run successful workflow** or **Run failing workflow** and watch the cards populate live.

### What this shows

- **Server** (`src/server.ts`) - composes `LiveTraceLayer + TraceSinkLive + SSETransportLayer` and exposes `/traces/:scope/:id` (SSE) and `POST /run` (kicks off a workflow). The in-process `SseBroker` fans events out per-scope.
- **Workflow** (`src/workflow.ts`) - uses `withTrace` + `step` to mark user-visible stages. Uses `Effect.withSpan` for fine-grained child spans inside each step. `Effect.log` calls become `SpanEvent`s thanks to `liveTraceLogger`.
- **Web** (`src/web/`) - opens an `EventSource`, dispatches batches into `getTraceStore()`, renders with `useActiveTraces` + `useTrace` + `useTraceSteps`.
