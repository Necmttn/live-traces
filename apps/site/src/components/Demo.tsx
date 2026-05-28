/**
 * In-browser demo. Generates a fine-grained TraceEvent stream:
 *   - Progress items   →  drive the "N / total" counter + bar
 *   - Effect.log calls →  stream into the live log console
 *
 * Both kinds flow through the package's real TraceStore + hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpanNode } from "livetrace/react";

import type { TraceEvent } from "livetrace/types";
import { getTraceStore, useActiveTraces, useTrace, useTraceSteps } from "livetrace/react";

import { CORPUS, preview } from "./corpus.js";
import { Typewriter } from "./Typewriter.js";

// ----------------------------------------------------------------------------
// Workflow spec - describes timing + what gets emitted
// ----------------------------------------------------------------------------

let _counter = 0;
const sid = () => `s${(++_counter).toString(16).padStart(8, "0")}`;
const tid = (doc: string) => `doc:${doc}:${Date.now()}-${_counter}`;

type LogLevel = "Info" | "Warning" | "Error";

interface ProgressItem {
    readonly name: string;
    readonly attrs?: Record<string, unknown>;
}

interface LogPoint {
    /** Fraction of step duration [0..1] when this log fires. */
    readonly at: number;
    readonly level: LogLevel;
    readonly msg: string;
}

interface StepDef {
    readonly name: string;
    readonly durationMs: number;
    readonly children?: ReadonlyArray<{ name: string; attrs?: Record<string, unknown> }>;
    /** Fine-grained progress items. Drive the counter, not the log console. */
    readonly itemsLabel?: string;
    readonly items?: ReadonlyArray<ProgressItem>;
    /** Effect.log-style events. Drive the log console. */
    readonly logs?: ReadonlyArray<LogPoint>;
    readonly failAtEnd?: boolean;
    readonly failMessage?: string;
}

interface WorkflowDef {
    readonly docName: string;
    readonly label: string;
    readonly steps: ReadonlyArray<StepDef>;
}

function genItems(prefix: string, count: number, extra: (i: number) => Record<string, unknown> = () => ({})): ProgressItem[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `${prefix} ${i + 1}/${count}`,
        attrs: { "ui.kind": "progress", index: i + 1, total: count, "chunk.text": preview(CORPUS[i % CORPUS.length]!), ...extra(i) },
    }));
}

function makeWorkflow(opts: { fail?: boolean; doc?: string; chunks?: number }): WorkflowDef {
    const chunks = opts.chunks ?? 32;
    const pages = 12;
    const doc = opts.doc ?? pickDoc();
    return {
        docName: doc,
        label: `Processing ${doc}`,
        steps: [
            {
                name: "Parse",
                durationMs: 2200,
                itemsLabel: "pages",
                items: genItems("page", pages),
                logs: [
                    { at: 0.02, level: "Info", msg: `opening ${doc}` },
                    { at: 0.95, level: "Info", msg: `parsed ${pages} pages · 4 tables · 18,402 tokens` },
                ],
            },
            {
                name: "Chunk",
                durationMs: 1400,
                itemsLabel: "chunks",
                items: genItems("chunk", chunks, (i) => ({ tokens: 480 + ((i * 37) % 240) })),
                logs: [
                    { at: 0.05, level: "Info", msg: `splitting · target=512 tok · overlap=64` },
                    { at: 0.92, level: "Info", msg: `produced ${chunks} chunks · avg 542 tok` },
                ],
            },
            {
                name: "Embed",
                durationMs: 3600,
                children: [{ name: "openai.embed", attrs: { "embeddings.model": "text-embedding-3-small" } }],
                itemsLabel: "embeddings",
                items: genItems("embed", chunks, (i) => ({ chunk: i + 1, dims: 1536 })),
                logs: [
                    { at: 0.05, level: "Info", msg: `POST openai · model=text-embedding-3-small · batch=${chunks}` },
                    { at: 0.45, level: "Warning", msg: `rate-limited · retrying in 240ms` },
                    { at: 0.95, level: "Info", msg: `embedded ${chunks} chunks · 1536-dim · 248ms` },
                ],
            },
            {
                name: "Index",
                durationMs: 1500,
                children: [{ name: "vector-store.upsert", attrs: { "db.system": "pgvector" } }],
                itemsLabel: "upserts",
                items: genItems("upsert", chunks),
                logs: opts.fail
                    ? [
                          { at: 0.1, level: "Info", msg: `connecting to pgvector://primary` },
                          { at: 0.85, level: "Error", msg: `vector-store unreachable after 3 retries` },
                      ]
                    : [
                          { at: 0.1, level: "Info", msg: `connecting to pgvector://primary` },
                          { at: 0.95, level: "Info", msg: `indexed ${chunks} vectors · committed txn 0xa8f4` },
                      ],
                failAtEnd: opts.fail,
                failMessage: opts.fail ? "vector-store unreachable" : undefined,
            },
            ...(opts.fail
                ? []
                : [
                      {
                          name: "Finalize",
                          durationMs: 500,
                          children: [{ name: "publish-event" }],
                          logs: [{ at: 0.3, level: "Info", msg: `workflow complete · 32 chunks searchable` }],
                      } as StepDef,
                  ]),
        ],
    };
}

