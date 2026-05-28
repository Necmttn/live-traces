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

export const processDocument = (docId: string, chunks: string[]) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(\`opening \${docId}\`);

        yield* step("Parse")(
            Effect.gen(function* () {
                yield* Effect.logInfo("extracting text · 12 pages");
            }),
        );

        yield* step("Chunk")(
            Effect.gen(function* () {
                yield* Effect.logInfo("splitting · 512 · 64");
            }),
        );

        yield* step("Embed")(
            Effect.gen(function* () {
                for (const [i, chunk] of chunks.entries()) {
                    yield* Effect.logInfo(
                        \`embed \${i + 1}/\${chunks.length} "\${chunk}…"\`,
                    );
                }
            }),
        );

        yield* step("Index")(
            Effect.gen(function* () {
                yield* Effect.logInfo("committed txn 0xa8f4");
            }),
        );

        yield* Effect.logInfo("workflow complete");
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
}

const CHUNK_COUNT = 6; // chunks emitted in the demo embed step
const STEP_META: Record<StepName, StepMeta> = {
    Parse: { total: 12, label: "pages" },
    Chunk: { total: 32, label: "chunks" },
    Embed: { total: CHUNK_COUNT, label: "embeddings" },
    Index: { total: 32, label: "upserts" },
};

interface ChunkTile {
    id: string;
    idx: number;
    text: string;
}

type Workflow = "idle" | StepName | "done";

interface State {
    line: number;
    workflow: Workflow;
    completed: ReadonlyArray<StepName>;
    chunks: ReadonlyArray<ChunkTile>;
    runId: number;
}

type Action =
    | { type: "highlight"; line: number }
    | { type: "stepStart"; name: StepName | "done" }
    | { type: "stepDone"; name: StepName }
    | { type: "chunk"; idx: number; text: string }
    | { type: "reset"; runId: number };

function reducer(s: State, a: Action): State {
    switch (a.type) {
        case "highlight":
            return { ...s, line: a.line };
        case "stepStart":
            return { ...s, workflow: a.name, chunks: a.name === "Embed" ? [] : s.chunks };
        case "stepDone":
            return { ...s, completed: [...s.completed, a.name] };
        case "chunk":
            return { ...s, chunks: [...s.chunks, { id: cryptoId(), idx: a.idx, text: a.text }].slice(-5) };
        case "reset":
            return { line: 0, workflow: "idle", completed: [], chunks: [], runId: a.runId };
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
    push(120, { type: "highlight", line: 6 });

    push(720, { type: "highlight", line: 8 });
    push(60, { type: "stepStart", name: "Parse" });
    push(180, { type: "highlight", line: 10 });
    push(700, { type: "stepDone", name: "Parse" });

    push(180, { type: "highlight", line: 14 });
    push(60, { type: "stepStart", name: "Chunk" });
    push(160, { type: "highlight", line: 16 });
    push(600, { type: "stepDone", name: "Chunk" });

    push(160, { type: "highlight", line: 20 });
    push(60, { type: "stepStart", name: "Embed" });
    push(140, { type: "highlight", line: 22 });

    chunks.forEach((c, i) => {
        push(80, { type: "highlight", line: 23 });
        push(60, { type: "highlight", line: 24 });
        push(40, { type: "chunk", idx: i + 1, text: c });
    });

    push(220, { type: "stepDone", name: "Embed" });

    push(140, { type: "highlight", line: 30 });
    push(60, { type: "stepStart", name: "Index" });
    push(160, { type: "highlight", line: 32 });
    push(500, { type: "stepDone", name: "Index" });

    push(180, { type: "highlight", line: 36 });
    push(40, { type: "stepStart", name: "done" });

    return ticks;
}

const INITIAL: State = {
    line: 0,
    workflow: "idle",
    completed: [],
    chunks: [],
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

    /** Step display data - per-step count + progress %. */
    function rowFor(name: StepName) {
        const meta = STEP_META[name];
        const isDone = state.completed.includes(name);
        const isCurrent = state.workflow === name;
        let count: number;
        let pct: number;
        if (isDone) {
            count = meta.total;
            pct = 100;
        } else if (isCurrent) {
            if (name === "Embed") {
                count = state.chunks.length;
                pct = (count / meta.total) * 100;
            } else {
                // Time-based fake progress for steps without per-item events:
                // ramp 0 → 100% across an approximate step duration.
                count = Math.round(meta.total * 0.6);
                pct = 60;
            }
        } else {
            count = 0;
            pct = 0;
        }
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
                                    <span className="uv-step-name">{name}</span>
                                    <span className="uv-step-count">
                                        {isCurrent && name !== "Embed" ? "running…" : `${count} / ${meta.total} · ${meta.label}`}
                                    </span>
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
            </div>
        </div>
    );
}
