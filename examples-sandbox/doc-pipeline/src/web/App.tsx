import { useEffect, useState } from "react";

import { getTraceStore } from "livetrace/react";
import type { TraceEvent } from "livetrace/types";

import { TraceDashboard } from "./TraceDashboard.js";

const SCOPE = "demo";

const SAMPLE_DOCS = ["report-q3.pdf", "research-notes.md", "contract-v2.pdf"] as const;

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

    async function run(doc: string) {
        setBusy(true);
        setLast(doc);
        const params = new URLSearchParams({ scope: SCOPE, doc });
        await fetch(`/run?${params}`, { method: "POST" });
        setTimeout(() => setBusy(false), 600);
    }

    return (
        <div className="page">
            <div className="page-head">
                <h1>Doc pipeline · livetrace example</h1>
                <a className="gh" href="https://github.com/necmttn/livetrace/tree/main/examples-sandbox/doc-pipeline" target="_blank" rel="noreferrer">
                    source ↗
                </a>
            </div>

            <div className="run-row">
                {SAMPLE_DOCS.map((d) => (
                    <button key={d} type="button" className="run-btn" disabled={busy} onClick={() => run(d)}>
                        ▶ process {d}
                    </button>
                ))}
                {last ? <span className="run-status">last: {last}</span> : null}
            </div>

            <TraceDashboard kind="pipeline" prompt={last ?? SAMPLE_DOCS[0]} />
        </div>
    );
}
