/**
 * Code-on-left, UI-on-right demo. A pre-baked workflow walks itself with
 * play / pause / speed controls. As the simulated "execution" advances,
 * the left-side code highlights the currently running line and the right
 * side renders a product-style user view: file header, step list with
 * per-step progress, and a live preview of recently embedded chunks.
 *
 * Fully self-contained - does NOT share the global TraceStore with the
 * hero demo, so the two don't interfere.
 *
 * Playback is RAF-driven: `position` (ms into the schedule) advances by
 * `dt * speed` each frame, and actions fire when their scheduled time
 * is reached. Pausing simply stops advancing the position.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { Code } from "./Code.js";
import { CORPUS, preview } from "./corpus.js";
import { Typewriter } from "./Typewriter.js";

const SOURCE = `import { Effect } from "effect";
import { withTrace, step } from "livetrace";

export const processDocument = (docId: string, pdf: Pdf) =>
    Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
            "doc.id": docId,
            "doc.pages": pdf.pages.length,
        });

        yield* step("Parse")(
            Effect.forEach(pdf.pages, (page) =>
                parsePage(page).pipe(
                    Effect.withSpan("parse.page", {
                        attributes: { "parse.n": page.n, "parse.total": pdf.pages.length },
                    }),
                ),
            ),
        );

        const pieces = yield* step("Chunk")(
            Effect.forEach(pdf.text, (slice, i) =>
                splitOne(slice).pipe(
                    Effect.withSpan("chunk.split", {
                        attributes: { "chunk.i": i + 1, "chunk.total": pdf.text.length },
                    }),
                ),
            ),
        );

        const vectors = yield* step("Embed")(
            Effect.forEach(pieces, (c, i) =>
                embedOne(c).pipe(
                    Effect.withSpan("embed.one", {
                        attributes: { "embed.i": i + 1, "embed.total": pieces.length },
                    }),
                ),
                { concurrency: 4 },
            ),
        );

        yield* step("Index")(
            Effect.forEach(vectors, (v, i) =>
                upsert(v).pipe(
                    Effect.withSpan("index.upsert", {
                        attributes: { "upsert.i": i + 1, "upsert.total": vectors.length },
                    }),
                ),
            ),
        );
    }).pipe(
        withTrace({
            traceId: \`doc:\${docId}\`,
            label: "Document processing",
            scope: { type: "user", id: userId },
        }),
    );
`;

type StepName = "Parse" | "Chunk" | "Embed" | "Index";

const STEPS_ORDER: ReadonlyArray<StepName> = ["Parse", "Chunk", "Embed", "Index"];

interface StepMeta {
    readonly total: number;
    readonly label: string;
    /** OTEL span name used per iteration in the source. */
    readonly span: string;
    /** Span attribute that carries the progress counter. */
    readonly counter: string;
}

const CHUNK_COUNT = 6; // chunks emitted in the demo embed step
const STEP_META: Record<StepName, StepMeta> = {
    Parse: { total: 12, label: "pages", span: "parse.page", counter: "parse.n" },
    Chunk: { total: 32, label: "chunks", span: "chunk.split", counter: "chunk.i" },
    Embed: { total: CHUNK_COUNT, label: "embeddings", span: "embed.one", counter: "embed.i" },
    Index: { total: 32, label: "upserts", span: "index.upsert", counter: "upsert.i" },
};

interface ChunkTile {
    id: string;
    idx: number;
    text: string;
}

type Workflow = "idle" | StepName | "done";

type StepCounts = Record<StepName, number>;

const ZERO_COUNTS: StepCounts = { Parse: 0, Chunk: 0, Embed: 0, Index: 0 };

interface State {
    line: number;
    workflow: Workflow;
    completed: ReadonlyArray<StepName>;
    chunks: ReadonlyArray<ChunkTile>;
    progress: StepCounts;
    runId: number;
}

