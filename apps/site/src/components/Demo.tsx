/**
 * In-page interactive demo. No backend - events are generated client-side
 * with realistic timing and fed into the same TraceStore that the real
 * package would use. This makes the marketing page fully static-deployable
 * while still rendering the actual library UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { TraceEvent } from "live-traces/types";
import { getTraceStore, useActiveTraces, useTrace, useTraceSteps } from "live-traces/react";

let counter = 0;
const sid = () => `s${(++counter).toString(16).padStart(8, "0")}`;
const tid = (label: string) => `${label}:${Date.now()}-${counter}`;

interface StepSpec {
    readonly name: string;
    readonly durationMs: number;
    /** Inner non-step spans run inside this step. */
    readonly children?: ReadonlyArray<{ name: string; durationMs: number; attrs?: Record<string, unknown> }>;
    readonly logs?: ReadonlyArray<{ level: "Info" | "Warning" | "Error"; msg: string; at: number }>;
}

interface WorkflowSpec {
    readonly label: string;
    readonly steps: ReadonlyArray<StepSpec>;
    readonly fail?: boolean;
}

const SUCCESS_WORKFLOW: WorkflowSpec = {
    label: "Processing report.pdf",
    steps: [
        {
            name: "Parse",
            durationMs: 420,
            children: [
                { name: "read-bytes", durationMs: 160 },
                { name: "extract-text", durationMs: 220 },
            ],
            logs: [
                { level: "Info", msg: "opening report.pdf", at: 20 },
                { level: "Info", msg: "parsed 12 pages, 4 tables", at: 380 },
            ],
        },
        {
            name: "Embed",
            durationMs: 520,
            children: [
                { name: "chunk", durationMs: 110 },
                { name: "openai.embed", durationMs: 360, attrs: { "embeddings.model": "text-embedding-3-small", "embeddings.batch": 32 } },
            ],
            logs: [{ level: "Info", msg: "embedded 32 chunks", at: 480 }],
        },
        {
            name: "Index",
            durationMs: 180,
            children: [{ name: "vector-store.upsert", durationMs: 140, attrs: { "db.system": "pgvector" } }],
            logs: [{ level: "Info", msg: "upsert ok", at: 160 }],
        },
        {
            name: "Finalize",
            durationMs: 90,
            children: [{ name: "publish-event", durationMs: 70 }],
            logs: [{ level: "Info", msg: "workflow complete", at: 80 }],
        },
    ],
};

const FAILING_WORKFLOW: WorkflowSpec = {
    label: "Processing report.pdf",
    fail: true,
    steps: [
        SUCCESS_WORKFLOW.steps[0]!,
        SUCCESS_WORKFLOW.steps[1]!,
        {
            name: "Index",
            durationMs: 160,
            children: [{ name: "vector-store.upsert", durationMs: 130, attrs: { "db.system": "pgvector" } }],
            logs: [{ level: "Error", msg: "vector-store unreachable", at: 130 }],
        },
    ],
};

