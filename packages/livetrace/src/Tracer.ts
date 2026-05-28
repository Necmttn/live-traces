import type { Span } from "effect/Tracer";

/**
 * LiveTraceLayer — Effect Tracer decorator.
 *
 * Wraps whatever base tracer is in DefaultServices (native or OTel).
 * Intercepts span creation within `LiveTrace.withTrace()` scopes
 * and emits TraceEvents to a TraceSink.
 *
 * - Works standalone (no @effect/opentelemetry needed)
 * - Works alongside OTel (wraps the OTel tracer, both systems run)
 * - Zero FiberRef access in Tracer.span() — uses parent chain + attributes
 *
 * ## Layer composition: why ordering matters
 *
 * `Layer.setTracer` modifies the `currentServices` FiberRef — each call
 * overwrites the previous tracer. When composing via `Layer.provideMerge`,
 * the argument (`self`) is built FIRST. In a pipe chain:
 *
 * ```
 * X.pipe(Layer.provideMerge(A), Layer.provideMerge(B))
 * ```
 *
 * Build order: B (outermost self) → A (inner self) → X
 *
 * For LiveTraceLayer to wrap OTel's tracer, TelemetryLive must build
 * BEFORE LiveTraceLayer so that `Effect.tracerWith` captures the OTel
 * tracer. This means TelemetryLive must be OUTER (later in the pipe)
 * and LiveTraceLayer must be INNER (earlier in the pipe):
 *
 * ```ts
 * X.pipe(
 *   Layer.provideMerge(makeLiveTraceLayer()), // inner: builds 2nd, wraps OTel
 *   Layer.provideMerge(TelemetryLive),        // outer: builds 1st, sets OTel
 * )
 * ```
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";

import { TraceSink, type TraceSinkHandle } from "./Sink.js";
import { LIVE_TRACE, LIVE_TRACE_ID, LIVE_TRACE_SCOPE_ID, LIVE_TRACE_SCOPE_TYPE, type TraceScope } from "./types.js";
import { isWrappedSpan, shouldExclude, WrappedSpan } from "./WrappedSpan.js";

/**
 * Creates a LiveTraceLayer that wraps the current tracer.
 *
 * **Important**: This layer reads the current tracer from the FiberRef
 * at build time via `Effect.tracerWith`. For it to wrap the OTel tracer,
 * TelemetryLive (or any layer that calls `Layer.setTracer`) must be
 * built BEFORE this layer. In a `Layer.provideMerge` pipe chain, that
 * means TelemetryLive should appear AFTER (outer) this layer:
 *
 * @example
 * ```ts
 * const EnvLayer = ServerLive.pipe(
 *   Layer.provideMerge(ServicesLayer),
 *   // LiveTraceLayer BEFORE TelemetryLive in pipe = builds AFTER
 *   Layer.provideMerge(makeLiveTraceLayer()),
 *   // TelemetryLive AFTER in pipe = builds FIRST (sets OTel tracer)
 *   Layer.provideMerge(TelemetryLive),
 * )
 * ```
 */
export const LiveTraceLayer: Layer.Layer<never, never, TraceSink> = Layer.unwrapEffect(
    Effect.gen(function* () {
        // Capture the current tracer from DefaultServices FiberRef.
        // When composed correctly (TelemetryLive outer, us inner),
        // this captures the OTel tracer. When standalone, this
        // captures the native tracer.
        const baseTracer = yield* Effect.tracerWith(Effect.succeed);
        const sink = yield* TraceSink;

        const wrappedTracer = Tracer.make({
            span(name, parent, context, links, startTime, kind, options) {
                // Create the inner span via the base tracer (OTel or native)
                const innerSpan = baseTracer.span(name, parent, context, links, startTime, kind, options);

                // Should we exclude this span from live tracing?
                if (shouldExclude(options?.attributes)) {
                    return innerSpan;
                }

                // Check: is this the root of a live-traced scope?
                if (options?.attributes?.[LIVE_TRACE] === true) {
                    return createRootWrappedSpan(innerSpan, sink, options.attributes);
                }

                // Check: is the parent a WrappedSpan? (inside a traced scope)
                if (Option.isSome(parent) && isWrappedSpan(parent.value)) {
                    const parentWrapped = parent.value;
                    const wrapped = new WrappedSpan(innerSpan, sink, parentWrapped.liveTraceId, parentWrapped.liveScope);

                    // IMPORTANT: options.attributes (e.g. "ui.step") are applied by Effect
                    // AFTER tracer.span() returns. innerSpan.attributes is empty at this point.
                    // We must include options.attributes directly.
                    sink.emit({
                        _tag: "SpanStart",
                        traceId: parentWrapped.liveTraceId,
                        spanId: innerSpan.spanId,
                        parentSpanId: parentWrapped.spanId,
                        name,
                        attributes: { ...Object.fromEntries(innerSpan.attributes), ...options?.attributes },
                        timestamp: Date.now(),
                    });

                    return wrapped;
                }

                // Not in a traced scope — pass through unchanged
                return innerSpan;
            },

            context<X>(f: () => X, fiber: any): X {
                // Delegate context propagation to the base tracer.
                // This preserves OTel's OtelApi.context.with() behavior for
                // W3C traceparent header propagation.
                return baseTracer.context(f, fiber);
            },
        });

        return Layer.setTracer(wrappedTracer);
    }),
);

function createRootWrappedSpan(innerSpan: Span, sink: TraceSinkHandle, attributes: Record<string, unknown>): WrappedSpan {
    const traceId = attributes[LIVE_TRACE_ID] as string;
    const scope: TraceScope = {
        type: (attributes[LIVE_TRACE_SCOPE_TYPE] as TraceScope["type"]) ?? "user",
        id: (attributes[LIVE_TRACE_SCOPE_ID] as string) ?? "unknown",
    };

    // Emit TraceStart
    sink.emit({
        _tag: "TraceStart",
        traceId,
        label: (attributes["live-trace.label"] as string) ?? innerSpan.name,
        scope,
        timestamp: Date.now(),
    });

    // Emit SpanStart for the root span itself
    // Include attributes from the options — Effect applies them AFTER tracer.span() returns
    sink.emit({
        _tag: "SpanStart",
        traceId,
        spanId: innerSpan.spanId,
        name: innerSpan.name,
        attributes: { ...Object.fromEntries(innerSpan.attributes), ...attributes },
        timestamp: Date.now(),
    });

    const wrapped = new WrappedSpan(innerSpan, sink, traceId, scope);

    // Override end to also emit TraceEnd after SpanEnd
    const originalEnd = wrapped.end.bind(wrapped);
    wrapped.end = (endTime: bigint, exit: any) => {
        originalEnd(endTime, exit);

        const startTime = innerSpan.status._tag === "Ended" ? innerSpan.status.startTime : BigInt(0);
        const durationMs = Number(endTime - startTime) / 1_000_000;

        sink.emit({
            _tag: "TraceEnd",
            traceId,
            status: exit._tag === "Success" ? "completed" : "failed",
            durationMs,
            error: exit._tag === "Failure" ? String(exit.cause) : undefined,
            timestamp: Date.now(),
        });
    };

    return wrapped;
}
