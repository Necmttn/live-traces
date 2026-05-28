# Frontend

The store has three methods:

```ts
interface TraceStore {
    subscribe(listener: () => void): () => void
    getSnapshot(): Map<string, TraceState>
    dispatchBatch(events: TraceEvent[]): void
}
```

`useSyncExternalStore`-shaped. React hooks ship in the box; anything else binds in a few lines.

> The sub-export is called `livetrace/react` for historical reasons. The `TraceStore` class doesn't import React - only the hooks file does. Bundlers tree-shake the hooks for non-React consumers. For zero React in your dep graph, build your own store against `livetrace/types`.

## Connect a transport

```ts
import { getTraceStore } from "livetrace/react"
import type { TraceEvent } from "livetrace/types"

export function connectSse(scopeType: "user" | "team" | "org", scopeId: string) {
    const es = new EventSource(`/traces/${scopeType}/${encodeURIComponent(scopeId)}`)
    es.onmessage = (msg) => {
        const batch = JSON.parse(msg.data) as TraceEvent[]
        getTraceStore().dispatchBatch(batch)
    }
    return () => es.close()
}
```

WebSocket and Durable Streams versions live on [Transports](/docs/transports).

## React

```tsx
import { useActiveTraces, useTrace, useTraceSteps } from "livetrace/react"

function ActivityPanel() {
    const traces = useActiveTraces()
    return traces.map((t) => <TraceCard key={t.traceId} traceId={t.traceId} />)
}

function TraceCard({ traceId }: { traceId: string }) {
    const trace = useTrace(traceId)
    const steps = useTraceSteps(traceId)
    if (!trace) return null
    return (
        <div>
            <h3>{trace.label} · {trace.status}</h3>
            <ol>
                {steps.map((s) => (
                    <li key={s.spanId}>
                        {s.name} · {s.status}
                        {s.durationMs != null && ` · ${s.durationMs.toFixed(0)}ms`}
                    </li>
                ))}
            </ol>
        </div>
    )
}
```

`useActiveTraces` returns all live traces. `useTrace(id)` and `useTraceSteps(id)` are narrowed selectors. `useSpanTree(traceId)` gives the full nested span tree if you want it.

## Vue 3

```ts
import { onMounted, onUnmounted, ref } from "vue"
import { getTraceStore, type TraceState } from "livetrace/react"

export function useActiveTraces() {
    const traces = ref<TraceState[]>([])
    let unsub: (() => void) | undefined

    onMounted(() => {
        const store = getTraceStore()
        const sync = () => { traces.value = Array.from(store.getSnapshot().values()) }
        unsub = store.subscribe(sync)
        sync()
    })
    onUnmounted(() => unsub?.())

    return traces
}
```

## Svelte

```ts
import { readable } from "svelte/store"
import { getTraceStore } from "livetrace/react"

export const activeTraces = readable([], (set) => {
    const store = getTraceStore()
    const sync = () => set(Array.from(store.getSnapshot().values()))
    sync()
    return store.subscribe(sync)
})
```

```svelte
{#each $activeTraces as trace}
    <div>{trace.label} · {trace.status}</div>
{/each}
```

## Solid

```ts
import { from } from "solid-js"
import { getTraceStore } from "livetrace/react"

export const activeTraces = from<unknown[]>((set) => {
    const store = getTraceStore()
    const sync = () => set(Array.from(store.getSnapshot().values()))
    sync()
    return store.subscribe(sync)
})
```

## Vanilla

```ts
import { getTraceStore } from "livetrace/react"

const store = getTraceStore()

const render = () => {
    const ol = document.getElementById("traces")!
    ol.innerHTML = ""
    for (const trace of store.getSnapshot().values()) {
        const li = document.createElement("li")
        li.textContent = `${trace.label} · ${trace.status}`
        ol.appendChild(li)
    }
}

store.subscribe(render)
render()
```

## TraceState

```ts
interface TraceState {
    readonly traceId: string
    readonly label: string
    readonly scope: TraceScope
    readonly status: "running" | "completed" | "failed"
    readonly startedAt: number
    readonly durationMs?: number
    readonly error?: string
    readonly spans: Map<string, SpanNode>
    readonly steps: SpanNode[]
}

interface SpanNode {
    readonly spanId: string
    readonly name: string
    readonly status: "running" | "ok" | "error"
    readonly startedAt: number
    readonly durationMs?: number
    readonly attributes: Record<string, unknown>
    readonly events: SpanEventEntry[]
    readonly children: SpanNode[]
}
```
