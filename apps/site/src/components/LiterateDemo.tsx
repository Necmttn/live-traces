/**
 * Code-on-left, UI-on-right demo. A pre-baked workflow loops indefinitely.
 * As the simulated "execution" advances, the left-side code highlights the
 * currently running line and the right side renders the user-visible
 * effects (step changes, chunk previews, log lines).
 *
 * Fully self-contained - does NOT share the global TraceStore with the hero
 * demo, so the two don't interfere.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { Code } from "./Code.js";
import { CORPUS, preview } from "./corpus.js";
import { Typewriter } from "./Typewriter.js";

const SOURCE = `import { Effect } from "effect";
import { withTrace, step } from "livetraces";

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

type StepName = "Parse" | "Chunk" | "Embed" | "Index" | "done" | "idle";

interface LogEntry {
    id: string;
    level: "Info" | "Warning" | "Error";
    msg: string;
}

interface ChunkTile {
    id: string;
    idx: number;
    text: string;
}

interface State {
    line: number; // 1-indexed
    step: StepName;
    completed: ReadonlyArray<StepName>;
    logs: ReadonlyArray<LogEntry>;
    chunks: ReadonlyArray<ChunkTile>;
    runId: number;
}

type Action =
    | { type: "highlight"; line: number }
    | { type: "log"; level: LogEntry["level"]; msg: string }
    | { type: "stepStart"; name: StepName }
    | { type: "stepDone"; name: StepName }
    | { type: "chunk"; idx: number; text: string }
    | { type: "reset"; runId: number };

function reducer(s: State, a: Action): State {
    switch (a.type) {
        case "highlight":
            return { ...s, line: a.line };
        case "log":
            return { ...s, logs: [...s.logs, { id: cryptoId(), level: a.level, msg: a.msg }].slice(-6) };
        case "stepStart":
            return { ...s, step: a.name, chunks: a.name === "Embed" ? [] : s.chunks };
        case "stepDone":
            return { ...s, completed: [...s.completed, a.name] };
        case "chunk":
            return { ...s, chunks: [...s.chunks, { id: cryptoId(), idx: a.idx, text: a.text }].slice(-5) };
        case "reset":
            return { line: 0, step: "idle", completed: [], logs: [], chunks: [], runId: a.runId };
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
    push(160, { type: "log", level: "Info", msg: "opening report-q3.pdf" });

    push(720, { type: "highlight", line: 8 });
    push(60, { type: "stepStart", name: "Parse" });
    push(180, { type: "highlight", line: 10 });
    push(80, { type: "log", level: "Info", msg: "extracting text · 12 pages" });
    push(620, { type: "stepDone", name: "Parse" });

    push(180, { type: "highlight", line: 14 });
    push(60, { type: "stepStart", name: "Chunk" });
    push(160, { type: "highlight", line: 16 });
    push(60, { type: "log", level: "Info", msg: "splitting · target=512 · overlap=64" });
    push(540, { type: "stepDone", name: "Chunk" });

    push(160, { type: "highlight", line: 20 });
    push(60, { type: "stepStart", name: "Embed" });
    push(140, { type: "highlight", line: 22 });

    chunks.forEach((c, i) => {
        push(80, { type: "highlight", line: 23 });
        push(60, { type: "highlight", line: 24 });
        push(40, { type: "chunk", idx: i + 1, text: c });
        push(20, { type: "log", level: "Info", msg: `embed ${i + 1}/${chunks.length}` });
    });

    push(220, { type: "stepDone", name: "Embed" });

    push(140, { type: "highlight", line: 30 });
    push(60, { type: "stepStart", name: "Index" });
    push(160, { type: "highlight", line: 32 });
    push(80, { type: "log", level: "Info", msg: "committed txn 0xa8f4" });
    push(420, { type: "stepDone", name: "Index" });

    push(180, { type: "highlight", line: 36 });
    push(80, { type: "log", level: "Info", msg: "workflow complete" });
    push(40, { type: "stepStart", name: "done" });

    return ticks;
}

const STEPS_ORDER: ReadonlyArray<StepName> = ["Parse", "Chunk", "Embed", "Index"];

const INITIAL: State = {
    line: 0,
    step: "idle",
    completed: [],
    logs: [],
    chunks: [],
    runId: 0,
};

export function LiterateDemo() {
    const [state, dispatch] = useReducer(reducer, INITIAL);
    const [runId, setRunId] = useState(0);
    const timersRef = useRef<number[]>([]);

    const chunks = useMemo(() => {
        const start = (runId * 5) % CORPUS.length;
        return Array.from({ length: 6 }, (_, i) => preview(CORPUS[(start + i) % CORPUS.length]!, 64));
    }, [runId]);

    useEffect(() => {
        const schedule = buildSchedule(chunks, runId);
        // Clear any old timers from a previous cycle
        for (const id of timersRef.current) clearTimeout(id);
        timersRef.current = [];

        for (const tick of schedule) {
            const id = window.setTimeout(() => dispatch(tick.action), tick.at);
            timersRef.current.push(id);
        }
        const total = schedule[schedule.length - 1]?.at ?? 0;
        const restart = window.setTimeout(() => setRunId((n) => n + 1), total + 1800);
        timersRef.current.push(restart);

        return () => {
            for (const id of timersRef.current) clearTimeout(id);
            timersRef.current = [];
        };
    }, [chunks, runId]);

    const stepIndex = state.step === "idle" ? -1 : STEPS_ORDER.indexOf(state.step);

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
                <div className="code-bar">
                    <span className="path">user · activity panel</span>
                    <span className="step-pill">
                        {state.step === "idle" ? "starting…" : state.step === "done" ? "complete" : `${state.step.toLowerCase()}…`}
                    </span>
                </div>

                <div className="literate-steps">
                    {STEPS_ORDER.map((name, i) => {
                        const isCurrent = i === stepIndex;
                        const isDone = state.completed.includes(name);
                        return (
                            <div key={name} className={`lit-step ${isCurrent ? "current" : isDone ? "done" : "pending"}`}>
                                <span className="lit-step-dot" />
                                <span className="lit-step-name">{name}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="literate-chunks">
                    <div className="lc-head">
                        <span>recent embeddings</span>
                        <span className="lc-count">{state.chunks.length === 0 ? "-" : `${state.chunks.length} shown`}</span>
                    </div>
                    <div className="lc-list">
                        {state.chunks.length === 0 ? (
                            <div className="lc-empty">awaiting embed step…</div>
                        ) : (
                            state.chunks.map((c) => (
                                <div key={c.id} className="lc-tile">
                                    <span className="lc-idx">chunk {c.idx.toString().padStart(2, "0")}</span>
                                    <span className="lc-text">
                                        "<Typewriter text={c.text} cps={58} />"
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="literate-logs">
                    <div className="lc-head">
                        <span>effect.log → spanevent</span>
                        <span className="lc-live">
                            <span className="lc-dot live" /> live
                        </span>
                    </div>
                    <div className="lc-log-body">
                        {state.logs.length === 0 ? (
                            <div className="lc-empty">no logs yet…</div>
                        ) : (
                            state.logs.map((l) => (
                                <div key={l.id} className={`log-line ${l.level.toLowerCase()}`}>
                                    <span className="lvl">{l.level.slice(0, 4).toLowerCase()}</span>
                                    <span className="msg">
                                        <Typewriter text={l.msg} cps={90} />
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
