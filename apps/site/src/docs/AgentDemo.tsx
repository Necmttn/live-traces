/**
 * AgentDemo - multi-scenario trace demo for the docs hero.
 *
 * Shows three real-world `withTrace` patterns side by side so users can read
 * the demo as documentation, not just a pretty UI:
 *
 *   • RAG agent     - Plan → Retrieve → Rerank → Generate
 *                     (chat with retrieval, streaming answer)
 *   • Agent + tools - Think → web.search → Think → code.exec → Generate
 *                     (LLM proposes tools, observes results, replies)
 *   • Doc pipeline  - Parse → Chunk → Embed → Index
 *                     (classic batch: progress per step, no streamed text)
 *
 * Each scenario dispatches synthetic but realistic `TraceEvent`s through the
 * real `livetrace/react` store. The same UI hooks render all three -
 * exactly how a real app would render its own production traces.
 *
 * No backend, no StackBlitz. Everything runs in the browser through the
 * package's actual store + hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getTraceStore, useActiveTraces, useTrace, useTraceSteps } from "livetrace/react";
import type { SpanNode } from "livetrace/react";
import type { TraceEvent } from "livetrace/types";

import { CORPUS, preview } from "../components/corpus.js";

// ============================================================================
// Shared types
// ============================================================================

type LogLevel = "Info" | "Warning" | "Error";

interface LogPoint {
    readonly at: number;
    readonly level: LogLevel;
    readonly msg: string;
}

interface ChunkRow {
    readonly idx: number;
    readonly text: string;
    readonly score: number;
}

interface ToolCall {
    readonly tool: string;
    readonly args: Record<string, unknown>;
    readonly result: string;
}

interface ProgressItem {
    readonly name: string;
    readonly attrs?: Record<string, unknown>;
}

interface StepDef {
    readonly name: string;
    readonly durationMs: number;
    readonly model?: string;
    readonly tokensIn?: number;
    readonly tokensOut?: number;
    readonly costUsd?: number;
    readonly logs?: ReadonlyArray<LogPoint>;
    readonly chunks?: ReadonlyArray<ChunkRow>;
    readonly tokens?: ReadonlyArray<string>; // streamed answer tokens
    readonly tool?: ToolCall; // tool invocation as a child span
    readonly itemsLabel?: string; // for batch progress (e.g. "pages")
    readonly items?: ReadonlyArray<ProgressItem>;
}

interface Run {
    readonly headline: string; // shown as the prompt/document
    readonly headlineKind: "user" | "doc";
    readonly steps: ReadonlyArray<StepDef>;
}

let _counter = 0;
const sid = () => `s${(++_counter).toString(16).padStart(8, "0")}`;
const tid = (slug: string) => `${slug}:${Date.now()}-${_counter}`;

// ============================================================================
// Scenario 1: RAG agent
// ============================================================================

interface QA {
    readonly q: string;
    readonly a: string;
    readonly cites: ReadonlyArray<number>;
}

const RAG_POOL: ReadonlyArray<QA> = [
    {
        q: "How did Q3 revenue compare to the plan?",
        a: "Q3 revenue landed at $4.2M, up 28% YoY. Net new ARR closed at $1.1M, slightly behind the $1.3M target, with the gap concentrated in late-stage enterprise. Mid-market outperformed plan by 14%; enterprise pipeline coverage tightened from 3.1× to 2.4×.",
        cites: [0, 1, 5],
    },
    {
        q: "What's the status of SOC 2 and the pen test?",
        a: "SOC 2 Type II is on track for January submission. The penetration test closed at 0 high / 3 medium / 11 low. All medium findings have remediations merged; the low findings are being swept this sprint.",
        cites: [8],
    },
    {
        q: "Summarize the infra and migration progress.",
        a: "The RDS → Aurora migration completed with zero downtime - p99 read latency dropped from 142ms to 38ms, and the new topology survived two simulated region-outage drills. Vector store throughput improved 3.8× after the pgvector → Lance migration, halving index build time.",
        cites: [7, 21],
    },
    {
        q: "Where does customer health stand?",
        a: "92% of accounts are in the green band. Two amber accounts (Acme, Northwind) are blocked on the SCIM migration, expected to clear within the first two weeks of November. NRR ticked to 118% - the highest reading since Q4 last year - with gross retention holding at 94%.",
        cites: [4, 12],
    },
];

function makeRagRun(idx: number): Run {
    const qa = RAG_POOL[idx % RAG_POOL.length]!;
    const candidates: ChunkRow[] = Array.from({ length: 18 }, (_, i) => {
        const corpusIdx = (qa.cites[i % qa.cites.length] ?? i) % CORPUS.length;
        return {
            idx: corpusIdx + 1,
            text: preview(CORPUS[corpusIdx]!, 92),
            score: Math.max(0.18, 0.94 - i * 0.045 - Math.random() * 0.04),
        };
    });
    const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 6);
    const tokens = tokenizeAnswer(qa.a);
    const genTokensIn = top.reduce((n, c) => n + Math.round(c.text.length / 4), 0) + 240;
    const genTokensOut = Math.round(qa.a.length / 4);

    return {
        headline: qa.q,
        headlineKind: "user",
        steps: [
            {
                name: "Plan",
                durationMs: 420,
                model: "gpt-5-mini",
                tokensIn: 96,
                tokensOut: 52,
                costUsd: 0.00018,
                logs: [
                    { at: 0.15, level: "Info", msg: `decompose · "${qa.q.slice(0, 48)}"` },
                    { at: 0.85, level: "Info", msg: `plan ready · 3 sub-queries · routing to retriever` },
                ],
            },
            {
                name: "Retrieve",
                durationMs: 1100,
                chunks: candidates,
                logs: [
                    { at: 0.06, level: "Info", msg: `pgvector.search · k=18 · namespace=docs` },
                    { at: 0.55, level: "Info", msg: `embed query · text-embedding-3-small · 8ms` },
                    { at: 0.92, level: "Info", msg: `returned 18 candidates · max score ${candidates[0]!.score.toFixed(3)}` },
                ],
            },
            {
                name: "Rerank",
                durationMs: 780,
                model: "cohere/rerank-3",
                tokensIn: candidates.reduce((n, c) => n + Math.round(c.text.length / 4), 0),
                tokensOut: top.length,
                costUsd: 0.00027,
                chunks: top,
                logs: [
                    { at: 0.1, level: "Info", msg: `rerank · 18 → 6 · model=cohere/rerank-3` },
                    { at: 0.88, level: "Info", msg: `top-6 selected · spread ${top[0]!.score.toFixed(2)}→${top[top.length - 1]!.score.toFixed(2)}` },
                ],
            },
            {
                name: "Generate",
                durationMs: 2400,
                model: "claude-opus-4-7",
                tokensIn: genTokensIn,
                tokensOut: genTokensOut,
                costUsd: Math.round((genTokensIn * 0.000015 + genTokensOut * 0.000075) * 100000) / 100000,
                tokens,
                logs: [
                    { at: 0.04, level: "Info", msg: `claude-opus-4-7 · TTFT 312ms · streaming` },
                    { at: 0.98, level: "Info", msg: `complete · ${tokens.length} tokens · stop=end_turn` },
                ],
            },
        ],
    };
}

function tokenizeAnswer(answer: string): string[] {
    const parts: string[] = [];
    const matches = answer.match(/\s+|[^\s]+/g) ?? [];
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

// ============================================================================
// Scenario 2: Agent + tools (Think → call tool → observe → repeat → answer)
// ============================================================================

interface ToolScenario {
    readonly q: string;
    readonly a: string;
    readonly tools: ReadonlyArray<ToolCall>;
}

const TOOL_POOL: ReadonlyArray<ToolScenario> = [
    {
        q: "What's the weather in Lisbon and is it good for outdoor planning tomorrow?",
        tools: [
            {
                tool: "web.search",
                args: { query: "Lisbon weather forecast tomorrow", k: 3 },
                result: "Forecast Lisbon · Nov 14 · 18°C high, 12°C low · partly cloudy · 10% precipitation · winds 14 km/h NW",
            },
            {
                tool: "calendar.peek",
                args: { date: "2026-11-14", scope: "team" },
                result: "3 events · 10:00 standup · 14:00 board prep · 16:30 1:1 (remote) · 5h of unblocked time afternoon",
            },
        ],
        a: "Forecast for Lisbon is 18°/12° partly cloudy with 10% chance of rain - solid for outdoor planning. Your calendar has a remote 1:1 at 16:30 but the afternoon (≈11:00–14:00) is unblocked. I'd anchor outdoor work to that window.",
    },
    {
        q: "Plot Q3 ARR vs target and tell me if we recovered the gap.",
        tools: [
            {
                tool: "sql.query",
                args: { query: "select month, arr_target, arr_actual from finance.q3_arr order by month", db: "warehouse" },
                result: "rows=3 · Jul: tgt=420 act=380 · Aug: tgt=440 act=420 · Sep: tgt=440 act=300",
            },
            {
                tool: "code.exec",
                args: { lang: "python", source: "import matplotlib.pyplot as plt … plt.savefig('/tmp/arr.png')" },
                result: "ok · wrote /tmp/arr.png (8.4 KB) · ARR gap widens in Sep · cumulative shortfall $200k",
            },
        ],
        a: "No - the gap widened. Jul and Aug each closed ~$20–40k under plan, but September dropped to $300k vs the $440k target. Cumulative Q3 shortfall is ~$200k, driven by Sep enterprise slip (the same late-stage cohort flagged in the QBR).",
    },
];

function makeToolRun(idx: number): Run {
    const sc = TOOL_POOL[idx % TOOL_POOL.length]!;
    const answerTokens = tokenizeAnswer(sc.a);

    const steps: StepDef[] = [];
    let stepIdx = 0;
    for (const tc of sc.tools) {
        stepIdx += 1;
        steps.push({
            name: `Think ${stepIdx}`,
            durationMs: 520,
            model: "claude-opus-4-7",
            tokensIn: 180 + stepIdx * 60,
            tokensOut: 36,
            costUsd: 0.0004 * stepIdx,
            logs: [
                {
                    at: 0.2,
                    level: "Info",
                    msg: `reasoning · need to call ${tc.tool}(${Object.keys(tc.args).join(", ")})`,
                },
                { at: 0.85, level: "Info", msg: `tool_use · ${tc.tool}` },
            ],
        });
        steps.push({
            name: tc.tool,
            durationMs: 380 + stepIdx * 80,
            tool: tc,
            logs: [
                { at: 0.1, level: "Info", msg: `${tc.tool}(${JSON.stringify(tc.args).slice(0, 64)})` },
                { at: 0.92, level: "Info", msg: `← ${tc.result.slice(0, 80)}` },
            ],
        });
    }
    steps.push({
        name: "Generate",
        durationMs: 1800,
        model: "claude-opus-4-7",
        tokensIn: 920,
        tokensOut: Math.round(sc.a.length / 4),
        costUsd: 0.012,
        tokens: answerTokens,
        logs: [
            { at: 0.06, level: "Info", msg: `claude-opus-4-7 · TTFT 280ms · streaming` },
            { at: 0.98, level: "Info", msg: `complete · ${answerTokens.length} tokens · stop=end_turn` },
        ],
    });

    return { headline: sc.q, headlineKind: "user", steps };
}

// ============================================================================
// Scenario 3: Document pipeline (batch processing)
// ============================================================================

const DOC_POOL: ReadonlyArray<string> = [
    "report-q3.pdf",
    "research-notes.md",
    "contract-v2.pdf",
    "meeting-transcript.txt",
];

function genItems(prefix: string, count: number, extra: (i: number) => Record<string, unknown> = () => ({})): ProgressItem[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `${prefix} ${i + 1}/${count}`,
        attrs: { "ui.kind": "progress", index: i + 1, total: count, "chunk.text": preview(CORPUS[i % CORPUS.length]!, 90), ...extra(i) },
    }));
}

function makePipelineRun(idx: number): Run {
    const doc = DOC_POOL[idx % DOC_POOL.length]!;
    const pages = 12;
    const chunks = 32;
    return {
        headline: doc,
        headlineKind: "doc",
        steps: [
            {
                name: "Parse",
                durationMs: 1900,
                itemsLabel: "pages",
                items: genItems("page", pages),
                logs: [
                    { at: 0.02, level: "Info", msg: `opening ${doc}` },
                    { at: 0.95, level: "Info", msg: `parsed ${pages} pages · 4 tables · 18,402 tokens` },
                ],
            },
            {
                name: "Chunk",
                durationMs: 1200,
                itemsLabel: "chunks",
                items: genItems("chunk", chunks, (i) => ({ tokens: 480 + ((i * 37) % 240) })),
                logs: [
                    { at: 0.05, level: "Info", msg: `split · target=512 tok · overlap=64` },
                    { at: 0.92, level: "Info", msg: `produced ${chunks} chunks · avg 542 tok` },
                ],
            },
            {
                name: "Embed",
                durationMs: 2400,
                model: "text-embedding-3-small",
                tokensIn: chunks * 542,
                tokensOut: chunks * 1536,
                costUsd: 0.00065,
                itemsLabel: "embeddings",
                items: genItems("embed", chunks, (i) => ({ chunk: i + 1, dims: 1536 })),
                logs: [
                    { at: 0.05, level: "Info", msg: `POST openai · batch=${chunks}` },
                    { at: 0.45, level: "Warning", msg: `rate-limited · retrying in 240ms` },
                    { at: 0.95, level: "Info", msg: `embedded ${chunks} chunks · 1536-dim` },
                ],
            },
            {
                name: "Index",
                durationMs: 1100,
                itemsLabel: "upserts",
                items: genItems("upsert", chunks),
                logs: [
                    { at: 0.1, level: "Info", msg: `connecting · pgvector://primary` },
                    { at: 0.95, level: "Info", msg: `indexed ${chunks} vectors · txn 0xa8f4` },
                ],
            },
        ],
    };
}

// ============================================================================
// Scenarios registry
// ============================================================================

type ScenarioId = "rag" | "tools" | "pipeline";

interface Scenario {
    readonly id: ScenarioId;
    readonly label: string;
    readonly blurb: string;
    readonly poolSize: number;
    readonly build: (idx: number) => Run;
    /** Path under `examples-sandbox/` for the runnable example. */
    readonly examplePath: string;
}

