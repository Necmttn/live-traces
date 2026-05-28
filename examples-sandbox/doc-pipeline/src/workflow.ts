/**
 * Doc pipeline pattern - Parse → Chunk → Embed → Index.
 *
 * The shape:
 *   - One outer `withTrace` scope per document.
 *   - Each pipeline stage is a `step()` - those are the rows the UI shows.
 *   - Per-item progress (pages, chunks, upserts) is emitted as SpanEvents
 *     with `ui.kind: "progress"`. Your UI reads `events.length` against
 *     `total` to render the progress bar.
 *   - `Effect.withSpan` inside each step carries metadata your ops
 *     dashboard wants (model, tokens, cost, db.system) without polluting
 *     the user-facing UI.
 *
 * Swap `Effect.sleep` for real I/O - a `pdf-parse` call, an OpenAI batch,
 * a pgvector upsert - and the same UI keeps rendering.
 */
import * as Effect from "effect/Effect";

import { step, withTrace } from "livetrace";

const sleep = (ms: number) => Effect.sleep(`${ms} millis`);

// ----------------------------------------------------------------------------
// Emit per-item progress events for the trace store
// ----------------------------------------------------------------------------

const emitProgress = (label: string, total: number, perItemMs: number) =>
    Effect.gen(function* () {
        for (let i = 1; i <= total; i++) {
            yield* sleep(perItemMs);
            yield* Effect.logInfo(`${label} ${i}/${total}`).pipe(
                Effect.annotateLogs({ "ui.kind": "progress", index: i, total }),
            );
        }
    });

// ----------------------------------------------------------------------------
// Stages
// ----------------------------------------------------------------------------

const parsePdf = (docId: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`opening ${docId}`);
        yield* Effect.withSpan(emitProgress("page", 12, 140), "pdf.parse");
        yield* Effect.logInfo("parsed 12 pages · 4 tables · 18,402 tokens");
    });

const chunkText = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("split · target=512 tok · overlap=64");
        yield* Effect.withSpan(emitProgress("chunk", 32, 40), "text.chunk");
        yield* Effect.logInfo("produced 32 chunks · avg 542 tok");
    });

const embedChunks = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("POST openai · batch=32");
        yield* Effect.withSpan(emitProgress("embed", 32, 70), "openai.embed", {
            attributes: {
                "llm.model": "text-embedding-3-small",
                "tokens.in": 32 * 542,
                "tokens.out": 32 * 1536,
                "cost.usd": 0.00065,
            },
        });
        yield* Effect.logInfo("embedded 32 chunks · 1536-dim");
    });

const indexVectors = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("connecting · pgvector://primary");
        yield* Effect.withSpan(emitProgress("upsert", 32, 30), "pgvector.upsert", {
            attributes: { "db.system": "pgvector" },
        });
        yield* Effect.logInfo("indexed 32 vectors · txn 0xa8f4");
    });

// ----------------------------------------------------------------------------
// Outer workflow
// ----------------------------------------------------------------------------

export interface PipelineOptions {
    readonly docId: string;
    readonly scopeId: string;
}

export const runWorkflow = ({ docId, scopeId }: PipelineOptions) =>
    Effect.gen(function* () {
        yield* step("Parse")(parsePdf(docId));
        yield* step("Chunk")(chunkText());
        yield* step("Embed")(embedChunks());
        yield* step("Index")(indexVectors());
    }).pipe(
        withTrace({
            traceId: `doc:${docId}:${Date.now()}`,
            label: `Processing ${docId}`,
            scope: { type: "user", id: scopeId },
        }),
    );
