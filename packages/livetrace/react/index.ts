/**
 * livetrace/react
 *
 * React store and hooks for consuming trace events.
 * Zero Effect dependency — works with any React 18+ app.
 *
 * Usage:
 * ```tsx
 * import { useActiveTraces, useTrace, useTraceSteps } from "livetrace/react"
 *
 * function ActivityPanel() {
 *   const traces = useActiveTraces()
 *   return traces.map(t => <TraceCard key={t.traceId} trace={t} />)
 * }
 *
 * function TraceCard({ trace }: { trace: TraceState }) {
 *   const steps = useTraceSteps(trace.traceId)
 *   return steps.map(s => <StepRow key={s.spanId} step={s} />)
 * }
 * ```
 */

// Store
export { TraceStore, getTraceStore } from "./store.js";
export type { TraceState, SpanNode, SpanEventEntry, TraceStatus } from "./store.js";

// Hooks
export { useActiveTraces, useTrace, useTraceSteps, useSpanTree } from "./hooks.js";

export { LIVE_TRACE_PROVIDER, LIVE_TRACE_SCOPE_TYPE, LIVE_TRACE_SCOPE_ID } from "../src/types.js";
