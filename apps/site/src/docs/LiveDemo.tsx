/**
 * Docs-wide wrapper for the landing-page Demo + ActivityPanel, so docs pages
 * can drop in `<LiveDemo />` and get the same in-browser trace stream the
 * landing shows. No backend, no StackBlitz - the demo dispatches synthetic
 * `TraceEvent`s through the real `livetrace/react` store.
 */
import { useMemo } from "react";

import { useActiveTraces } from "livetrace/react";

import { ActivityPanel } from "../components/ActivityPanel.js";
import { Demo } from "../components/Demo.js";

export function LiveDemo() {
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
        <div className="docs-livedemo stage-grid">
            <Demo />
            <ActivityPanel totalEvents={totalEvents} />
        </div>
    );
}