const DOC_POOL = ["report-q3.pdf", "research-notes.md", "contract-v2.pdf", "meeting-transcript.txt", "spec-v0.4.md", "design-doc.pdf"];
let docIdx = 0;
function pickDoc() {
    return DOC_POOL[docIdx++ % DOC_POOL.length]!;
}

// ----------------------------------------------------------------------------
// Emit a workflow as a real-time stream of TraceEvents.
// ----------------------------------------------------------------------------

function runWorkflow(def: WorkflowDef): void {
    const store = getTraceStore();
    const traceId = tid(def.docName);
    const rootId = sid();
    const t0 = Date.now();

    const at = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
    const dispatch = (e: TraceEvent) => store.dispatch(e);

    dispatch({
        _tag: "TraceStart",
        traceId,
        label: def.label,
        scope: { type: "user", id: "demo" },
        timestamp: t0,
    });
    dispatch({
        _tag: "SpanStart",
        traceId,
        spanId: rootId,
        name: def.label,
        attributes: { "live-trace": true, doc: def.docName },
        timestamp: t0,
    });

    let cursor = 0;

    for (const step of def.steps) {
        const stepId = sid();
        const stepStartAt = cursor;
        const stepEndAt = cursor + step.durationMs;
        const stepFailed = !!step.failAtEnd;

        at(stepStartAt, () =>
            dispatch({
                _tag: "SpanStart",
                traceId,
                spanId: stepId,
                parentSpanId: rootId,
                name: step.name,
                attributes: { "ui.step": true, ...(step.itemsLabel ? { "items.label": step.itemsLabel } : {}) },
                timestamp: Date.now(),
            }),
        );

        // Child spans
        if (step.children) {
            const slot = step.durationMs / Math.max(1, step.children.length);
            step.children.forEach((c, i) => {
                const childId = sid();
                const cStart = stepStartAt + i * slot + 20;
                const cEnd = cStart + slot * 0.85;
                at(cStart, () =>
                    dispatch({
                        _tag: "SpanStart",
                        traceId,
                        spanId: childId,
                        parentSpanId: stepId,
                        name: c.name,
                        attributes: c.attrs ?? {},
                        timestamp: Date.now(),
                    }),
                );
                at(cEnd, () =>
                    dispatch({
                        _tag: "SpanEnd",
                        traceId,
                        spanId: childId,
                        status: "ok",
                        durationMs: cEnd - cStart,
                        timestamp: Date.now(),
                    }),
                );
            });
        }

        // Progress items
        if (step.items?.length) {
            const slot = (step.durationMs - 60) / step.items.length;
            step.items.forEach((item, i) => {
                at(stepStartAt + 30 + i * slot, () =>
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

        // Effect.log-style events
        if (step.logs?.length) {
            for (const log of step.logs) {
                at(stepStartAt + log.at * step.durationMs, () =>
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

        at(stepEndAt, () =>
            dispatch({
                _tag: "SpanEnd",
                traceId,
                spanId: stepId,
                status: stepFailed ? "error" : "ok",
                durationMs: step.durationMs,
                timestamp: Date.now(),
            }),
        );

        cursor = stepEndAt + 30;
    }

    const total = cursor;
    const failed = def.steps.some((s) => s.failAtEnd);
    at(total + 10, () => {
        dispatch({
            _tag: "SpanEnd",
            traceId,
            spanId: rootId,
            status: failed ? "error" : "ok",
            durationMs: total,
            timestamp: Date.now(),
        });
        dispatch({
            _tag: "TraceEnd",
            traceId,
            status: failed ? "failed" : "completed",
            durationMs: total,
            ...(failed ? { error: "vector-store unreachable" } : {}),
            timestamp: Date.now(),
        });
    });
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

export function Demo() {
    const traces = useActiveTraces();
    const [busy, setBusy] = useState(false);
    const initRef = useRef(false);

    const run = useCallback((opts: { fail?: boolean } = {}) => {
        setBusy(true);
        runWorkflow(makeWorkflow(opts));
        setTimeout(() => setBusy(false), 350);
    }, []);

    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        run();
    }, [run]);

    return (
        <div className="stage-stream">
            <div className="stream-controls">
                <div className="left">
                    <div className="dot-row">
                        <span />
                        <span />
                        <span />
                    </div>
                    <span>traces/user/demo</span>
                </div>
                <div className="right">
                    <button className="ctrl-btn primary" onClick={() => run()} disabled={busy}>
                        ▶ Run workflow
                    </button>
                    <button className="ctrl-btn" onClick={() => run({ fail: true })} disabled={busy}>
                        ⚠ Failing run
                    </button>
                    <button
                        className="ctrl-btn"
                        onClick={() => {
                            run();
                            setTimeout(() => run(), 220);
                            setTimeout(() => run(), 460);
                        }}
                        disabled={busy}
                    >
                        ✦ 3× concurrent
                    </button>
                </div>
            </div>

            <div className="stream-canvas">
                {traces.length === 0 ? (
                    <div className="stream-empty">no traces · click ▶ to fire one</div>
                ) : (
                    <>
                        {traces.slice(0, 2).map((t) => (
                            <TraceCard key={t.traceId} traceId={t.traceId} />
                        ))}
                        {traces.length > 2 ? (
                            <div className="stream-more">
                                +{traces.length - 2} more in the sidebar
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}

function TraceCard({ traceId }: { traceId: string }) {
    const trace = useTrace(traceId);
    const steps = useTraceSteps(traceId);

    const [, setTick] = useState(0);
    useEffect(() => {
        if (!trace || trace.status !== "running") return;
        const id = setInterval(() => setTick((n) => n + 1), 60);
        return () => clearInterval(id);
    }, [trace]);

    // Aggregate log-style events across all steps for the console panel
    const logs = useMemo(() => {
        const out: Array<{ id: string; level: LogLevel; msg: string; ts: number; step: string }> = [];
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
    }, [steps]);

    if (!trace) return null;
    const elapsed = trace.durationMs ?? Date.now() - trace.startedAt;
    const maxDur = Math.max(...steps.map((s) => s.durationMs ?? 200), 1);

    return (
        <div className={`trace ${trace.status}`}>
            <div className="trace-head">
                <div className="l">
                    <div>
                        <div className="label">{trace.label}</div>
                        <div className="tid">{trace.traceId}</div>
                    </div>
                </div>
                <div className="r">
                    <span className="elapsed">{elapsed.toFixed(0)}ms</span>
                    <span className={`status-chip ${trace.status}`}>{trace.status}</span>
                </div>
            </div>
            <div className="trace-body">
                {steps.map((s) => (
                    <Step key={s.spanId} step={s} maxDur={maxDur} />
                ))}
            </div>

            {logs.length > 0 ? <LogConsole logs={logs} done={trace.status !== "running"} /> : null}
        </div>
    );
}

function Step({ step, maxDur }: { step: SpanNode; maxDur: number }) {
    const progressEvents = step.events.filter((e) => e.attributes?.["ui.kind"] === "progress");
    const totalItems = (progressEvents[0]?.attributes?.["total"] as number | undefined) ?? undefined;
    const done = progressEvents.length;
    const itemsLabel = step.attributes["items.label"] as string | undefined;

    const barPct =
        step.status === "running"
            ? totalItems
                ? (done / totalItems) * 100
                : 30
            : ((step.durationMs ?? 0) / maxDur) * 100;

    const recentProgress = progressEvents[progressEvents.length - 1];
    const chunkFeed = useChunkFeed(step);

    return (
        <div>
            <div className={`step-row ${step.status}`}>
                <div className="marker">
                    <div className="ring" />
                </div>
                <div>
                    <span className="name">{step.name}</span>
                    {itemsLabel && totalItems ? (
                        <span className="meta">
                            <span className="mono">
                                {done.toString().padStart(String(totalItems).length, "0")}
                                <span style={{ color: "var(--muted-3)" }}> / </span>
                                {totalItems}
                            </span>
                            <span style={{ color: "var(--muted-3)" }}>·</span>
                            <span>{itemsLabel}</span>
                            {step.status === "running" && recentProgress ? (
                                <span style={{ color: "var(--muted-3)", marginLeft: 6 }}>· {recentProgress.name}</span>
                            ) : null}
                        </span>
                    ) : null}
                </div>
                <div className="bar-wrap">
                    <div className="bar" style={{ width: `${Math.min(barPct, 100)}%` }} />
                </div>
                <div className="dur">{step.durationMs != null ? `${step.durationMs.toFixed(0)}ms` : "…"}</div>
            </div>
            {step.status === "running" && chunkFeed.length > 0 ? (
                <ChunkTeleprompter feed={chunkFeed} />
            ) : null}
        </div>
    );
}

function LogConsole({ logs, done }: { logs: ReadonlyArray<{ id: string; level: LogLevel; msg: string; ts: number; step: string }>; done: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [logs.length]);

    return (
        <div className="log-console">
            <div className="log-console-head">
                <span className="lc-title">Effect.log → SpanEvent stream</span>
                <span className="lc-meta">
                    <span className="lc-dot" data-on={!done} />
                    {done ? "closed" : "live"} · {logs.length} event{logs.length === 1 ? "" : "s"}
                </span>
            </div>
            <div className="log-console-body" ref={scrollRef}>
                {logs.map((l, i) => (
                    <div key={l.id} className={`log-line ${l.level.toLowerCase()}`} style={{ opacity: i < Math.max(0, logs.length - 8) ? 0.5 : 1 }}>
                        <span className="ts">{formatTs(l.ts)}</span>
                        <span className="lvl">{l.level.slice(0, 4).toLowerCase()}</span>
                        <span className="src">[{l.step.toLowerCase()}]</span>
                        <span className="msg">
                            <Typewriter text={l.msg} cps={95} />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Build a teleprompter feed of recent chunks for a running step. Returns
 * the latest 3 chunks (newest first) with stable ids so the UI can stack
 * them with the freshest one typing in and older ones faded out.
 *
 * Sampled on a slow cadence rather than every event - chunk events fire
 * faster than a human can read, so we step at ~700ms intervals to give
 * each chunk a readable hold time. When the step ends or its spanId
 * changes, the feed resets.
 */
interface ChunkRead {
    id: number;
    idx: number;
    total: number;
    text: string;
}

/**
 * Teleprompter feed of all chunks emitted for the current step. Newest at
 * the end, oldest sliding off the top. No throttling - every progress
 * event with chunk text appears as a fresh line so a 32-chunk embed step
 * lands all 32 lines at the actual emit pace.
 */
function useChunkFeed(step: SpanNode, maxKeep = 32): ReadonlyArray<ChunkRead> {
    const [chunks, setChunks] = useState<ReadonlyArray<ChunkRead>>([]);
    const stepIdRef = useRef<string | null>(null);
    const lastIndexRef = useRef<number>(-1);
    const idCounterRef = useRef<number>(0);

    useEffect(() => {
        if (step.status !== "running") {
            setChunks([]);
            stepIdRef.current = null;
            lastIndexRef.current = -1;
            return;
        }
        if (stepIdRef.current !== step.spanId) {
            stepIdRef.current = step.spanId;
            lastIndexRef.current = -1;
            setChunks([]);
        }

        const progressEvents = step.events.filter((e) => e.attributes?.["ui.kind"] === "progress");
        if (progressEvents.length === 0) return;

        const latest = progressEvents[progressEvents.length - 1]!;
        const idx = (latest.attributes?.["index"] as number | undefined) ?? progressEvents.length;
        if (idx === lastIndexRef.current) return;
        const text = latest.attributes?.["chunk.text"] as string | undefined;
        if (!text) return;
        const total = (latest.attributes?.["total"] as number | undefined) ?? progressEvents.length;

        lastIndexRef.current = idx;
        idCounterRef.current += 1;
        const nextId = idCounterRef.current;
        setChunks((prev) => [...prev, { id: nextId, idx, total, text }].slice(-maxKeep));
    }, [step.spanId, step.status, step.events.length, maxKeep]);

    return chunks;
}

function ChunkTeleprompter({ feed }: { feed: ReadonlyArray<ChunkRead> }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [feed.length]);

    const latest = feed[feed.length - 1];

    return (
        <div className="chunk-reader">
            <div className="chunk-reader-label">
                <span className="lr-prefix">reading</span>
                <span className="lr-dot" />
                {latest ? (
                    <span className="lr-counter mono">
                        {latest.idx.toString().padStart(2, "0")}
                        <span className="lr-counter-of">/{latest.total}</span>
                    </span>
                ) : null}
            </div>
            <div className="chunk-reader-stack" ref={scrollRef}>
                {feed.map((c, i) => {
                    const isLatest = i === feed.length - 1;
                    return (
                        <div key={c.id} className={`chunk-line ${isLatest ? "fresh" : ""}`}>
                            <span className="chunk-line-idx">
                                {c.idx.toString().padStart(2, "0")}
                                <span className="chunk-line-of">/{c.total}</span>
                            </span>
                            <span className="chunk-line-text">{c.text}</span>
                        </div>
                    );
                })}
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
