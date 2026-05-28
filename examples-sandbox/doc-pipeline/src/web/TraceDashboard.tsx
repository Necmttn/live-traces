/**
 * TraceDashboard - agent-style trace UI shared across examples.
 *
 * Reads from the real `livetrace/react` trace store via `useActiveTraces` +
 * `useTraceSteps`. No synthetic data: the backend dispatches Effect spans
 * over the SSE transport, the React store reassembles them into the tree,
 * and this component renders them.
 *
 * Three render modes, controlled by `kind`:
 *   - "rag"      - pipeline + streaming answer panel
 *   - "tools"    - pipeline with tool args/result rows + answer panel
 *   - "pipeline" - pipeline with per-item progress bars (no answer panel)
 *
 * The render code here is identical to what the docs page renders, so the
 * embedded StackBlitz and the docs hero look the same.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useActiveTraces, useTrace, useTraceSteps } from "livetrace/react";
import type { SpanNode } from "livetrace/react";

type Kind = "rag" | "tools" | "pipeline";

export function TraceDashboard({ kind, prompt }: { kind: Kind; prompt: string }) {
    const traces = useActiveTraces();
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
                    <span className="agent-bar-pipeline">{label(kind)}</span>
                </div>
            </div>

            <div className="agent-query">
                <span className="agent-query-prefix">{kind === "pipeline" ? "doc" : "user"}</span>
                <span className="agent-query-text">{trace?.label ?? prompt}</span>
            </div>

            {trace ? (
                <Body traceId={trace.traceId} kind={kind} />
            ) : (
                <div className="agent-empty">no active trace · POST /run to fire one</div>
            )}
        </div>
    );
}

function label(kind: Kind): string {
    switch (kind) {
        case "rag":
            return "RAG agent";
        case "tools":
            return "Agent + tools";
        case "pipeline":
            return "Doc pipeline";
    }
}

function Body({ traceId, kind }: { traceId: string; kind: Kind }) {
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

    const showAnswer = kind !== "pipeline";

    return (
        <>
            <MetricStrip metrics={metrics} status={trace.status} kind={kind} />
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
    const p95 = sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
    const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const eventsPerSec = eventCount / elapsedSec;

    return { tokensIn, tokensOut, costUsd, p95Ms: p95, totalMs, ttftMs, eventsPerSec, toolCalls, itemsProcessed };
}

function MetricStrip({ metrics, status, kind }: { metrics: Metrics; status: string; kind: Kind }) {
    return (
        <div className="metric-strip">
            <Metric label="status" value={status} kind={status === "running" ? "running" : status === "completed" ? "ok" : "err"} />
            <Metric label="tokens · in" value={metrics.tokensIn.toLocaleString()} />
            <Metric label="tokens · out" value={metrics.tokensOut.toLocaleString()} />
            <Metric label="cost" value={`$${metrics.costUsd.toFixed(5)}`} />
            {kind === "pipeline" ? (
                <Metric label="items" value={metrics.itemsProcessed.toLocaleString()} />
            ) : (
                <Metric label="ttft" value={metrics.ttftMs != null ? `${Math.round(metrics.ttftMs)}ms` : "-"} />
            )}
            {kind === "tools" ? (
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
// Step rows

function StepRow({ step }: { step: SpanNode }) {
    const model = step.attributes["llm.model"] as string | undefined;
    const tokIn = step.attributes["tokens.in"] as number | undefined;
    const tokOut = step.attributes["tokens.out"] as number | undefined;
    const cost = step.attributes["cost.usd"] as number | undefined;
    const toolName = step.attributes["tool.name"] as string | undefined;
    const itemsLabel = step.attributes["items.label"] as string | undefined;

    const chunks = useMemo(() => step.events.filter((e) => e.attributes?.["ui.kind"] === "chunk"), [step.events]);
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

            {toolArgs || toolResult ? (
                <div className="step-card-tool">
                    {toolArgs ? (
                        <div className="tool-line">
                            <span className="tool-key">args</span>
                            <span className="tool-val mono">{stringify(toolArgs.attributes?.["tool.args"])}</span>
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

            {chunks.length > 0 ? (
                <div className="step-card-chunks">
                    {chunks.slice(-5).map((e, i) => (
                        <div key={i} className="chunk-row">
                            <span className="chunk-row-score mono">
                                {((e.attributes?.["chunk.score"] as number | undefined) ?? 0).toFixed(3)}
                            </span>
                            <span className="chunk-row-text">{e.attributes?.["chunk.text"] as string}</span>
                        </div>
                    ))}
                    {chunks.length > 5 ? (
                        <div className="chunk-row-more">+{chunks.length - 5} more · sliding window</div>
                    ) : null}
                </div>
            ) : null}

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

function stringify(v: unknown): string {
    if (typeof v === "string") {
        try {
            return JSON.stringify(JSON.parse(v));
        } catch {
            return v;
        }
    }
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
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

type LogLevel = "Info" | "Warning" | "Error";

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
            const k = e.attributes?.["ui.kind"];
            // Logs are SpanEvents with a level + no specialized ui.kind
            if (e.level && (k === undefined || k === "log")) {
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
