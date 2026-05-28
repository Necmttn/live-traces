/**
 * Compact sidebar listing every active/recent trace. Mimics the kind of
 * production multi-tenant trace board you'd build with this library - each
 * row is a real `TraceState`.
 */
import { useEffect, useState } from "react";

import { useActiveTraces } from "livetrace/react";

import { Sparkline, useEventRate, useSparklineSamples } from "./Sparkline.js";

export function ActivityPanel({ totalEvents }: { totalEvents: number }) {
    const traces = useActiveTraces();
    const rate = useEventRate(totalEvents, 180);
    const samples = useSparklineSamples(rate, 48);
    const running = traces.filter((t) => t.status === "running").length;

    // 60ms ticker so the per-row elapsed (`Date.now() - startedAt`) stays
    // fresh while the workflow is running. Store dispatches alone don't
    // re-render the panel between events.
    const [, force] = useState(0);
    useEffect(() => {
        if (running === 0) return;
        const id = setInterval(() => force((n) => n + 1), 60);
        return () => clearInterval(id);
    }, [running]);

    return (
        <aside className="activity-panel">
            <div className="ap-head">
                <span>active · traces</span>
                <span className="live">
                    <span
                        className={running > 0 ? "ap-live-dot pulse" : "ap-live-dot"}
                        style={{ width: 6, height: 6, borderRadius: 99, background: running > 0 ? "var(--accent)" : "var(--muted-3)", display: "inline-block" }}
                    />
                    {running} live
                </span>
            </div>
            <div className="ap-body">
                {traces.length === 0 ? (
                    <div className="activity-empty">idle · no traces yet</div>
                ) : (
                    traces.map((t) => {
                        const elapsed = t.durationMs ?? Date.now() - t.startedAt;
                        const doc = (t as unknown as { rootSpanId?: string }).rootSpanId
                            ? (t.spans?.values?.()?.next?.()?.value?.attributes?.["doc"] as string | undefined)
                            : undefined;
                        return (
                            <div key={t.traceId} className={`activity-row ${t.status}`}>
                                <span className="marker" />
                                <span className="doc">{doc ?? t.label}</span>
                                <span className="dur">{elapsed.toFixed(0)}ms</span>
                            </div>
                        );
                    })
                )}
            </div>
            <div className="activity-spark">
                <span>events/sec</span>
                <span className="ap-rate">{rate.toFixed(1)}</span>
                <Sparkline samples={samples} width={120} height={18} />
            </div>
        </aside>
    );
}
