/**
 * SSE TraceTransport - Server-Sent Events transport.
 *
 * Pushes batched trace events into an in-process broker. The broker fans
 * batches out to any number of subscribers (HTTP connections holding an
 * `EventSource`). Stream routing is per-`TraceScope` - a subscriber gets
 * only events for the scope it subscribed to.
 *
 * ```ts
 * import { Layer } from "effect";
 * import {
 *   LiveTraceLayer, TraceSinkLive,
 *   SSETransportLayer, getSseBroker,
 * } from "livetrace";
 *
 * // Server layer
 * const TraceLive = LiveTraceLayer.pipe(
 *   Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
 *   Layer.provide(SSETransportLayer),
 * );
 *
 * // HTTP handler
 * app.get("/traces/:scopeType/:scopeId", (req, res) => {
 *   res.setHeader("Content-Type", "text/event-stream");
 *   const unsubscribe = getSseBroker().subscribe(
 *     { type: req.params.scopeType, id: req.params.scopeId },
 *     (events) => res.write(`data: ${JSON.stringify(events)}\n\n`),
 *   );
 *   req.on("close", unsubscribe);
 * });
 * ```
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { TraceEvent, TraceScope } from "../types.js";

import { TraceTransportTag, type TraceTransport } from "../Sink.js";

type Subscriber = (events: ReadonlyArray<TraceEvent>) => void;

/**
 * In-process pub/sub broker. Routes trace events to subscribers keyed by
 * `scope.type/scope.id`. A subscriber for `team/abc` receives only events
 * for that team's traces.
 */
export class SseBroker {
    private readonly subscribers = new Map<string, Set<Subscriber>>();
    private readonly scopeByTraceId = new Map<string, TraceScope>();

    private key(scope: TraceScope): string {
        return `${scope.type}/${scope.id}`;
    }

    /** Subscribe to events for a specific scope. Returns an unsubscribe fn. */
    subscribe(scope: TraceScope, listener: Subscriber): () => void {
        const k = this.key(scope);
        let set = this.subscribers.get(k);
        if (!set) {
            set = new Set();
            this.subscribers.set(k, set);
        }
        set.add(listener);
        return () => {
            const s = this.subscribers.get(k);
            if (!s) return;
            s.delete(listener);
            if (s.size === 0) this.subscribers.delete(k);
        };
    }

    /** Publish a batch - fan out per scope. Called by the transport. */
    publish(events: ReadonlyArray<TraceEvent>): void {
        for (const e of events) {
            if (e._tag === "TraceStart") this.scopeByTraceId.set(e.traceId, e.scope);
        }

        const grouped = new Map<string, TraceEvent[]>();
        for (const e of events) {
            const scope = this.scopeByTraceId.get(e.traceId);
            if (!scope) continue;
            const k = this.key(scope);
            const arr = grouped.get(k) ?? [];
            arr.push(e);
            grouped.set(k, arr);
        }

        for (const [k, batch] of grouped) {
            const set = this.subscribers.get(k);
            if (!set) continue;
            for (const listener of set) {
                try {
                    listener(batch);
                } catch {
                    // Subscriber threw - keep the broker healthy.
                }
            }
        }

        for (const e of events) {
            if (e._tag === "TraceEnd") this.scopeByTraceId.delete(e.traceId);
        }
    }

    /** Active subscriber count for a scope (useful for tests / metrics). */
    subscriberCount(scope: TraceScope): number {
        return this.subscribers.get(this.key(scope))?.size ?? 0;
    }
}

let _broker: SseBroker | null = null;

/** Singleton broker. Same instance is used by transport + HTTP handlers. */
export function getSseBroker(): SseBroker {
    if (!_broker) _broker = new SseBroker();
    return _broker;
}

const sseTransport: TraceTransport = {
    send: (events) =>
        Effect.sync(() => {
            getSseBroker().publish(events);
        }),
};

/** Effect Layer wiring the SSE transport into the trace sink. */
export const SSETransportLayer: Layer.Layer<TraceTransportTag> = Layer.succeed(TraceTransportTag, sseTransport);
