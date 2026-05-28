import type { TraceEvent } from "livetrace/types";
import { getTraceStore } from "livetrace/react";

let es: EventSource | null = null;

export function connect(scopeType: "user" | "team" | "org", scopeId: string): () => void {
    if (es) es.close();
    es = new EventSource(`/traces/${scopeType}/${encodeURIComponent(scopeId)}`);
    es.onmessage = (msg) => {
        try {
            const batch = JSON.parse(msg.data) as TraceEvent[];
            getTraceStore().dispatchBatch(batch);
        } catch {
            /* skip malformed payloads */
        }
    };
    return () => es?.close();
}

export async function triggerRun(opts: { scope: string; fail?: boolean; doc?: string }): Promise<void> {
    const params = new URLSearchParams({ scope: opts.scope });
    if (opts.fail) params.set("fail", "true");
    if (opts.doc) params.set("doc", opts.doc);
    await fetch(`/run?${params}`, { method: "POST" });
}
