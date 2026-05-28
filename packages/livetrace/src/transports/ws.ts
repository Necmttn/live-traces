/**
 * WebSocket TraceTransport - stub.
 *
 * Mirrors the SSE broker shape but expects a `ws`-style server. Fan-out by
 * `TraceScope` is identical to SSE; the only difference is the framing the
 * subscriber writes. Full duplex lets the client send acks / replay cursors
 * back over the same connection (useful with a durable backend).
 *
 * ```ts
 * import { Layer } from "effect";
 * import { LiveTraceLayer, TraceSinkLive } from "livetrace";
 * import { WSTransportLayer, getWsBroker } from "livetrace/transports/ws";
 *
 * const TraceLive = LiveTraceLayer.pipe(
 *   Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
 *   Layer.provide(WSTransportLayer),
 * );
 *
 * wss.on("connection", (socket, req) => {
 *   const scope = parseScope(req.url);
 *   const off = getWsBroker().subscribe(scope, (events) =>
 *     socket.send(JSON.stringify(events)),
 *   );
 *   socket.on("close", off);
 * });
 * ```
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { TraceEvent, TraceScope } from "../types.js";

import { TraceTransportTag, type TraceTransport } from "../Sink.js";

type Subscriber = (events: ReadonlyArray<TraceEvent>) => void;

/** In-process pub/sub broker for WebSocket subscribers. */
export class WsBroker {
    private readonly subscribers = new Map<string, Set<Subscriber>>();
    private readonly scopeByTraceId = new Map<string, TraceScope>();

    private key(scope: TraceScope): string {
        return `${scope.type}/${scope.id}`;
    }

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
                    // Subscriber threw - keep broker healthy.
                }
            }
        }

        for (const e of events) {
            if (e._tag === "TraceEnd") this.scopeByTraceId.delete(e.traceId);
        }
    }

    subscriberCount(scope: TraceScope): number {
        return this.subscribers.get(this.key(scope))?.size ?? 0;
    }
}

let _broker: WsBroker | null = null;

export function getWsBroker(): WsBroker {
    if (!_broker) _broker = new WsBroker();
    return _broker;
}

const wsTransport: TraceTransport = {
    send: (events) =>
        Effect.sync(() => {
            getWsBroker().publish(events);
        }),
};

/** Effect Layer wiring the WS transport into the trace sink. */
export const WSTransportLayer: Layer.Layer<TraceTransportTag> = Layer.succeed(TraceTransportTag, wsTransport);
