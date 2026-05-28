/**
 * Durable TraceTransport - stub.
 *
 * Appends every batch to a pluggable durable log (Redis Streams, Cloudflare
 * Durable Objects, Postgres LISTEN/NOTIFY, NATS JetStream, etc.) so that
 * subscribers can resume from a cursor after a disconnect. The in-memory
 * impl here is enough for tests and demos; swap `DurableLog` for your
 * backend.
 *
 * ```ts
 * import { Layer } from "effect";
 * import { LiveTraceLayer, TraceSinkLive } from "livetrace";
 * import {
 *   DurableTransportLayer,
 *   getDurableLog,
 * } from "livetrace/transports/durable";
 *
 * const TraceLive = LiveTraceLayer.pipe(
 *   Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
 *   Layer.provide(DurableTransportLayer),
 * );
 *
 * // Resume from cursor on (re)connect:
 * app.get("/traces/:type/:id", async (req, res) => {
 *   const cursor = Number(req.headers["last-event-id"] ?? 0);
 *   const { entries, nextCursor } = await getDurableLog().readFrom(
 *     { type: req.params.type, id: req.params.id }, cursor,
 *   );
 *   for (const e of entries) res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e.events)}\n\n`);
 *   // ...keep streaming live tail from cursor=nextCursor
 * });
 * ```
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { TraceEvent, TraceScope } from "../types.js";

import { TraceTransportTag, type TraceTransport } from "../Sink.js";

export interface DurableEntry {
    readonly seq: number;
    readonly events: ReadonlyArray<TraceEvent>;
}

/**
 * In-memory durable log. Replace with Redis Streams / Cloudflare DO / etc.
 * Per-scope monotonic sequence. Bounded ring to keep the stub honest.
 */
export class DurableLog {
    private readonly perScope = new Map<string, DurableEntry[]>();
    private readonly scopeByTraceId = new Map<string, TraceScope>();
    private seqCounter = 0;

    constructor(readonly capacityPerScope: number = 1000) {}

    private key(scope: TraceScope): string {
        return `${scope.type}/${scope.id}`;
    }

    append(events: ReadonlyArray<TraceEvent>): void {
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
            const entry: DurableEntry = { seq: ++this.seqCounter, events: batch };
            const log = this.perScope.get(k) ?? [];
            log.push(entry);
            if (log.length > this.capacityPerScope) log.shift();
            this.perScope.set(k, log);
        }

        for (const e of events) {
            if (e._tag === "TraceEnd") this.scopeByTraceId.delete(e.traceId);
        }
    }

    /** Read all entries strictly after `cursor`. */
    readFrom(scope: TraceScope, cursor: number): { entries: DurableEntry[]; nextCursor: number } {
        const log = this.perScope.get(this.key(scope)) ?? [];
        const entries = log.filter((e) => e.seq > cursor);
        const nextCursor = entries.length > 0 ? entries[entries.length - 1]!.seq : cursor;
        return { entries, nextCursor };
    }

    entryCount(scope: TraceScope): number {
        return this.perScope.get(this.key(scope))?.length ?? 0;
    }
}

let _log: DurableLog | null = null;

export function getDurableLog(): DurableLog {
    if (!_log) _log = new DurableLog();
    return _log;
}

const durableTransport: TraceTransport = {
    send: (events) =>
        Effect.sync(() => {
            getDurableLog().append(events);
        }),
};

/** Effect Layer wiring the Durable transport into the trace sink. */
export const DurableTransportLayer: Layer.Layer<TraceTransportTag> = Layer.succeed(TraceTransportTag, durableTransport);
