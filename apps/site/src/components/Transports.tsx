import { useState } from "react";

import { Code } from "./Code.js";

interface TransportSpec {
    readonly id: string;
    readonly label: string;
    readonly path: string;
    readonly code: string;
    readonly tagline: string;
    readonly traits: ReadonlyArray<readonly [string, string]>;
}

const TRANSPORTS: ReadonlyArray<TransportSpec> = [
    {
        id: "sse",
        label: "SSE",
        path: "src/runtime.ts",
        tagline: "One-way HTTP. Zero deps. The default.",
        traits: [
            ["latency", "p50 ~20ms"],
            ["direction", "server → client"],
            ["persistence", "in-memory broker"],
            ["scale-out", "sticky session / single pod"],
        ],
        code: `import { Layer, Logger } from "effect";
import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace";
import { SSETransportLayer } from "livetrace/transports/sse";

export const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
    Layer.provideMerge(Logger.replaceScoped(Logger.defaultLogger, liveTraceLogger)),
);

// HTTP handler
app.get("/traces/:type/:id", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    const off = getSseBroker().subscribe(
        { type: req.params.type, id: req.params.id },
        (events) => res.write(\`data: \${JSON.stringify(events)}\\n\\n\`),
    );
    req.on("close", off);
});`,
    },
    {
        id: "ws",
        label: "WebSocket",
        path: "src/runtime.ts",
        tagline: "Full duplex. Client acks, replay cursors, lower overhead at scale.",
        traits: [
            ["latency", "p50 ~5ms"],
            ["direction", "bi-directional"],
            ["persistence", "in-memory broker"],
            ["scale-out", "sticky session + room sharding"],
        ],
        code: `import { Layer, Logger } from "effect";
import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace";
import { WSTransportLayer, getWsBroker } from "livetrace/transports/ws";

export const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(WSTransportLayer),
    Layer.provideMerge(Logger.replaceScoped(Logger.defaultLogger, liveTraceLogger)),
);

// WS upgrade
wss.on("connection", (socket, req) => {
    const scope = parseScope(req.url);
    const off = getWsBroker().subscribe(scope, (events) =>
        socket.send(JSON.stringify(events)),
    );
    socket.on("close", off);
});`,
    },
    {
        id: "durable",
        label: "Durable",
        path: "src/runtime.ts",
        tagline: "Append-only log. Resume from cursor after disconnect. Multi-pod safe.",
        traits: [
            ["latency", "p50 ~30ms"],
            ["direction", "pull + tail"],
            ["persistence", "Redis Streams / DO / NATS"],
            ["scale-out", "any pod, any region"],
        ],
        code: `import { Layer, Logger } from "effect";
import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace";
import { DurableTransportLayer, getDurableLog } from "livetrace/transports/durable";

export const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(DurableTransportLayer),
    Layer.provideMerge(Logger.replaceScoped(Logger.defaultLogger, liveTraceLogger)),
);

// Resume from cursor
app.get("/traces/:type/:id", async (req, res) => {
    const cursor = Number(req.headers["last-event-id"] ?? 0);
    const { entries, nextCursor } = await getDurableLog().readFrom(
        { type: req.params.type, id: req.params.id }, cursor,
    );
    for (const e of entries) res.write(\`id: \${e.seq}\\ndata: \${JSON.stringify(e.events)}\\n\\n\`);
    // ...tail live from nextCursor
});`,
    },
];

export function TransportTabs() {
    const [activeId, setActiveId] = useState(TRANSPORTS[0]!.id);
    const active = TRANSPORTS.find((t) => t.id === activeId) ?? TRANSPORTS[0]!;
    return (
        <div className="code-col transport-tabs">
            <div className="code-bar transport-bar">
                <div className="transport-tabstrip">
                    {TRANSPORTS.map((t) => (
                        <button
                            key={t.id}
                            className={`transport-tab ${t.id === activeId ? "active" : ""}`}
                            onClick={() => setActiveId(t.id)}
                            type="button"
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <span>typescript</span>
            </div>
            <div className="code-body">
                <Code lang="tsx" code={active.code} />
            </div>
        </div>
    );
}

export function TransportCards() {
    return (
        <section className="container transports-section">
            <div className="how-head">
                <h2>Pick your transport</h2>
                <div className="install">
                    <b>livetrace</b>/transports/&#123;sse,ws,durable&#125;
                </div>
            </div>
            <p className="transports-lede">
                Same <code>TraceTransport</code> interface. Same <code>TraceSink</code> upstream. Swap one Layer to
                change how events leave your process.
            </p>
            <div className="transport-grid">
                {TRANSPORTS.map((t) => (
                    <article key={t.id} className="transport-card">
                        <header>
                            <span className="transport-card-tag">{t.label}</span>
                            <h3>{t.tagline}</h3>
                        </header>
                        <dl className="transport-traits">
                            {t.traits.map(([k, v]) => (
                                <div key={k}>
                                    <dt>{k}</dt>
                                    <dd>{v}</dd>
                                </div>
                            ))}
                        </dl>
                        <code className="transport-import">livetrace/transports/{t.id}</code>
                    </article>
                ))}
            </div>
        </section>
    );
}