type Action =
    | { type: "highlight"; line: number }
    | { type: "stepStart"; name: StepName | "done" }
    | { type: "tick"; name: StepName; done: number }
    | { type: "stepDone"; name: StepName }
    | { type: "chunk"; idx: number; text: string }
    | { type: "reset"; runId: number };

function reducer(s: State, a: Action): State {
    switch (a.type) {
        case "highlight":
            return { ...s, line: a.line };
        case "stepStart":
            return { ...s, workflow: a.name, chunks: a.name === "Embed" ? [] : s.chunks };
        case "tick":
            return { ...s, progress: { ...s.progress, [a.name]: a.done } };
        case "stepDone":
            return {
                ...s,
                completed: [...s.completed, a.name],
                progress: { ...s.progress, [a.name]: STEP_META[a.name].total },
            };
        case "chunk":
            return {
                ...s,
                chunks: [...s.chunks, { id: cryptoId(), idx: a.idx, text: a.text }].slice(-5),
                progress: { ...s.progress, Embed: a.idx },
            };
        case "reset":
            return { line: 0, workflow: "idle", completed: [], chunks: [], progress: ZERO_COUNTS, runId: a.runId };
    }
}

let _id = 0;
const cryptoId = () => `${++_id}`;

interface Tick {
    at: number;
    action: Action;
}

function buildSchedule(chunks: ReadonlyArray<string>, runId: number): ReadonlyArray<Tick> {
    const ticks: Tick[] = [];
    let t = 0;
    const push = (delta: number, a: Action) => {
        t += delta;
        ticks.push({ at: t, action: a });
    };

    push(0, { type: "reset", runId });
    push(140, { type: "highlight", line: 6 });

    // For every step the per-iter highlight stays inside the
    // `Effect.withSpan({...})` block - alternating line 14↔15 (parse) etc.
    // The two highlighted lines are always adjacent so the bar sweeps
    // smoothly within the wrapper instead of jumping over structural
    // lines (`.pipe(` / `forEach(` / closers).

    // Parse - lines 11→13→(loop 14↔15)
    push(540, { type: "highlight", line: 11 });
    push(120, { type: "highlight", line: 13 });
    push(60, { type: "stepStart", name: "Parse" });
    const parseTotal = STEP_META.Parse.total;
    for (let p = 1; p <= parseTotal; p++) {
        push(80, { type: "highlight", line: 14 });
        push(50, { type: "highlight", line: 15 });
        push(20, { type: "tick", name: "Parse", done: p });
    }
    push(160, { type: "stepDone", name: "Parse" });

    // Chunk - lines 21→23→(loop 24↔25)
    push(180, { type: "highlight", line: 21 });
    push(100, { type: "highlight", line: 23 });
    push(60, { type: "stepStart", name: "Chunk" });
    const chunkTotal = STEP_META.Chunk.total;
    for (let c = 1; c <= chunkTotal; c++) {
        push(28, { type: "highlight", line: 24 });
        push(16, { type: "highlight", line: 25 });
        push(6, { type: "tick", name: "Chunk", done: c });
    }
    push(160, { type: "stepDone", name: "Chunk" });

    // Embed - lines 31→33→(loop 34↔35) + chunk preview
    push(180, { type: "highlight", line: 31 });
    push(120, { type: "highlight", line: 33 });
    push(60, { type: "stepStart", name: "Embed" });
    chunks.forEach((c, i) => {
        push(170, { type: "highlight", line: 34 });
        push(80, { type: "highlight", line: 35 });
        push(30, { type: "chunk", idx: i + 1, text: c });
        push(20, { type: "tick", name: "Embed", done: i + 1 });
    });
    push(220, { type: "stepDone", name: "Embed" });

    // Index - lines 42→44→(loop 45↔46)
    push(180, { type: "highlight", line: 42 });
    push(100, { type: "highlight", line: 44 });
    push(60, { type: "stepStart", name: "Index" });
    const indexTotal = STEP_META.Index.total;
    for (let u = 1; u <= indexTotal; u++) {
        push(28, { type: "highlight", line: 45 });
        push(16, { type: "highlight", line: 46 });
        push(6, { type: "tick", name: "Index", done: u });
    }
    push(180, { type: "stepDone", name: "Index" });

    push(200, { type: "highlight", line: 51 });
    push(40, { type: "stepStart", name: "done" });

    return ticks;
}

