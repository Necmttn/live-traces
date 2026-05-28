import { useTrace, useTraceSteps } from "livetrace/react";

const STATUS_COLOR: Record<string, string> = {
    running: "var(--accent)",
    completed: "var(--ok)",
    failed: "var(--err)",
    ok: "var(--ok)",
    error: "var(--err)",
};

export function TraceCard({ traceId }: { traceId: string }) {
    const trace = useTrace(traceId);
    const steps = useTraceSteps(traceId);
    if (!trace) return null;

    const elapsed = trace.durationMs ?? Date.now() - trace.startedAt;

    return (
        <div style={{ border: "1px solid var(--border)", background: "var(--panel)", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{trace.label}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>{trace.traceId}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <Badge color={STATUS_COLOR[trace.status]!}>{trace.status}</Badge>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{elapsed.toFixed(0)}ms</div>
                </div>
            </div>

            {trace.error ? (
                <div style={{ marginBottom: 12, padding: 10, background: "rgba(239,68,68,0.08)", borderRadius: 8, color: "var(--err)", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>{trace.error}</div>
            ) : null}

            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {steps.map((s) => (
                    <li key={s.spanId} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Dot color={STATUS_COLOR[s.status]!} pulse={s.status === "running"} />
                            <span>{s.name}</span>
                            {s.events.length > 0 ? (
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                    {s.events.length} event{s.events.length === 1 ? "" : "s"}
                                </span>
                            ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
                            {s.durationMs != null ? `${s.durationMs.toFixed(0)}ms` : "…"}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
    return (
        <span style={{ display: "inline-block", fontSize: 11, padding: "3px 8px", borderRadius: 999, background: color, color: "#000", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>{children}</span>
    );
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
    return (
        <span
            style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                boxShadow: pulse ? `0 0 0 0 ${color}80` : "none",
                animation: pulse ? "lt-pulse 1.4s ease-out infinite" : undefined,
            }}
        >
            <style>{`@keyframes lt-pulse { 0% { box-shadow: 0 0 0 0 currentColor; opacity: 1; } 70% { box-shadow: 0 0 0 8px transparent; opacity: 0.4; } 100% { opacity: 1; } }`}</style>
        </span>
    );
}