const SCENARIOS: ReadonlyArray<Scenario> = [
    {
        id: "rag",
        label: "RAG agent",
        blurb: "Plan → Retrieve → Rerank → Generate. The common chat-with-retrieval shape. Generate streams tokens.",
        poolSize: RAG_POOL.length,
        build: makeRagRun,
        examplePath: "agent-rag",
    },
    {
        id: "tools",
        label: "Agent + tools",
        blurb: "Think → tool call → observe → think → answer. Each Think is one LLM call; each tool is its own span with args + result.",
        poolSize: TOOL_POOL.length,
        build: makeToolRun,
        examplePath: "agent-tools",
    },
    {
        id: "pipeline",
        label: "Doc pipeline",
        blurb: "Classic batch: Parse → Chunk → Embed → Index. Each step shows per-item progress; no streamed text output.",
        poolSize: DOC_POOL.length,
        build: makePipelineRun,
        examplePath: "doc-pipeline",
    },
];

// Real workflow source per scenario, loaded at build time from the runnable
// examples in `examples-sandbox/*`. The "see the code" panel renders these,
// so the docs demo and the StackBlitz sandbox always show the same code.
import ragWorkflow from "../../../../examples-sandbox/agent-rag/src/workflow.ts?raw";
import toolsWorkflow from "../../../../examples-sandbox/agent-tools/src/workflow.ts?raw";
import pipelineWorkflow from "../../../../examples-sandbox/doc-pipeline/src/workflow.ts?raw";

