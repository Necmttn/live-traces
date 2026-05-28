/**
 * Demo Effect workflow - fake document processing pipeline.
 *
 * The shape is realistic: an outer trace scope, several user-visible steps,
 * nested child spans inside each step, and a few `Effect.log` calls that
 * become SpanEvents in the trace UI. No real I/O - just `Effect.sleep`.
 */
import * as Effect from "effect/Effect";

import { step, withTrace } from "livetrace";

const sleep = (ms: number) => Effect.sleep(`${ms} millis`);

const parsePdf = (docId: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`opening ${docId}.pdf`);
        yield* Effect.withSpan(sleep(180), "read-bytes");
        yield* Effect.withSpan(sleep(220), "extract-text");
        yield* Effect.logInfo("parsed 12 pages, 4 tables");
    });

const embedChunks = (docId: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo("splitting into chunks");
        yield* Effect.withSpan(sleep(120), "chunk");
        yield* Effect.withSpan(sleep(380), "openai.embed", {
            attributes: { "embeddings.model": "text-embedding-3-small", "embeddings.batch": 32 },
        });
        yield* Effect.logInfo(`embedded 32 chunks for ${docId}`);
    });

const indexVectors = () =>
    Effect.gen(function* () {
        yield* Effect.withSpan(sleep(150), "vector-store.upsert", {
            attributes: { "db.system": "pgvector" },
        });
        yield* Effect.logInfo("upsert ok");
    });

const finalize = () =>
    Effect.gen(function* () {
        yield* Effect.withSpan(sleep(80), "publish-event");
        yield* Effect.logInfo("workflow complete");
    });

export interface DemoOptions {
    readonly docId: string;
    readonly scopeId: string;
    /** When true, throws after embedding to demo the failed-trace UI. */
    readonly fail?: boolean;
}

export const runWorkflow = ({ docId, scopeId, fail = false }: DemoOptions) =>
    Effect.gen(function* () {
        yield* step("Parse")(parsePdf(docId));
        yield* step("Embed")(embedChunks(docId));
        if (fail) {
            yield* Effect.logError("simulated index failure");
            return yield* Effect.fail(new Error("vector-store unreachable"));
        }
        yield* step("Index")(indexVectors());
        yield* step("Finalize")(finalize());
    }).pipe(
        withTrace({
            traceId: `doc:${docId}:${Date.now()}`,
            label: `Processing ${docId}`,
            scope: { type: "user", id: scopeId },
        }),
    );
