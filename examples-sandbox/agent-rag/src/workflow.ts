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
 *   - Per-chunk and per-token events are emitted as `Effect.logInfo` with
 *     `Effect.annotateLogs({ "ui.kind": "chunk" | "answer.token", ... })` -
 *     `liveTraceLogger` turns each into a SpanEvent on the active step, so
 *     the UI streams chunks under Retrieve/Rerank and tokens into the
 *     answer panel.
 *
 * No real models / DB - just `Effect.sleep` standing in for I/O. Swap in
 * your real `openai.chat`, `pgvector.search`, etc. and the same UI renders.
 */
import * as Effect from "effect/Effect";

import { step, withTrace } from "livetrace";

const sleep = (ms: number) => Effect.sleep(`${ms} millis`);

// ----------------------------------------------------------------------------
// Demo data
// ----------------------------------------------------------------------------

const CORPUS: ReadonlyArray<string> = [
    "Q3 revenue reached $4.2M, up 28% YoY. Net new ARR closed at $1.1M, slightly behind the $1.3M target.",
    "Mid-market outperformed plan by 14%, while enterprise pipeline coverage tightened from 3.1× to 2.4×.",
    "Engineering shipped 14 new features this quarter including the livetrace public API and cross-region failover.",
    "We onboarded six engineers in October across platform + growth. Promotion review concluded last week.",
    "Customer health: 92% of accounts are in the green band. Two amber accounts (Acme, Northwind) are blocked on SCIM.",
    "SOC 2 Type II is on track for January submission. Pen test closed at 0 high / 3 medium / 11 low.",
    "RDS → Aurora migration completed with zero downtime. p99 read latency dropped from 142ms to 38ms.",
    "Vector store throughput improved 3.8× after the pgvector → Lance migration. Index build time halved.",
];

const ANSWER_POOL: Record<string, string> = {
    revenue:
        "Q3 revenue landed at $4.2M, up 28% YoY. Net new ARR closed at $1.1M, slightly behind the $1.3M target, with the gap concentrated in late-stage enterprise. Mid-market outperformed by 14%; enterprise pipeline coverage tightened from 3.1× to 2.4×.",
    soc:
        "SOC 2 Type II is on track for January submission. The penetration test closed at 0 high / 3 medium / 11 low - all medium findings have remediations merged; the lows are being swept this sprint.",
    infra:
        "RDS → Aurora completed with zero downtime - p99 read latency dropped from 142ms to 38ms, and the new topology survived two simulated region-outage drills. Vector store throughput improved 3.8× after the pgvector → Lance migration.",
    default:
        "Across customer health, infra, and compliance the quarter ended in good shape. The notable risk is the enterprise pipeline slip; mitigation is in flight.",
};

function pickAnswer(query: string): string {
    const q = query.toLowerCase();
    if (q.includes("revenue") || q.includes("arr") || q.includes("q3")) return ANSWER_POOL.revenue!;
    if (q.includes("soc") || q.includes("pen")) return ANSWER_POOL.soc!;
    if (q.includes("infra") || q.includes("migration")) return ANSWER_POOL.infra!;
    return ANSWER_POOL.default!;
}

function tokenize(s: string): string[] {
    const parts: string[] = [];
    const matches = s.match(/\s+|[^\s]+/g) ?? [];
    for (const m of matches) {
        if (/\s/.test(m)) {
            parts.push(m);
            continue;
        }
        if (m.length > 7 && Math.random() < 0.25) {
            const cut = 3 + Math.floor(Math.random() * (m.length - 4));
            parts.push(m.slice(0, cut));
            parts.push(m.slice(cut));
        } else {
            parts.push(m);
        }
    }
    return parts;
}

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

        // Emit 18 candidate chunks as SpanEvents so the UI can stream them.
        const total = 18;
        for (let i = 0; i < total; i++) {
            yield* sleep(40);
            const score = Math.max(0.18, 0.94 - i * 0.045 - Math.random() * 0.04);
            const text = CORPUS[i % CORPUS.length]!;
            yield* Effect.logInfo(`chunk ${i + 1} · score ${score.toFixed(3)}`).pipe(
                Effect.annotateLogs({
                    "ui.kind": "chunk",
                    index: i + 1,
                    total,
                    "chunk.text": text,
                    "chunk.score": score,
                }),
            );
        }

        yield* Effect.logInfo("returned 18 candidates · max score 0.94");
    });

const rerank = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("rerank · 18 → 6 · model=cohere/rerank-3");
        yield* Effect.withSpan(sleep(380), "cohere.rerank", {
            attributes: {
                "llm.model": "cohere/rerank-3",
                "tokens.in": 8640,
                "tokens.out": 6,
                "cost.usd": 0.00027,
            },
        });

        // Emit top-6 reranked chunks.
        const reranked = CORPUS.map((text, i) => ({
            text,
            score: 0.94 - i * 0.04,
        }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
        for (let i = 0; i < reranked.length; i++) {
            yield* sleep(60);
            const r = reranked[i]!;
            yield* Effect.logInfo(`top-${i + 1} · ${r.score.toFixed(3)}`).pipe(
                Effect.annotateLogs({
                    "ui.kind": "chunk",
                    index: i + 1,
                    total: reranked.length,
                    "chunk.text": r.text,
                    "chunk.score": r.score,
                }),
            );
        }

        yield* Effect.logInfo("top-6 selected · spread 0.93→0.69");
    });

const generate = (query: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo("claude-opus-4-7 · TTFT 312ms · streaming");

        // Stream the answer one token at a time. Each token becomes a
        // SpanEvent with `ui.kind: "answer.token"` which the dashboard's
        // AnswerPanel reassembles into visible text.
        const answer = pickAnswer(query);
        const tokens = tokenize(answer);
        const slot = 20;
        for (let i = 0; i < tokens.length; i++) {
            yield* sleep(slot);
            yield* Effect.logInfo(tokens[i]!).pipe(
                Effect.annotateLogs({
                    "ui.kind": "answer.token",
                    index: i + 1,
                    total: tokens.length,
                }),
            );
        }

        // Tag the wrapping LLM span with model/tokens/cost metadata.
        yield* Effect.withSpan(sleep(40), "llm.generate", {
            attributes: {
                "llm.model": "claude-opus-4-7",
                "tokens.in": 1840,
                "tokens.out": tokens.length,
                "cost.usd": 0.01032,
                "agent.query": query,
            },
        });

        yield* Effect.logInfo(`complete · ${tokens.length} tokens · stop=end_turn`);
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
