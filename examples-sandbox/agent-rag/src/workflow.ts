/**
 * RAG agent pattern - Plan → Retrieve → Rerank → Generate.
 *
 * The shape:
 *   - One outer `withTrace` scope per agent run, keyed on the user's query.
 *   - `step("Plan" | "Retrieve" | "Rerank" | "Generate")` marks each user-
 *     visible stage. The store filters on `ui.step: true` to render them
 *     as the four pipeline cards.
 *   - Inside each step, `Effect.withSpan` wraps the actual model / DB call
 *     and carries the metadata your UI shows as chips (model, tokens, cost).
 *   - `Effect.logInfo` calls inside the scope become `SpanEvent`s on the
 *     active step - they appear in the live log console.
 *
 * No real models / DB - just `Effect.sleep` standing in for I/O. Swap in
 * your real `openai.chat`, `pgvector.search`, etc. and the same UI renders.
 */
import * as Effect from "effect/Effect";

import { step, withTrace } from "livetrace";

const sleep = (ms: number) => Effect.sleep(`${ms} millis`);

// ----------------------------------------------------------------------------
// Stages
// ----------------------------------------------------------------------------

const plan = (query: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`decompose · "${query.slice(0, 48)}"`);
        yield* Effect.withSpan(sleep(420), "llm.chat", {
            attributes: {
                "llm.model": "gpt-5-mini",
                "tokens.in": 96,
                "tokens.out": 52,
                "cost.usd": 0.00018,
            },
        });
        yield* Effect.logInfo("plan ready · 3 sub-queries · routing to retriever");
    });

const retrieve = (query: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo("pgvector.search · k=18 · namespace=docs");
        yield* Effect.withSpan(sleep(120), "embed.query", {
            attributes: { "llm.model": "text-embedding-3-small", "agent.query": query },
        });
        yield* Effect.withSpan(sleep(780), "pgvector.search", {
            attributes: { "db.system": "pgvector", k: 18 },
        });
        yield* Effect.logInfo("returned 18 candidates · max score 0.94");
    });

const rerank = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("rerank · 18 → 6 · model=cohere/rerank-3");
        yield* Effect.withSpan(sleep(780), "cohere.rerank", {
            attributes: {
                "llm.model": "cohere/rerank-3",
                "tokens.in": 8640,
                "tokens.out": 6,
                "cost.usd": 0.00027,
            },
        });
        yield* Effect.logInfo("top-6 selected · spread 0.93→0.69");
    });

const generate = (query: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo("claude-opus-4-7 · TTFT 312ms · streaming");
        yield* Effect.withSpan(sleep(2200), "llm.generate", {
            attributes: {
                "llm.model": "claude-opus-4-7",
                "tokens.in": 1840,
                "tokens.out": 380,
                "cost.usd": 0.01032,
                "agent.query": query,
            },
        });
        yield* Effect.logInfo("complete · 380 tokens · stop=end_turn");
    });

// ----------------------------------------------------------------------------
// Outer workflow
// ----------------------------------------------------------------------------

export interface AgentOptions {
    readonly query: string;
    readonly scopeId: string;
}

export const runWorkflow = ({ query, scopeId }: AgentOptions) =>
    Effect.gen(function* () {
        yield* step("Plan")(plan(query));
        yield* step("Retrieve")(retrieve(query));
        yield* step("Rerank")(rerank());
        yield* step("Generate")(generate(query));
    }).pipe(
        withTrace({
            traceId: `agent:${Date.now()}`,
            label: `agent · ${query}`,
            scope: { type: "user", id: scopeId },
        }),
    );