const WORKFLOW_SOURCE: Record<ScenarioId, string> = {
    rag: ragWorkflow,
    tools: toolsWorkflow,
    pipeline: pipelineWorkflow,
};

const SCENARIO_BY_ID: Record<ScenarioId, Scenario> = Object.fromEntries(
    SCENARIOS.map((s) => [s.id, s]),
) as Record<ScenarioId, Scenario>;

// ============================================================================
// Dispatch a run as a real-time TraceEvent stream
// ============================================================================

function runScenario(scenarioId: ScenarioId, def: Run): void {
    const store = getTraceStore();
    const traceId = tid(scenarioId);
    const rootId = sid();
    const t0 = Date.now();

    const at = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
    const dispatch = (e: TraceEvent) => store.dispatch(e);

    dispatch({
        _tag: "TraceStart",
        traceId,
        label: def.headline,
        scope: { type: "user", id: "demo" },
        timestamp: t0,
    });
    dispatch({
        _tag: "SpanStart",
        traceId,
        spanId: rootId,
        name: def.headline,
        attributes: { "live-trace": true, "scenario.id": scenarioId, "scenario.headline.kind": def.headlineKind },
        timestamp: t0,
    });

    let cursor = 0;

    for (const step of def.steps) {
        const stepId = sid();
        const stepStart = cursor;
        const stepEnd = cursor + step.durationMs;

        const attrs: Record<string, unknown> = { "ui.step": true };
        if (step.model) attrs["llm.model"] = step.model;
        if (step.tokensIn != null) attrs["tokens.in"] = step.tokensIn;
        if (step.tokensOut != null) attrs["tokens.out"] = step.tokensOut;
        if (step.costUsd != null) attrs["cost.usd"] = step.costUsd;
        if (step.itemsLabel) attrs["items.label"] = step.itemsLabel;
        if (step.tool) attrs["tool.name"] = step.tool.tool;

        at(stepStart, () =>
            dispatch({
                _tag: "SpanStart",
                traceId,
                spanId: stepId,
                parentSpanId: rootId,
                name: step.name,
                attributes: attrs,
                timestamp: Date.now(),
            }),
        );

        // Tool call: emit `tool.args` + `tool.result` as fast SpanEvents
        if (step.tool) {
            at(stepStart + 30, () =>
                dispatch({
                    _tag: "SpanEvent",
                    traceId,
                    spanId: stepId,
                    name: `args: ${JSON.stringify(step.tool!.args)}`,
                    attributes: { "ui.kind": "tool.args", "tool.args": step.tool!.args },
                    timestamp: Date.now(),
                }),
            );
            at(stepEnd - 40, () =>
                dispatch({
                    _tag: "SpanEvent",
                    traceId,
                    spanId: stepId,
                    name: `result: ${step.tool!.result}`,
                    attributes: { "ui.kind": "tool.result", "tool.result": step.tool!.result },
                    timestamp: Date.now(),
                }),
            );
        }

        // Retrieval / rerank chunks
        if (step.chunks?.length) {
            const slot = (step.durationMs - 80) / step.chunks.length;
            step.chunks.forEach((c, i) => {
                at(stepStart + 40 + i * slot, () =>
                    dispatch({
                        _tag: "SpanEvent",
                        traceId,
                        spanId: stepId,
                        name: `chunk ${c.idx} · score ${c.score.toFixed(3)}`,
                        attributes: {
                            "ui.kind": "chunk",
                            index: i + 1,
                            total: step.chunks!.length,
                            "chunk.text": c.text,
                            "chunk.score": c.score,
                        },
                        timestamp: Date.now(),
                    }),
                );
            });
        }

        // Batch progress items (Parse/Chunk/Embed/Index)
        if (step.items?.length) {
            const slot = (step.durationMs - 60) / step.items.length;
            step.items.forEach((item, i) => {
                at(stepStart + 30 + i * slot, () =>
                    dispatch({
                        _tag: "SpanEvent",
                        traceId,
                        spanId: stepId,
                        name: item.name,
                        attributes: item.attrs,
                        timestamp: Date.now(),
                    }),
                );
            });
        }

        // Streamed tokens (Generate)
        if (step.tokens?.length) {
            const slot = (step.durationMs - 320) / step.tokens.length;
            step.tokens.forEach((tok, i) => {
                at(stepStart + 280 + i * slot, () =>
                    dispatch({
                        _tag: "SpanEvent",
                        traceId,
                        spanId: stepId,
                        name: tok,
                        attributes: { "ui.kind": "answer.token", index: i + 1, total: step.tokens!.length },
                        timestamp: Date.now(),
                    }),
                );
            });
        }

        // Effect.log-style events
        if (step.logs?.length) {
            for (const log of step.logs) {
                at(stepStart + log.at * step.durationMs, () =>
                    dispatch({
                        _tag: "SpanEvent",
                        traceId,
                        spanId: stepId,
                        name: log.msg,
                        level: log.level,
                        attributes: { "ui.kind": "log", "effect.logLevel": log.level.toUpperCase() },
                        timestamp: Date.now(),
                    }),
                );
            }
        }

        at(stepEnd, () =>
            dispatch({
                _tag: "SpanEnd",
                traceId,
                spanId: stepId,
                status: "ok",
                durationMs: step.durationMs,
                timestamp: Date.now(),
            }),
        );

        cursor = stepEnd + 30;
    }

    const total = cursor;
    at(total + 10, () => {
        dispatch({
            _tag: "SpanEnd",
            traceId,
            spanId: rootId,
            status: "ok",
            durationMs: total,
            timestamp: Date.now(),
        });
        dispatch({
            _tag: "TraceEnd",
            traceId,
            status: "completed",
            durationMs: total,
            timestamp: Date.now(),
        });
    });
}

