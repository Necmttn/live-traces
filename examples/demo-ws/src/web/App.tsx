import { useEffect, useState } from "react";

import { useActiveTraces } from "livetrace/react";

import { TraceCard } from "./TraceCard.js";
import { connect, triggerRun } from "./ws.js";

const SCOPE = "demo-user";

export function App() {
    const traces = useActiveTraces();
    const [running, setRunning] = useState(false);

    useEffect(() => connect("user", SCOPE), []);

    async function run(fail = false) {
        setRunning(true);
        try {
            await triggerRun({ scope: SCOPE, fail });
        } finally {
            setTimeout(() => setRunning(false), 800);
        }
    }

    return (
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
            <header style={{ marginBottom: 32 }}>
                <h1 style={{ margin: 0, fontSize: 32, letterSpacing: -0.5 }}>livetrace · demo-ws</h1>
                <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 15 }}>
                    Bun + Effect server streaming spans over <strong>WebSocket</strong> → React store → this UI.
                </p>
            </header>

            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                <button onClick={() => run(false)} disabled={running} style={btn()}>
                    Run successful workflow
                </button>
                <button onClick={() => run(true)} disabled={running} style={btn("err")}>
                    Run failing workflow
                </button>
            </div>

            {traces.length === 0 ? (
                <div style={empty()}>No traces yet. Trigger a workflow above.</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {traces.map((t) => (
                        <TraceCard key={t.traceId} traceId={t.traceId} />
                    ))}
                </div>
            )}
        </div>
    );
}

function btn(kind: "default" | "err" = "default"): React.CSSProperties {
    return {
        appearance: "none",
        border: "1px solid var(--border)",
        background: kind === "err" ? "rgba(239,68,68,0.12)" : "var(--panel)",
        color: "var(--text)",
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
    };
}

function empty(): React.CSSProperties {
    return {
        padding: 48,
        border: "1px dashed var(--border)",
        borderRadius: 12,
        textAlign: "center",
        color: "var(--muted)",
    };
}