/** Run a workflow spec, dispatching events into the store with realistic delays. */
function runSpec(spec: WorkflowSpec): void {
    const store = getTraceStore();
    const traceId = tid("doc:report.pdf");
    const rootId = sid();
    const t0 = Date.now();

    store.dispatch({
        _tag: "TraceStart",
        traceId,
        label: spec.label,
        scope: { type: "user", id: "demo" },
        timestamp: t0,
    });

    store.dispatch({
        _tag: "SpanStart",
        traceId,
        spanId: rootId,
        name: spec.label,
        attributes: { "live-trace": true },
        timestamp: t0,
    });

    let cursor = 0;

    for (const step of spec.steps) {
        const stepId = sid();
        const stepStartAt = cursor;

        setTimeout(() => {
            store.dispatch({
                _tag: "SpanStart",
                traceId,
                spanId: stepId,
                parentSpanId: rootId,
                name: step.name,
                attributes: { "ui.step": true },
                timestamp: Date.now(),
            });
        }, stepStartAt);

        if (step.children) {
            let childCursor = stepStartAt + 5;
            for (const child of step.children) {
                const childId = sid();
                const childStart = childCursor;
                const childEnd = childCursor + child.durationMs;
                setTimeout(() => {
                    store.dispatch({
                        _tag: "SpanStart",
                        traceId,
                        spanId: childId,
                        parentSpanId: stepId,
                        name: child.name,
                        attributes: child.attrs ?? {},
                        timestamp: Date.now(),
                    });
                }, childStart);
                setTimeout(() => {
                    store.dispatch({
                        _tag: "SpanEnd",
                        traceId,
                        spanId: childId,
                        status: "ok",
                        durationMs: child.durationMs,
                        timestamp: Date.now(),
                    });
                }, childEnd);
                childCursor = childEnd + 10;
            }
        }

        if (step.logs) {
            for (const log of step.logs) {
                setTimeout(() => {
                    store.dispatch({
                        _tag: "SpanEvent",
                        traceId,
                        spanId: stepId,
                        name: log.msg,
                        level: log.level,
                        timestamp: Date.now(),
                    });
                }, stepStartAt + log.at);
            }
        }

        const stepEndAt = cursor + step.durationMs;
        const stepFailed = spec.fail && step === spec.steps[spec.steps.length - 1];
        setTimeout(() => {
            store.dispatch({
                _tag: "SpanEnd",
                traceId,
                spanId: stepId,
                status: stepFailed ? "error" : "ok",
                durationMs: step.durationMs,
                timestamp: Date.now(),
            });
        }, stepEndAt);

        cursor = stepEndAt + 30;
    }

    const total = cursor;
    setTimeout(() => {
        store.dispatch({
            _tag: "SpanEnd",
            traceId,
            spanId: rootId,
            status: spec.fail ? "error" : "ok",
            durationMs: total,
            timestamp: Date.now(),
        });
        store.dispatch({
            _tag: "TraceEnd",
            traceId,
            status: spec.fail ? "failed" : "completed",
            durationMs: total,
            error: spec.fail ? "vector-store unreachable" : undefined,
            timestamp: Date.now(),
        } as TraceEvent);
    }, total + 10);
}

export function Demo() {
    const traces = useActiveTraces();
    const [running, setRunning] = useState(false);
    const ranInitialRef = useRef(false);

    const run = useCallback((spec: WorkflowSpec) => {
        setRunning(true);
        runSpec(spec);
        setTimeout(() => setRunning(false), 600);
    }, []);

    useEffect(() => {
        // Auto-run a single trace on first load so the panel isn't empty.
        if (ranInitialRef.current) return;
        ranInitialRef.current = true;
        run(SUCCESS_WORKFLOW);
    }, [run]);

    return (
        <div className="demo-wrap">
            <aside className="demo-controls">
                <h3>Try it</h3>
                <p className="help">
                    These buttons emit the same <code>TraceEvent</code>s that a real Effect backend produces. The UI below uses the package's React hooks directly - what you see is what your app renders.
                </p>
                <div className="btns">
                    <button className="btn primary" disabled={running} onClick={() => run(SUCCESS_WORKFLOW)}>
                        Run successful workflow
                    </button>
                    <button className="btn" disabled={running} onClick={() => run(FAILING_WORKFLOW)}>
                        Run failing workflow
                    </button>
                </div>
            </aside>

            <div className="demo-stream">
                {traces.length === 0 ? (
                    <div className="empty">No traces yet. Click a button to emit one.</div>
                ) : (
                    traces.map((t) => <TraceCard key={t.traceId} traceId={t.traceId} />)
                )}
            </div>
        </div>
    );
}

function TraceCard({ traceId }: { traceId: string }) {
    const trace = useTrace(traceId);
    const steps = useTraceSteps(traceId);
    if (!trace) return null;
    const elapsed = trace.durationMs ?? Date.now() - trace.startedAt;

    return (
        <div className="trace-card">
            <div className="trace-head">
                <div>
                    <div className="label">{trace.label}</div>
                    <div className="tid">{trace.traceId}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <span className={`badge ${trace.status}`}>{trace.status}</span>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, fontFamily: "var(--mono)" }}>
                        {elapsed.toFixed(0)}ms
                    </div>
                </div>
            </div>
            <ol className="steps">
                {steps.map((s) => (
                    <li key={s.spanId} className="step">
                        <div className="name">
                            <span className={`dot ${s.status === "running" ? "running" : s.status === "ok" ? "ok" : "error"}`} />
                            <span>{s.name}</span>
                            {s.events.length > 0 ? <span className="ev">· {s.events.length} event{s.events.length === 1 ? "" : "s"}</span> : null}
                        </div>
                        <div className="dur">{s.durationMs != null ? `${s.durationMs.toFixed(0)}ms` : "…"}</div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
