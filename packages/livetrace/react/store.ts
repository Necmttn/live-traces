/**
 * Trace Store — Reactive store for live trace events.
 *
 * Reduces a stream of TraceEvents into a tree of SpanNodes per trace.
 * Framework-agnostic core — uses useSyncExternalStore for React binding.
 *
 * No Effect dependency. Consumes plain TraceEvent JSON from any source.
 */
import type { TraceEvent, TraceStart, SpanStart, SpanEnd, SpanEvent, TraceEnd, TraceScope } from "../src/types.js";

// ============================================================================
// Types
// ============================================================================

export type TraceStatus = "running" | "completed" | "failed";

export interface SpanEventEntry {
    readonly name: string;
    readonly level?: string;
    readonly attributes?: Record<string, unknown>;
    readonly timestamp: number;
}

export interface SpanNode {
    readonly spanId: string;
    readonly parentSpanId?: string;
    readonly name: string;
    readonly status: "running" | "ok" | "error";
    readonly attributes: Record<string, unknown>;
    readonly events: SpanEventEntry[];
    readonly children: SpanNode[];
    readonly startedAt: number;
    readonly durationMs?: number;
    /** True if this span has ui.step attribute */
    readonly isStep: boolean;
}

export interface TraceState {
    readonly traceId: string;
    readonly label: string;
    readonly scope: TraceScope;
    readonly status: TraceStatus;
    readonly rootSpanId?: string;
    readonly spans: Map<string, SpanNode>;
    readonly startedAt: number;
    readonly completedAt?: number;
    readonly durationMs?: number;
    readonly error?: string;
    readonly updatedAt: number;
}

// ============================================================================
// Store
// ============================================================================

/** TTL for completed traces before eviction (ms) */
const COMPLETED_TTL_MS = 30_000;

/** Maximum events per span */
const MAX_SPAN_EVENTS = 50;

/** Replay filter: skip events older than 30 minutes */
const REPLAY_MAX_AGE_MS = 30 * 60 * 1000;

type Listener = () => void;

