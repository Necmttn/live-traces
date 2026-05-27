/**
 * live-traces
 *
 * Real-time Effect span streaming to frontend UIs.
 *
 * Sub-exports:
 * - "live-traces"        — Effect Tracer decorator (this file)
 * - "live-traces/types"  — Plain TS types, zero deps
 * - "live-traces/react"  — React store + hooks, no Effect dep
 */

// Core tracer
export { LiveTraceLayer } from "./src/Tracer.js";

// User-facing API
export { withTrace, step, LiveSpanRef, type LiveTraceConfig } from "./src/LiveTrace.js";

// Logger (bridges Effect.log → SpanEvent inside traced scopes)
export { liveTraceLogger } from "./src/Logger.js";

// Sink + transport
export {
    TraceSink,
    TraceSinkLive,
    TraceTransportTag,
    ConsoleTransportLayer,
    type TraceTransport,
    type TraceSinkHandle,
    type TraceSinkConfig,
} from "./src/Sink.js";

// WrappedSpan (for advanced use / testing)
export { WrappedSpan, isWrappedSpan, LiveTraceSymbol } from "./src/WrappedSpan.js";

// Effect Schemas
export {
    TraceEventSchema,
    TraceStartSchema,
    SpanStartSchema,
    SpanEndSchema,
    SpanEventSchema,
    TraceEndSchema,
    TraceScopeSchema,
} from "./src/Schema.js";

// Re-export types for convenience
export type { TraceEvent, TraceStart, SpanStart, SpanEnd, SpanEvent, TraceEnd, TraceScope } from "./src/types.js";

export {
    UI_STEP,
    TRACE_INTERNAL,
    LIVE_TRACE,
    LIVE_TRACE_ID,
    LIVE_TRACE_LABEL,
    LIVE_TRACE_SCOPE_TYPE,
    LIVE_TRACE_SCOPE_ID,
    LIVE_TRACE_PROVIDER,
} from "./src/types.js";
