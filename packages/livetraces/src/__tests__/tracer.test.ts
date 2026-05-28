import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import type { TraceEvent } from "../types.js";

import { withTrace, step } from "../LiveTrace.js";
import { TraceSinkLive, TraceTransportTag } from "../Sink.js";
import { LiveTraceLayer } from "../Tracer.js";

/**
 * Creates a test transport that collects events in an array.
 * Returns the layer and a reference to the collected events.
 */
function makeTestTransport() {
    const events: TraceEvent[] = [];
    const transport = {
        send: (batch: ReadonlyArray<TraceEvent>) =>
            Effect.sync(() => {
                events.push(...batch);
            }),
    };
    const layer = Layer.succeed(TraceTransportTag, transport);
    return { events, layer };
}

/**
 * Helper: build the full test layer (TraceSink + LiveTraceLayer)
 * with a zero-interval flush for deterministic tests.
 */
function makeTestLayer(transportLayer: Layer.Layer<TraceTransportTag>) {
    const sinkLayer = TraceSinkLive({ flushIntervalMs: 10 }).pipe(Layer.provide(transportLayer));
    const traceLayer = LiveTraceLayer.pipe(Layer.provide(sinkLayer));
    return Layer.merge(sinkLayer, traceLayer);
}

describe("LiveTraceLayer", () => {
    it("captures TraceStart, SpanStart, SpanEnd, TraceEnd for a traced scope", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = withTrace({
            traceId: "test:123",
            label: "Test Workflow",
            scope: { type: "team", id: "team-1" },
        })(Effect.void);

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                // Give flush daemon time to fire
                Effect.tap(() => Effect.sleep("50 millis")),
            ),
        );

        const tags = events.map((e) => e._tag);
        expect(tags).toContain("TraceStart");
        expect(tags).toContain("SpanStart");
        expect(tags).toContain("SpanEnd");
        expect(tags).toContain("TraceEnd");

        // Verify TraceStart has correct metadata
        const traceStart = events.find((e) => e._tag === "TraceStart");
        expect(traceStart).toMatchObject({
            _tag: "TraceStart",
            traceId: "test:123",
            label: "Test Workflow",
            scope: { type: "team", id: "team-1" },
        });

        // Verify TraceEnd
        const traceEnd = events.find((e) => e._tag === "TraceEnd");
        expect(traceEnd).toMatchObject({
            _tag: "TraceEnd",
            traceId: "test:123",
            status: "completed",
        });
    });

    it("captures nested child spans with parent-child relationships", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = withTrace({
            traceId: "test:nested",
            label: "Nested Test",
            scope: { type: "team", id: "team-1" },
        })(
            Effect.gen(function* () {
                yield* Effect.withSpan(Effect.void, "child-1");
                yield* Effect.withSpan(Effect.void, "child-2");
            }),
        );

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                Effect.tap(() => Effect.sleep("50 millis")),
            ),
        );

        const spanStarts = events.filter((e) => e._tag === "SpanStart");
        const spanEnds = events.filter((e) => e._tag === "SpanEnd");

        // Root span + 2 children = 3 SpanStarts
        expect(spanStarts.length).toBe(3);
        expect(spanEnds.length).toBe(3);

        // Children should reference root's spanId as parentSpanId
        const rootSpan = spanStarts.find((e) => e._tag === "SpanStart" && e.name === "Nested Test");
        const child1 = spanStarts.find((e) => e._tag === "SpanStart" && e.name === "child-1");
        const child2 = spanStarts.find((e) => e._tag === "SpanStart" && e.name === "child-2");

        expect(rootSpan).toBeDefined();
        expect(child1).toBeDefined();
        expect(child2).toBeDefined();

        if (child1?._tag === "SpanStart" && rootSpan?._tag === "SpanStart") {
            expect(child1.parentSpanId).toBe(rootSpan.spanId);
        }
        if (child2?._tag === "SpanStart" && rootSpan?._tag === "SpanStart") {
            expect(child2.parentSpanId).toBe(rootSpan.spanId);
        }
    });

    it("captures Effect.log calls as SpanEvents via built-in tracerLogger", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = withTrace({
            traceId: "test:logs",
            label: "Log Test",
            scope: { type: "team", id: "team-1" },
        })(
            Effect.gen(function* () {
                yield* Effect.logInfo("Hello from traced scope");
                yield* Effect.logWarning("A warning");
            }),
        );

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                Effect.tap(() => Effect.sleep("50 millis")),
            ),
        );

        const spanEvents = events.filter((e) => e._tag === "SpanEvent");
        expect(spanEvents.length).toBeGreaterThanOrEqual(2);

        const infoEvent = spanEvents.find((e) => e._tag === "SpanEvent" && e.name.includes("Hello from traced scope"));
        expect(infoEvent).toBeDefined();
    });

    it("does not capture spans outside a traced scope", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = Effect.withSpan(Effect.void, "outside-span");

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                Effect.tap(() => Effect.sleep("50 millis")),
            ),
        );

        // No trace events should be emitted
        expect(events.length).toBe(0);
    });

    it("LiveTrace.step creates ui.step attributed spans", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = withTrace({
            traceId: "test:steps",
            label: "Step Test",
            scope: { type: "team", id: "team-1" },
        })(
            Effect.gen(function* () {
                yield* step("Parsing")(Effect.void);
                yield* step("Embedding")(Effect.void);
            }),
        );

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                Effect.tap(() => Effect.sleep("50 millis")),
            ),
        );

        const spanStarts = events.filter((e) => e._tag === "SpanStart");
        const parsingSpan = spanStarts.find((e) => e._tag === "SpanStart" && e.name === "Parsing");
        const embeddingSpan = spanStarts.find((e) => e._tag === "SpanStart" && e.name === "Embedding");

        expect(parsingSpan).toBeDefined();
        expect(embeddingSpan).toBeDefined();
    });

    it("handles failed traces correctly", async () => {
        const { events, layer: transportLayer } = makeTestTransport();
        const testLayer = makeTestLayer(transportLayer);

        const program = withTrace({
            traceId: "test:fail",
            label: "Fail Test",
            scope: { type: "team", id: "team-1" },
        })(Effect.fail("boom"));

        await Effect.runPromise(
            program.pipe(
                Effect.provide(testLayer),
                Effect.scoped,
                Effect.tap(() => Effect.sleep("50 millis")),
                Effect.catchAll(() => Effect.void),
            ),
        );

        const traceEnd = events.find((e) => e._tag === "TraceEnd");
        expect(traceEnd).toMatchObject({
            _tag: "TraceEnd",
            traceId: "test:fail",
            status: "failed",
        });

        const spanEnd = events.find((e) => e._tag === "SpanEnd");
        expect(spanEnd).toMatchObject({
            status: "error",
        });
    });
});
