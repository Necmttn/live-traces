import { useEffect, useState } from "react";

import { getTraceStore } from "livetrace/react";
import type { TraceEvent } from "livetrace/types";

import { TraceDashboard } from "./TraceDashboard.js";

const SCOPE = "demo";

const SAMPLE_QUERIES = [
    "How did Q3 revenue compare to the plan?",
    "What's the status of SOC 2 and the pen test?",
    "Summarize the infra and migration progress.",
] as const;

export function App() {
    const [busy, setBusy] = useState(false);
    const [last, setLast] = useState<string | null>(null);

    useEffect(() => {
        const es = new EventSource(`/traces/user/${SCOPE}`);
        es.onmessage = (msg) => {
            try {
                const batch = JSON.parse(msg.data) as TraceEvent[];
                getTraceStore().dispatchBatch(batch);
            } catch {
                /* skip malformed payloads */
            }
        };
        return () => es.close();
    }, []);

    async function run(query: string) {
        setBusy(true);
        setLast(query);
        const params = new URLSearchParams({ scope: SCOPE, q: query });
        await fetch(`/run?${params}`, { method: "POST" });
        setTimeout(() => setBusy(false), 600);
    }

    return (
        <div className="page">
            <div className="page-head">
                <h1>RAG agent · livetrace example</h1>
                <a className="gh" href="https://github.com/necmttn/livetrace/tree/main/examples-sandbox/agent-rag" target="_blank" rel="noreferrer">
                    source ↗
                </a>
            </div>

            <div className="run-row">
                {SAMPLE_QUERIES.map((q) => (
                    <button key={q} type="button" className="run-btn" disabled={busy} onClick={() => run(q)}>
                        ▶ {q.slice(0, 36)}{q.length > 36 ? "…" : ""}
                    </button>
                ))}
                {last ? <span className="run-status">last: "{last.slice(0, 48)}{last.length > 48 ? "…" : ""}"</span> : null}
            </div>

            <TraceDashboard kind="rag" prompt={last ?? SAMPLE_QUERIES[0]} />
        </div>
    );
}