// ============================================================================
// Components
// ============================================================================

export function AgentDemo() {
    const traces = useActiveTraces();
    const [scenarioId, setScenarioId] = useState<ScenarioId>("rag");
    const [variantIdx, setVariantIdx] = useState(0);
    const [busy, setBusy] = useState(false);
    const [showCode, setShowCode] = useState(false);
    const initRef = useRef(false);

    const scenario = SCENARIO_BY_ID[scenarioId];

    const run = useCallback((id: ScenarioId, idx: number) => {
        setBusy(true);
        runScenario(id, SCENARIO_BY_ID[id].build(idx));
        setTimeout(() => setBusy(false), 350);
    }, []);

    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        run(scenarioId, variantIdx);
    }, [run, scenarioId, variantIdx]);

    // Idle loop: when canvas empties, advance variant. Every full pass through
    // a scenario's pool also rotates to the next scenario, so users see all
    // three patterns over time.
    useEffect(() => {
        if (busy || traces.length > 0) return;
        const id = window.setTimeout(() => {
            const nextVariant = variantIdx + 1;
            if (nextVariant >= scenario.poolSize) {
                const ids = SCENARIOS.map((s) => s.id);
                const next = ids[(ids.indexOf(scenarioId) + 1) % ids.length]!;
                setScenarioId(next);
                setVariantIdx(0);
                run(next, 0);
            } else {
                setVariantIdx(nextVariant);
                run(scenarioId, nextVariant);
            }
        }, 1600);
        return () => window.clearTimeout(id);
    }, [busy, traces.length, scenarioId, variantIdx, scenario, run]);

    const trace = traces[0];

    return (
        <div className="agent-demo">
            <div className="agent-bar">
                <div className="agent-bar-l">
                    <span className="agent-dot-row">
                        <span />
                        <span />
                        <span />
                    </span>
                    <span className="agent-bar-path mono">traces/user/demo</span>
                    <span className="agent-bar-pipeline">{scenario.label}</span>
                </div>
                <div className="agent-bar-r">
                    {SCENARIOS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`agent-tab${s.id === scenarioId ? " is-active" : ""}`}
                            onClick={() => {
                                setScenarioId(s.id);
                                setVariantIdx(0);
                                run(s.id, 0);
                            }}
                            disabled={busy}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="agent-blurb">
                <span className="agent-blurb-prefix">pattern</span>
                <span className="agent-blurb-text">{scenario.blurb}</span>
                <div className="agent-blurb-actions">
                    <button type="button" className="agent-code-toggle" onClick={() => setShowCode((v) => !v)}>
                        {showCode ? "hide" : "see"} the code
                    </button>
                    <a
                        className="agent-code-toggle agent-run-link"
                        href={`https://stackblitz.com/github/necmttn/livetrace/tree/main/examples-sandbox/${scenario.examplePath}?view=editor&file=src%2Fworkflow.ts`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Run in StackBlitz ↗
                    </a>
                </div>
            </div>

            {showCode ? (
                <div className="agent-code-wrap">
                    <div className="agent-code-head">
                        <span className="mono">examples-sandbox/{scenario.examplePath}/src/workflow.ts</span>
                        <a
                            className="agent-code-gh"
                            href={`https://github.com/necmttn/livetrace/blob/main/examples-sandbox/${scenario.examplePath}/src/workflow.ts`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            view on GitHub ↗
                        </a>
                    </div>
                    <pre className="agent-code">
                        <code>{WORKFLOW_SOURCE[scenario.id]}</code>
                    </pre>
                </div>
            ) : null}

            <div className="agent-query">
                <span className="agent-query-prefix">{scenario.id === "pipeline" ? "doc" : "user"}</span>
                <span className="agent-query-text">{scenario.build(variantIdx).headline}</span>
                <span className="agent-q-counter mono">
                    {variantIdx + 1}/{scenario.poolSize}
                </span>
            </div>

            {trace ? (
                <AgentRunBody traceId={trace.traceId} scenarioId={scenarioId} />
            ) : (
                <div className="agent-empty">queuing next run…</div>
            )}
        </div>
    );
}

function AgentRunBody({ traceId, scenarioId }: { traceId: string; scenarioId: ScenarioId }) {
    const trace = useTrace(traceId);
    const steps = useTraceSteps(traceId);

    const [, setTick] = useState(0);
    useEffect(() => {
        if (!trace || trace.status !== "running") return;
        const id = setInterval(() => setTick((n) => n + 1), 60);
        return () => clearInterval(id);
    }, [trace]);

    const metrics = useMemo(() => computeMetrics(steps, trace?.startedAt ?? Date.now()), [steps, trace?.startedAt]);
    const logs = useMemo(() => collectLogs(steps), [steps]);
    const answer = useMemo(() => collectAnswer(steps), [steps]);

    if (!trace) return null;

    const showAnswer = scenarioId !== "pipeline";

    return (
        <>
            <MetricStrip metrics={metrics} status={trace.status} scenarioId={scenarioId} />

            <div className={`agent-grid${showAnswer ? "" : " no-answer"}`}>
                <div className="agent-pipeline">
                    {steps.map((s) => (
                        <StepRow key={s.spanId} step={s} />
                    ))}
                </div>
                {showAnswer ? (
                    <AnswerPanel answer={answer} ttftMs={metrics.ttftMs} done={trace.status !== "running"} />
                ) : null}
            </div>

            <LogConsole logs={logs} done={trace.status !== "running"} />
        </>
    );
}

// ----------------------------------------------------------------------------
// Metrics

interface Metrics {
    readonly tokensIn: number;
    readonly tokensOut: number;
    readonly costUsd: number;
    readonly p95Ms: number;
    readonly totalMs: number;
    readonly ttftMs: number | null;
    readonly eventsPerSec: number;
    readonly toolCalls: number;
    readonly itemsProcessed: number;
}

function computeMetrics(steps: ReadonlyArray<SpanNode>, startedAt: number): Metrics {
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    const durations: number[] = [];
    let totalMs = 0;
    let ttftMs: number | null = null;
    let eventCount = 0;
    let toolCalls = 0;
    let itemsProcessed = 0;

    for (const s of steps) {
        const ti = s.attributes["tokens.in"];
        const to = s.attributes["tokens.out"];
        const c = s.attributes["cost.usd"];
        if (typeof ti === "number") tokensIn += ti;
        if (typeof to === "number") tokensOut += to;
        if (typeof c === "number") costUsd += c;
        if (s.durationMs != null) {
            durations.push(s.durationMs);
            totalMs += s.durationMs;
        } else if (s.status === "running") {
            totalMs += Date.now() - s.startedAt;
        }
        eventCount += s.events.length;
        if (s.attributes["tool.name"]) toolCalls += 1;
        for (const e of s.events) {
            if (e.attributes?.["ui.kind"] === "progress") itemsProcessed += 1;
        }
        if (s.name === "Generate" && ttftMs == null) {
            const firstToken = s.events.find((e) => e.attributes?.["ui.kind"] === "answer.token");
            if (firstToken) ttftMs = firstToken.timestamp - startedAt;
        }
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const p95 =
        sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
    const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const eventsPerSec = eventCount / elapsedSec;

    return { tokensIn, tokensOut, costUsd, p95Ms: p95, totalMs, ttftMs, eventsPerSec, toolCalls, itemsProcessed };
}

function MetricStrip({
    metrics,
    status,
    scenarioId,
}: {
    metrics: Metrics;
    status: string;
    scenarioId: ScenarioId;
}) {
    return (
        <div className="metric-strip">
            <Metric label="status" value={status} kind={status === "running" ? "running" : status === "completed" ? "ok" : "err"} />
            <Metric label="tokens · in" value={metrics.tokensIn.toLocaleString()} />
            <Metric label="tokens · out" value={metrics.tokensOut.toLocaleString()} />
            <Metric label="cost" value={`$${metrics.costUsd.toFixed(5)}`} />
            {scenarioId === "pipeline" ? (
                <Metric label="items" value={metrics.itemsProcessed.toLocaleString()} />
            ) : (
                <Metric label="ttft" value={metrics.ttftMs != null ? `${Math.round(metrics.ttftMs)}ms` : "-"} />
            )}
            {scenarioId === "tools" ? (
                <Metric label="tool calls" value={String(metrics.toolCalls)} />
            ) : (
                <Metric label="p95 step" value={`${Math.round(metrics.p95Ms)}ms`} />
            )}
            <Metric label="total" value={`${Math.round(metrics.totalMs)}ms`} />
            <Metric label="events/s" value={metrics.eventsPerSec.toFixed(1)} />
        </div>
    );
}

function Metric({ label, value, kind }: { label: string; value: string; kind?: "running" | "ok" | "err" }) {
    return (
        <div className={`metric${kind ? ` is-${kind}` : ""}`}>
            <div className="metric-label">{label}</div>
            <div className="metric-value mono">{value}</div>
        </div>
    );
}

// ----------------------------------------------------------------------------
// Pipeline step rows

function StepRow({ step }: { step: SpanNode }) {
    const model = step.attributes["llm.model"] as string | undefined;
    const tokIn = step.attributes["tokens.in"] as number | undefined;
    const tokOut = step.attributes["tokens.out"] as number | undefined;
    const cost = step.attributes["cost.usd"] as number | undefined;
    const toolName = step.attributes["tool.name"] as string | undefined;
    const itemsLabel = step.attributes["items.label"] as string | undefined;

    const chunks = useMemo(
        () => step.events.filter((e) => e.attributes?.["ui.kind"] === "chunk"),
        [step.events],
    );
    const progressEvents = useMemo(
        () => step.events.filter((e) => e.attributes?.["ui.kind"] === "progress"),
        [step.events],
    );
    const toolArgs = step.events.find((e) => e.attributes?.["ui.kind"] === "tool.args");
    const toolResult = step.events.find((e) => e.attributes?.["ui.kind"] === "tool.result");

    const totalItems = (progressEvents[0]?.attributes?.["total"] as number | undefined) ?? undefined;
    const doneItems = progressEvents.length;
    const recentItem = progressEvents[progressEvents.length - 1];

    return (
        <div className={`step-card ${step.status}${toolName ? " is-tool" : ""}`}>
            <div className="step-card-head">
                <div className="step-card-name">
                    <span className="step-card-marker" />
                    <span>{step.name}</span>
                    {toolName ? <span className="chip chip-tool">tool</span> : null}
                </div>
                <div className="step-card-dur mono">{step.durationMs != null ? `${step.durationMs.toFixed(0)}ms` : "running"}</div>
            </div>
            <div className="step-card-meta">
                {model ? <span className="chip">{model}</span> : null}
                {tokIn != null ? <span className="chip muted">in {tokIn.toLocaleString()}</span> : null}
                {tokOut != null ? <span className="chip muted">out {tokOut.toLocaleString()}</span> : null}
                {cost != null ? <span className="chip muted">${cost.toFixed(5)}</span> : null}
                {itemsLabel && totalItems != null ? (
                    <span className="chip muted">
                        {doneItems}/{totalItems} {itemsLabel}
                    </span>
                ) : null}
            </div>

            {/* Tool args + result */}
            {toolArgs || toolResult ? (
                <div className="step-card-tool">
                    {toolArgs ? (
                        <div className="tool-line">
                            <span className="tool-key">args</span>
                            <span className="tool-val mono">{JSON.stringify(toolArgs.attributes?.["tool.args"] ?? {})}</span>
                        </div>
                    ) : null}
                    {toolResult ? (
                        <div className="tool-line">
                            <span className="tool-key out">result</span>
                            <span className="tool-val">{toolResult.attributes?.["tool.result"] as string}</span>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Retrieval chunks */}
            {chunks.length > 0 ? (
                <div className="step-card-chunks">
                    {chunks.slice(-5).map((e, i) => (
                        <div key={i} className="chunk-row">
                            <span className="chunk-row-score mono">{(e.attributes!["chunk.score"] as number).toFixed(3)}</span>
                            <span className="chunk-row-text">{e.attributes!["chunk.text"] as string}</span>
                        </div>
                    ))}
                    {chunks.length > 5 ? (
                        <div className="chunk-row-more">+{chunks.length - 5} more · sliding window</div>
                    ) : null}
                </div>
            ) : null}

            {/* Batch progress */}
            {totalItems != null && itemsLabel ? (
                <>
                    <div className="step-progress">
                        <div className="step-progress-bar" style={{ width: `${(doneItems / totalItems) * 100}%` }} />
                    </div>
                    {step.status === "running" && recentItem ? (
                        <div className="step-progress-recent mono">
                            {recentItem.name}
                            {recentItem.attributes?.["chunk.text"] ? (
                                <span className="step-progress-snippet"> · {recentItem.attributes!["chunk.text"] as string}</span>
                            ) : null}
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Answer panel

function collectAnswer(steps: ReadonlyArray<SpanNode>): string {
    const gen = steps.find((s) => s.name === "Generate");
    if (!gen) return "";
    return gen.events
        .filter((e) => e.attributes?.["ui.kind"] === "answer.token")
        .map((e) => e.name)
        .join("");
}

function AnswerPanel({ answer, ttftMs, done }: { answer: string; ttftMs: number | null; done: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [answer]);

    return (
        <div className="answer-panel">
            <div className="answer-head">
                <span className="answer-title">assistant</span>
                <span className="answer-meta">
                    <span className={`answer-dot${done ? "" : " live"}`} />
                    {done ? "complete" : ttftMs != null ? `streaming · ${Math.round(ttftMs)}ms TTFT` : "thinking…"}
                </span>
            </div>
            <div className="answer-body" ref={scrollRef}>
                {answer ? (
                    <>
                        {answer}
                        {!done ? <span className="answer-caret" /> : null}
                    </>
                ) : (
                    <span className="answer-placeholder">waiting for first token…</span>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------------
// Log console

interface LogLine {
    readonly id: string;
    readonly level: LogLevel;
    readonly msg: string;
    readonly ts: number;
    readonly step: string;
}

function collectLogs(steps: ReadonlyArray<SpanNode>): LogLine[] {
    const out: LogLine[] = [];
    for (const s of steps) {
        for (let i = 0; i < s.events.length; i++) {
            const e = s.events[i]!;
            if (e.attributes?.["ui.kind"] === "log" && e.level) {
                out.push({
                    id: `${s.spanId}:${i}`,
                    level: e.level as LogLevel,
                    msg: e.name,
                    ts: e.timestamp,
                    step: s.name,
                });
            }
        }
    }
    return out.sort((a, b) => a.ts - b.ts);
}

function LogConsole({ logs, done }: { logs: ReadonlyArray<LogLine>; done: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logs.length]);

    return (
        <div className="agent-log">
            <div className="agent-log-head">
                <span className="agent-log-title">Effect.log → SpanEvent</span>
                <span className="agent-log-meta">
                    <span className={`agent-log-dot${done ? "" : " live"}`} />
                    {done ? "closed" : "live"} · {logs.length} event{logs.length === 1 ? "" : "s"}
                </span>
            </div>
            <div className="agent-log-body" ref={scrollRef}>
                {logs.length === 0 ? (
                    <div className="agent-log-empty">awaiting Effect.log…</div>
                ) : (
                    logs.map((l, i) => (
                        <div key={l.id} className={`agent-log-line ${l.level.toLowerCase()}`} style={{ opacity: i < logs.length - 8 ? 0.5 : 1 }}>
                            <span className="agent-log-ts mono">{formatTs(l.ts)}</span>
                            <span className="agent-log-lvl">{l.level.slice(0, 4).toLowerCase()}</span>
                            <span className="agent-log-src">[{l.step.toLowerCase()}]</span>
                            <span className="agent-log-msg">{l.msg}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function formatTs(ms: number): string {
    const d = new Date(ms);
    return (
        d.getHours().toString().padStart(2, "0") +
        ":" +
        d.getMinutes().toString().padStart(2, "0") +
        ":" +
        d.getSeconds().toString().padStart(2, "0") +
        "." +
        d.getMilliseconds().toString().padStart(3, "0")
    );
}
