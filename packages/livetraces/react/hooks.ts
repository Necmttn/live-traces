/**
 * React hooks for consuming trace data.
 *
 * Uses useSyncExternalStore for tear-free reads from the TraceStore.
 * All hooks return STABLE references — derived data is computed in
 * useMemo to prevent infinite render loops.
 *
 * No Effect dependency — works with any React 18+ app.
 */
import { useMemo, useSyncExternalStore } from "react";

import type { SpanNode, TraceState } from "./store.js";

import { getTraceStore } from "./store.js";

/** Stable empty array to avoid creating new references */
const EMPTY_STEPS: SpanNode[] = [];

/**
 * Get the stable Map snapshot from the store.
 * This is the foundation for all hooks — the Map reference only changes
 * when the store is actually updated via dispatch().
 */
function useSnapshot() {
    const store = getTraceStore();
    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Subscribe to all active traces.
 * Returns traces sorted by startedAt descending.
 */
export function useActiveTraces(): TraceState[] {
    const snapshot = useSnapshot();
    return useMemo(() => Array.from(snapshot.values()).toSorted((a, b) => b.startedAt - a.startedAt), [snapshot]);
}

/**
 * Subscribe to a single trace by ID.
 * Returns undefined if the trace doesn't exist (yet).
 */
export function useTrace(traceId: string): TraceState | undefined {
    const snapshot = useSnapshot();
    return useMemo(() => snapshot.get(traceId), [snapshot, traceId]);
}

/**
 * Get the step spans (ui.step=true) for a trace, in chronological order.
 * These are the user-visible processing stages.
 */
export function useTraceSteps(traceId: string): SpanNode[] {
    const snapshot = useSnapshot();
    return useMemo(() => {
        const trace = snapshot.get(traceId);
        if (!trace) return EMPTY_STEPS;
        const steps = Array.from(trace.spans.values()).filter((s) => s.isStep);
        if (steps.length === 0) return EMPTY_STEPS;
        return steps.toSorted((a, b) => a.startedAt - b.startedAt);
    }, [snapshot, traceId]);
}

/**
 * Get the root span tree for a trace.
 * Returns the root SpanNode with nested children.
 */
export function useSpanTree(traceId: string): SpanNode | undefined {
    const snapshot = useSnapshot();
    return useMemo(() => {
        const trace = snapshot.get(traceId);
        if (!trace || !trace.rootSpanId) return undefined;
        return trace.spans.get(trace.rootSpanId);
    }, [snapshot, traceId]);
}
