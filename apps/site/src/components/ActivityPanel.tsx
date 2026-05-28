/**
 * Compact sidebar listing every active/recent trace. Mimics the kind of
 * production multi-tenant trace board you'd build with this library - each
 * row is a real `TraceState`.
 */
import { useActiveTraces } from "live-traces/react";

import { Sparkline, useSparklineSamples } from "./Sparkline.js";

export function ActivityPanel({ totalEvents }: { totalEvents: number }) {
    const traces = useActiveTraces();
    const samples = useSparklineSamples(totalEvents, 48);
    const running = traces.filter((t) => t.status === "running").length;

    return (
        <aside className="activity-panel">
            <div className="ap-head">
                <span>active · traces</span>
                <span className="live">
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", display: "inline-block" }} />
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
                <Sparkline samples={samples} width={180} height={18} />
            </div>
        </aside>
    );
}