export class TraceStore {
    private traces = new Map<string, TraceState>();
    private listeners = new Set<Listener>();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.cleanupTimer = setInterval(() => this.cleanup(), 5_000);
    }

    /** Subscribe to store changes (for useSyncExternalStore) */
    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Get snapshot (for useSyncExternalStore) */
    getSnapshot = (): Map<string, TraceState> => this.traces;

    /** Dispatch a single trace event */
    dispatch(event: TraceEvent): void {
        // Skip ancient events on replay
        if (Date.now() - event.timestamp > REPLAY_MAX_AGE_MS) return;

        switch (event._tag) {
            case "TraceStart":
                this.handleTraceStart(event);
                break;
            case "SpanStart":
                this.handleSpanStart(event);
                break;
            case "SpanEnd":
                this.handleSpanEnd(event);
                break;
            case "SpanEvent":
                this.handleSpanEvent(event);
                break;
            case "TraceEnd":
                this.handleTraceEnd(event);
                break;
        }

        this.notify();
    }

    /** Dispatch a batch of events */
    dispatchBatch(events: TraceEvent[]): void {
        for (const event of events) {
            // Inline without notify per event
            if (Date.now() - event.timestamp > REPLAY_MAX_AGE_MS) continue;
            switch (event._tag) {
                case "TraceStart":
                    this.handleTraceStart(event);
                    break;
                case "SpanStart":
                    this.handleSpanStart(event);
                    break;
                case "SpanEnd":
                    this.handleSpanEnd(event);
                    break;
                case "SpanEvent":
                    this.handleSpanEvent(event);
                    break;
                case "TraceEnd":
                    this.handleTraceEnd(event);
                    break;
            }
        }
        this.notify();
    }

    /** Get a single trace */
    getTrace(traceId: string): TraceState | undefined {
        return this.traces.get(traceId);
    }

    /** Get all traces as array, sorted by startedAt descending */
    getAllTraces(): TraceState[] {
        return Array.from(this.traces.values()).toSorted((a, b) => b.startedAt - a.startedAt);
    }

    /** Get step spans (ui.step=true) for a trace, in order */
    getSteps(traceId: string): SpanNode[] {
        const trace = this.traces.get(traceId);
        if (!trace) return [];
        return Array.from(trace.spans.values())
            .filter((s) => s.isStep)
            .toSorted((a, b) => a.startedAt - b.startedAt);
    }

    /** Build the span tree for a trace */
    getSpanTree(traceId: string): SpanNode | undefined {
        const trace = this.traces.get(traceId);
        if (!trace || !trace.rootSpanId) return undefined;
        return trace.spans.get(trace.rootSpanId);
    }

    /** Destroy the store (stop cleanup timer) */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.listeners.clear();
    }

    // -- Event handlers --

    private handleTraceStart(event: TraceStart): void {
        const existing = this.traces.get(event.traceId);
        if (existing) return; // idempotent

        this.traces = new Map(this.traces);
        this.traces.set(event.traceId, {
            traceId: event.traceId,
            label: event.label,
            scope: event.scope,
            status: "running",
            spans: new Map(),
            startedAt: event.timestamp,
            updatedAt: event.timestamp,
        });
    }

    private handleSpanStart(event: SpanStart): void {
        const trace = this.traces.get(event.traceId);
        if (!trace) return;

        const span: SpanNode = {
            spanId: event.spanId,
            parentSpanId: event.parentSpanId,
            name: event.name,
            status: "running",
            attributes: event.attributes,
            events: [],
            children: [],
            startedAt: event.timestamp,
            isStep: event.attributes["ui.step"] === true,
        };

        const newSpans = new Map(trace.spans);
        newSpans.set(event.spanId, span);

        // Add as child of parent span
        if (event.parentSpanId) {
            const parent = newSpans.get(event.parentSpanId);
            if (parent) {
                newSpans.set(event.parentSpanId, {
                    ...parent,
                    children: [...parent.children, span],
                });
            }
        }

        this.traces = new Map(this.traces);
        this.traces.set(event.traceId, {
            ...trace,
            spans: newSpans,
            rootSpanId: trace.rootSpanId ?? event.spanId,
            updatedAt: event.timestamp,
        });
    }

    private handleSpanEnd(event: SpanEnd): void {
        const trace = this.traces.get(event.traceId);
        if (!trace) return;

        const span = trace.spans.get(event.spanId);
        if (!span) return;

        const newSpans = new Map(trace.spans);
        const updatedSpan = {
            ...span,
            status: event.status as "ok" | "error",
            durationMs: event.durationMs,
        };
        newSpans.set(event.spanId, updatedSpan);

        // Update in parent's children array too
        if (span.parentSpanId) {
            const parent = newSpans.get(span.parentSpanId);
            if (parent) {
                newSpans.set(span.parentSpanId, {
                    ...parent,
                    children: parent.children.map((c) => (c.spanId === event.spanId ? updatedSpan : c)),
                });
            }
        }

        this.traces = new Map(this.traces);
        this.traces.set(event.traceId, {
            ...trace,
            spans: newSpans,
            updatedAt: event.timestamp,
        });
    }

    private handleSpanEvent(event: SpanEvent): void {
        const trace = this.traces.get(event.traceId);
        if (!trace) return;

        const span = trace.spans.get(event.spanId);
        if (!span) return;

        const entry: SpanEventEntry = {
            name: event.name,
            level: event.level,
            attributes: event.attributes,
            timestamp: event.timestamp,
        };

        const newEvents = span.events.length >= MAX_SPAN_EVENTS ? [...span.events.slice(-MAX_SPAN_EVENTS + 1), entry] : [...span.events, entry];

        const newSpans = new Map(trace.spans);
        newSpans.set(event.spanId, { ...span, events: newEvents });

        this.traces = new Map(this.traces);
        this.traces.set(event.traceId, {
            ...trace,
            spans: newSpans,
            updatedAt: event.timestamp,
        });
    }

    private handleTraceEnd(event: TraceEnd): void {
        const trace = this.traces.get(event.traceId);
        if (!trace) return;

        // Close any still-running spans (handles lost SpanEnd events)
        const finalStatus = event.status === "completed" ? ("ok" as const) : ("error" as const);
        let newSpans = trace.spans;
        let hasRunningSpans = false;
        for (const span of trace.spans.values()) {
            if (span.status === "running") {
                hasRunningSpans = true;
                break;
            }
        }
        if (hasRunningSpans) {
            newSpans = new Map(trace.spans);
            for (const [id, span] of newSpans) {
                if (span.status === "running") {
                    newSpans.set(id, { ...span, status: finalStatus, durationMs: event.timestamp - span.startedAt });
                }
            }
        }

        this.traces = new Map(this.traces);
        this.traces.set(event.traceId, {
            ...trace,
            spans: newSpans,
            status: event.status === "completed" ? "completed" : "failed",
            completedAt: event.timestamp,
            durationMs: event.durationMs,
            error: event.error,
            updatedAt: event.timestamp,
        });
    }

    private cleanup(): void {
        const now = Date.now();
        let changed = false;

        for (const [traceId, trace] of this.traces) {
            if (trace.completedAt && now - trace.completedAt > COMPLETED_TTL_MS) {
                if (!changed) {
                    this.traces = new Map(this.traces);
                    changed = true;
                }
                this.traces.delete(traceId);
            }
        }

        if (changed) this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

/** Singleton store instance */
let _store: TraceStore | null = null;

export function getTraceStore(): TraceStore {
    if (!_store) {
        _store = new TraceStore();
    }
    return _store;
}