const INITIAL: State = {
    line: 0,
    workflow: "idle",
    completed: [],
    chunks: [],
    progress: ZERO_COUNTS,
    runId: 0,
};

const SPEEDS: ReadonlyArray<number> = [0.5, 1, 2];

export function LiterateDemo() {
    const [state, dispatch] = useReducer(reducer, INITIAL);
    const [runId, setRunId] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [, forceRender] = useState(0);

    const chunks = useMemo(() => {
        const start = (runId * 5) % CORPUS.length;
        return Array.from({ length: CHUNK_COUNT }, (_, i) => preview(CORPUS[(start + i) % CORPUS.length]!, 72));
    }, [runId]);

    const schedule = useMemo(() => buildSchedule(chunks, runId), [chunks, runId]);

    const positionRef = useRef<number>(0);
    const idxRef = useRef<number>(0);
    const playingRef = useRef<boolean>(playing);
    const speedRef = useRef<number>(speed);
    const scheduleRef = useRef(schedule);

    useEffect(() => {
        playingRef.current = playing;
    }, [playing]);
    useEffect(() => {
        speedRef.current = speed;
    }, [speed]);
    useEffect(() => {
        scheduleRef.current = schedule;
        positionRef.current = 0;
        idxRef.current = 0;
    }, [schedule]);

    useEffect(() => {
        let raf: number | null = null;
        let last = performance.now();
        let frameCount = 0;
        const tick = (now: number) => {
            const dt = (now - last) * (playingRef.current ? speedRef.current : 0);
            last = now;
            positionRef.current += dt;

            const sched = scheduleRef.current;
            while (idxRef.current < sched.length && sched[idxRef.current]!.at <= positionRef.current) {
                dispatch(sched[idxRef.current]!.action);
                idxRef.current += 1;
            }

            const total = sched[sched.length - 1]?.at ?? 0;
            const pauseAfter = 1800 / Math.max(speedRef.current, 0.1);
            if (idxRef.current >= sched.length && positionRef.current >= total + pauseAfter) {
                setRunId((n) => n + 1);
            }

            frameCount += 1;
            if (frameCount % 6 === 0) forceRender((n) => n + 1);

            raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
        return () => {
            if (raf != null) window.cancelAnimationFrame(raf);
        };
    }, []);

    const totalMs = schedule[schedule.length - 1]?.at ?? 0;
    const progressPct = totalMs > 0 ? Math.min(100, (positionRef.current / totalMs) * 100) : 0;

    const restart = () => {
        positionRef.current = 0;
        idxRef.current = 0;
        dispatch({ type: "reset", runId });
    };
    const stepForward = () => {
        const sched = scheduleRef.current;
        if (idxRef.current >= sched.length) return;
        positionRef.current = sched[idxRef.current]!.at;
    };

    // ----- derived UI ----------------------------------------------------------

    const statusText =
        state.workflow === "idle"
            ? "starting…"
            : state.workflow === "done"
              ? "complete"
              : `${state.workflow.toLowerCase()}…`;
    const statusClass = state.workflow === "done" ? "done" : "running";

    /** Step display data - per-step count + progress %. Reads real ticks from state.progress. */
    function rowFor(name: StepName) {
        const meta = STEP_META[name];
        const isDone = state.completed.includes(name);
        const isCurrent = state.workflow === name;
        const count = state.progress[name];
        const pct = meta.total > 0 ? Math.min(100, (count / meta.total) * 100) : 0;
        return { meta, isDone, isCurrent, count, pct };
    }

    const mark = (i: number, isCurrent: boolean, isDone: boolean) => (isDone ? "✓" : isCurrent ? "●" : String(i + 1));

    return (
        <div className="literate">
            <div className="literate-code">
                <div className="code-bar">
                    <span className="path">src/process.ts</span>
                    <span className="cursor-line">▸ line {state.line || "-"}</span>
                </div>
                <div
                    className="code-body literate-source"
                    style={{ ["--active-line" as never]: state.line } as React.CSSProperties}
                    data-active-line={state.line}
                >
                    <div
                        className="line-glow"
                        style={{
                            transform: `translateY(calc((var(--active-line) - 1) * 1lh))`,
                            opacity: state.line ? 1 : 0,
                        }}
                    />
                    <div className="literate-source-inner">
                        <Code lang="tsx" code={SOURCE} />
                    </div>
                </div>
            </div>

            <div className="literate-ui">
                <div className="code-bar lit-control-bar">
                    <div className="lit-controls">
                        <button
                            type="button"
                            className="lit-ctrl"
                            onClick={() => setPlaying((p) => !p)}
                            aria-label={playing ? "Pause" : "Play"}
                            title={playing ? "Pause" : "Play"}
                        >
                            {playing ? "⏸" : "▶"}
                        </button>
                        <button
                            type="button"
                            className="lit-ctrl"
                            onClick={stepForward}
                            aria-label="Step forward"
                            title="Step forward"
                        >
                            ⏭
                        </button>
                        <button
                            type="button"
                            className="lit-ctrl"
                            onClick={restart}
                            aria-label="Restart"
                            title="Restart"
                        >
                            ⟲
                        </button>
                        <div className="lit-speed" role="group" aria-label="Playback speed">
                            {SPEEDS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={`lit-speed-opt ${s === speed ? "active" : ""}`}
                                    onClick={() => setSpeed(s)}
                                >
                                    {s}×
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lit-progress" aria-hidden="true">
                    <div className="lit-progress-bar" style={{ width: `${progressPct}%` }} />
                </div>

                <div className="uv-header">
                    <div className="uv-file">
                        <span className="uv-file-icon">PDF</span>
                        <div className="uv-file-meta">
                            <strong>report-q3.pdf</strong>
                            <span className="uv-file-sub">12 pages · 18,402 tokens</span>
                        </div>
                    </div>
                    <span className={`uv-status ${statusClass}`}>{statusText}</span>
                </div>

                <ul className="uv-steps">
                    {STEPS_ORDER.map((name, i) => {
                        const { meta, isDone, isCurrent, count, pct } = rowFor(name);
                        const cls = isCurrent ? "current" : isDone ? "done" : "pending";
                        return (
                            <li key={name} className={`uv-step ${cls}`}>
                                <div className="uv-step-head">
                                    <span className="uv-step-mark">{mark(i, isCurrent, isDone)}</span>
                                    <span className="uv-step-name">
                                        {name}
                                        <code className="uv-step-span">{meta.span}</code>
                                    </span>
                                    <span className="uv-step-count">{`${count} / ${meta.total} · ${meta.label}`}</span>
                                </div>
                                <div className="uv-bar">
                                    <div className="uv-bar-fill" style={{ width: `${pct}%` }} />
                                </div>
                            </li>
                        );
                    })}
                </ul>

                <div className="uv-preview">
                    <div className="uv-preview-head">
                        <span>recent embeddings</span>
                        <span className="uv-preview-count">
                            {state.chunks.length === 0 ? "-" : `${state.chunks.length} of ${CHUNK_COUNT}`}
                        </span>
                    </div>
                    <div className="uv-preview-list">
                        {state.chunks.length === 0 ? (
                            <div className="uv-preview-empty">awaiting embed step…</div>
                        ) : (
                            state.chunks.map((c) => (
                                <div key={c.id} className="uv-chunk">
                                    <span className="uv-chunk-idx">
                                        {c.idx.toString().padStart(2, "0")}/{CHUNK_COUNT}
                                    </span>
                                    <span className="uv-chunk-text">
                                        "<Typewriter text={c.text} cps={58} />"
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <footer className="uv-foot">
                    counts derived from span attributes - no log parsing
                </footer>
            </div>
        </div>
    );
}
