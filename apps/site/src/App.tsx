import { CodeTabs } from "./components/CodeTabs.js";
import { Demo } from "./components/Demo.js";

export function App() {
    return (
        <>
            <header className="container">
                <nav className="nav">
                    <div className="nav-brand">
                        <Logo /> live-traces
                    </div>
                    <div className="nav-links">
                        <a href="#features">Features</a>
                        <a href="#demo">Demo</a>
                        <a href="#install">Install</a>
                        <a href="https://github.com/necmttn/live-traces">GitHub</a>
                    </div>
                </nav>
            </header>

            <section className="container hero" style={{ borderTop: "none" }}>
                <span className="hero-eyebrow"><Dot /> Real-time span streaming</span>
                <h1>
                    Stream <span className="grad">Effect spans</span><br />
                    straight into your UI.
                </h1>
                <p className="hero-sub">
                    <code>live-traces</code> wraps the Effect tracer and pushes every span - start, end, log event - to a React store as it happens. Same data your observability stack uses, rendered for users instead of ops.
                </p>
                <div className="cta-row">
                    <a className="btn primary" href="#install">Get started</a>
                    <a className="btn" href="https://github.com/necmttn/live-traces">View on GitHub →</a>
                </div>
                <div className="btn-row-meta">
                    bun add live-traces effect
                </div>
            </section>

            <section className="container" id="features">
                <h2>What you get</h2>
                <p className="lede">Built on Effect's first-class tracing, designed for the frontend.</p>
                <div className="grid-3">
                    <Feature title="Drop-in Tracer decorator" body="One layer. Composes with @effect/opentelemetry - OTel still exports, live-traces just observes. No double instrumentation." />
                    <Feature title="Wire format is JSON" body="Discriminated union on _tag. Backends in Go, Python, Rust can emit it. Frontend doesn't care where it came from." />
                    <Feature title="Pluggable transport" body="SSE ships in the box. WebSocket, durable queues, console for dev - implement TraceTransport and you're done." />
                    <Feature title="Zero-Effect frontend" body="live-traces/react is useSyncExternalStore + a reducer. Drop it into any React 18+ app." />
                    <Feature title="Per-scope routing" body="Trace events route by scope (team / org / user). Each subscriber sees only its own traces - multi-tenant safe." />
                    <Feature title="UI-first ergonomics" body="step() marks user-visible stages. liveTraceLogger turns Effect.log calls into SpanEvents on the active step." />
                </div>
            </section>

            <section className="container" id="demo">
                <h2>See it run</h2>
                <p className="lede">
                    The cards below are rendered by the same <code>useActiveTraces</code> hook your app would use. Click a button to fire a workflow.
                </p>
                <Demo />
            </section>

            <section className="container">
                <h2>How it looks in code</h2>
                <p className="lede">Three files: backend setup, the wrapped workflow, the React panel.</p>
                <CodeTabs
                    tabs={[
                        {
                            label: "1. backend layer",
                            code: `import { Layer } from "effect";
import {
    LiveTraceLayer,
    TraceSinkLive,
    liveTraceLogger,
} from "live-traces";
import { SSETransportLayer } from "live-traces/transports/sse";

export const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
);`,
                        },
                        {
                            label: "2. wrap a workflow",
                            code: `import { Effect } from "effect";
import { withTrace, step } from "live-traces";

export const processDocument = (docId: string) =>
    Effect.gen(function* () {
        yield* step("Parse")(parsePdf(docId));
        yield* step("Embed")(embedChunks(docId));
        yield* step("Index")(indexVectors(docId));
    }).pipe(
        withTrace({
            traceId: \`doc:\${docId}\`,
            label: "Document processing",
            scope: { type: "user", id: userId },
        }),
    );`,
                        },
                        {
                            label: "3. render in React",
                            code: `import { useActiveTraces, useTraceSteps, getTraceStore } from "live-traces/react";

// Connect once at app mount:
const es = new EventSource(\`/traces/user/\${userId}\`);
es.onmessage = (msg) =>
    getTraceStore().dispatchBatch(JSON.parse(msg.data));

export function ActivityPanel() {
    const traces = useActiveTraces();
    return traces.map((t) => <TraceCard key={t.traceId} {...t} />);
}

function TraceCard({ traceId, label, status }) {
    const steps = useTraceSteps(traceId);
    return (
        <article>
            <h3>{label} · {status}</h3>
            <ol>
                {steps.map((s) => (
                    <li key={s.spanId}>
                        {s.name} - {s.status}
                        {s.durationMs && \` (\${s.durationMs.toFixed(0)}ms)\`}
                    </li>
                ))}
            </ol>
        </article>
    );
}`,
                        },
                    ]}
                />
            </section>

            <section className="container" id="install">
                <h2>Install</h2>
                <p className="lede">Requires Effect 3.10+ and React 18+ (React is optional).</p>
                <pre>
                    <code>{`bun add live-traces effect
# or
npm install live-traces effect
# or
pnpm add live-traces effect`}</code>
                </pre>
                <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16 }}>
                    Full quickstart, OpenTelemetry composition guide, and SSE server example in the{" "}
                    <a href="https://github.com/necmttn/live-traces/blob/main/packages/live-traces/README.md">package README</a>.
                </p>
            </section>

            <footer>
                <div className="container">
                    <p>
                        Apache-2.0 licensed · built by <a href="https://necmttn.com">@necmttn</a> · source on{" "}
                        <a href="https://github.com/necmttn/live-traces">GitHub</a>
                    </p>
                </div>
            </footer>
        </>
    );
}

function Feature({ title, body }: { title: string; body: string }) {
    return (
        <div className="feature">
            <h3>{title}</h3>
            <p>{body}</p>
        </div>
    );
}

function Logo() {
    return (
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="8" cy="16" r="3" fill="#7c5cff" />
            <circle cx="16" cy="16" r="3" fill="#7c5cff" opacity="0.65" />
            <circle cx="24" cy="16" r="3" fill="#7c5cff" opacity="0.3" />
        </svg>
    );
}

function Dot() {
    return <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />;
}
