import { useMemo } from "react";

import { useActiveTraces } from "livetraces/react";

import { ActivityPanel } from "./components/ActivityPanel.js";
import { Code } from "./components/Code.js";
import { Constellation } from "./components/Constellation.js";
import { Demo } from "./components/Demo.js";
import { LiterateDemo } from "./components/LiterateDemo.js";

export function App() {
    return (
        <>
            <nav className="nav">
                <div className="container nav-inner">
                    <div className="brand">
                        <div className="brand-dot-row">
                            <span className="brand-dot" />
                            <span className="brand-dot" />
                            <span className="brand-dot" />
                        </div>
                        livetraces
                        <span style={{ color: "var(--muted-2)", fontSize: 12 }}>v0.1.0</span>
                    </div>
                    <div className="nav-meta">
                        <a className="nav-link" href="https://github.com/necmttn/livetraces">github</a>
                        <a className="nav-link" href="https://www.npmjs.com/package/livetraces">npm</a>
                        <a className="nav-link" href="https://github.com/necmttn/livetraces/blob/main/packages/livetraces/README.md">readme</a>
                    </div>
                </div>
            </nav>

            <main className="stage">
                <Constellation />
                <div className="container">
                    <div className="stage-eyebrow">
                        <span className="live-dot" />
                        live · effect spans → react · zero-overhead
                    </div>
                    <h1 className="stage-title">Show your users what your backend is actually doing.</h1>
                    <p className="stage-sub">
                        Wrap any Effect workflow. Every span - parse a page, embed a chunk, hit a vector store - streams to
                        the browser as it happens. Same data your observability stack collects, rendered for users.
                    </p>

                    <StageGrid />

                    <div className="annotations">
                        <div className="note">
                            <div className="n">1</div>
                            <div className="body">
                                <h4>Wrap a workflow in <code>withTrace()</code></h4>
                                <p>The active scope captures every <code>Effect.withSpan</code> and <code>Effect.log</code> call inside it.</p>
                            </div>
                        </div>
                        <div className="note">
                            <div className="n">2</div>
                            <div className="body">
                                <h4>Spans batch + ship over SSE</h4>
                                <p><code>SSETransportLayer</code> fans events to subscribers per scope. Swap in WebSocket or a durable queue with ~30 lines.</p>
                            </div>
                        </div>
                        <div className="note">
                            <div className="n">3</div>
                            <div className="body">
                                <h4><code>Effect.log</code> arrives in the browser</h4>
                                <p>The bundled <code>liveTraceLogger</code> turns every <code>Effect.logInfo</code> / <code>logWarning</code> / <code>logError</code> into a <code>SpanEvent</code> on the active step. The live console above is exactly those events.</p>
                            </div>
                        </div>
                        <div className="note">
                            <div className="n">4</div>
                            <div className="body">
                                <h4>React renders this card live</h4>
                                <p><code>useActiveTraces()</code> + <code>useTraceSteps()</code> - zero-Effect frontend, works in any React 18+ app.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <section className="container literate-section">
                <div className="head">
                    <h2>Watch the code execute</h2>
                    <p>
                        Source on the left, what your user sees on the right. The highlighted line is the line that
                        just emitted the event you see appearing. Auto-loops every few seconds.
                    </p>
                </div>
                <LiterateDemo />
            </section>

            <section className="container how">
                <div className="how-head">
                    <h2>How it fits together</h2>
                    <div className="install"><b>$ bun add</b> livetraces effect</div>
                </div>

                <div className="how-step">
                    <div className="label-col">
                        <span className="step-n">01 · backend</span>
                        <h3>Compose the trace layer</h3>
                        <p><code>LiveTraceLayer</code> wraps your current tracer (native or OpenTelemetry) and pushes events into a buffered sink. The sink flushes batches to a pluggable transport.</p>
                    </div>
                    <div className="code-col">
                        <div className="code-bar"><span className="path">src/runtime.ts</span><span>typescript</span></div>
                        <div className="code-body">
                            <Code lang="tsx" code={`import { Effect, Layer, Logger } from "effect";
import {
    LiveTraceLayer,
    TraceSinkLive,
    liveTraceLogger,
} from "livetraces";
import { SSETransportLayer } from "livetraces/transports/sse";

// Replace the default logger so Effect.log → SpanEvent.
const LoggerLive = Logger.replaceScoped(
    Logger.defaultLogger,
    Effect.succeed(liveTraceLogger),
);

export const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
    Layer.provideMerge(LoggerLive),
);`} />
                        </div>
                    </div>
                </div>

                <div className="how-step">
                    <div className="label-col">
                        <span className="step-n">02 · workflow</span>
                        <h3>Wrap whatever you're doing</h3>
                        <p><code>step()</code> marks user-visible stages. <code>Effect.log</code> calls inside the scope become <code>SpanEvent</code>s on the active step.</p>
                    </div>
                    <div className="code-col">
                        <div className="code-bar"><span className="path">src/process.ts</span><span>typescript</span></div>
                        <div className="code-body">
                            <Code lang="tsx" code={`import { Effect } from "effect";
import { withTrace, step } from "livetraces";

export const processDocument = (docId: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(\`opening \${docId}\`);

        yield* step("Parse")(parsePdf(docId));
        yield* step("Embed")(embedChunks(docId));
        yield* step("Index")(indexVectors(docId));

        yield* Effect.logInfo("workflow complete");
    }).pipe(
        withTrace({
            traceId: \`doc:\${docId}\`,
            label: "Document processing",
            scope: { type: "user", id: userId },
        }),
    );`} />
                        </div>
                    </div>
                </div>

                <div className="how-step">
                    <div className="label-col">
                        <span className="step-n">03 · frontend</span>
                        <h3>Subscribe and render</h3>
                        <p>One <code>EventSource</code>, one <code>getTraceStore().dispatchBatch</code>. The hooks handle the rest - no Effect dependency, no virtual scroll gymnastics.</p>
                    </div>
                    <div className="code-col">
                        <div className="code-bar"><span className="path">src/ActivityPanel.tsx</span><span>tsx</span></div>
                        <div className="code-body">
                            <Code lang="tsx" code={`import {
    getTraceStore,
    useActiveTraces,
    useTraceSteps,
} from "livetraces/react";

const es = new EventSource(\`/traces/user/\${userId}\`);
es.onmessage = (msg) =>
    getTraceStore().dispatchBatch(JSON.parse(msg.data));

export function ActivityPanel() {
    const traces = useActiveTraces();
    return traces.map((t) => (
        <TraceCard key={t.traceId} traceId={t.traceId} />
    ));
}

function TraceCard({ traceId }) {
    const steps = useTraceSteps(traceId);
    return (
        <ol>
            {steps.map((s) => (
                <li key={s.spanId}>
                    {s.name} - {s.status}
                </li>
            ))}
        </ol>
    );
}`} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="container cta">
                <span className="cta-eyebrow">
                    <span className="d" /> ready to stream
                </span>
                <h2>Ship a live trace panel today.</h2>
                <p>
                    Drop the layer into your Effect runtime. Wire the React hooks. Your users see exactly what your
                    backend is doing - without the OpenTelemetry collector, without polling.
                </p>
                <div className="btn-row">
                    <a className="btn primary" href="https://www.npmjs.com/package/livetraces">Install</a>
                    <a className="btn secondary" href="https://github.com/necmttn/livetraces#readme">Read the docs</a>
                </div>
                <div>
                    <span className="install-tag"><b>$</b> bun add livetraces effect</span>
                </div>
            </section>

            <footer>
                <div className="container footer-inner">
                    <div className="left">
                        <span>Apache-2.0</span>
                        <span>·</span>
                        <span>built by @necmttn</span>
                        <span>·</span>
                        <span>extracted from quera</span>
                    </div>
                    <div className="right">
                        <a href="https://github.com/necmttn/livetraces">GitHub</a>
                        <a href="https://www.npmjs.com/package/livetraces">npm</a>
                        <a href="https://necmttn.com">@necmttn</a>
                    </div>
                </div>
            </footer>
        </>
    );
}

function StageGrid() {
    const traces = useActiveTraces();
    const totalEvents = useMemo(() => {
        let n = 0;
        for (const t of traces) {
            for (const span of t.spans.values()) {
                n += span.events.length;
            }
        }
        return n;
    }, [traces]);

    return (
        <div className="stage-grid">
            <Demo />
            <ActivityPanel totalEvents={totalEvents} />
        </div>
    );
}
