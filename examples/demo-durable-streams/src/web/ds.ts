/**
 * Browser-side bridge: read a durable trace stream and push events into the
 * livetrace React store.
 *
 * The backend appends NDJSON batches to `trace/<scopeType>/<scopeId>` on the
 * durable-streams server. The browser opens the same path (via the Vite
 * `/ds` proxy) using `@durable-streams/client`'s text-streaming API and
 * parses each line into a `TraceEvent`.
 */
import { stream, type StreamResponse } from "@durable-streams/client";
import type { TraceEvent } from "livetrace/types";
import { getTraceStore } from "livetrace/react";

let active: StreamResponse<unknown> | null = null;

export async function connect(scopeType: "user" | "team" | "org", scopeId: string): Promise<() => void> {
    if (active) {
        try {
            active.cancel();
        } catch {
            /* already gone */
        }
        active = null;
    }

    // `stream()` requires an absolute URL - proxy lives at /ds on this origin.
    const url = `${window.location.origin}/ds/trace/${scopeType}/${encodeURIComponent(scopeId)}`;
    const res = await stream({
        url,
        // Start from the head so users see traces fired AFTER they opened the page;
        // pass a saved offset here if you want resume-on-reload behaviour.
        offset: "-1",
        live: true,
        warnOnHttp: false,
    });
    active = res;

    let buffer = "";
    res.subscribeText((chunk) => {
        buffer += chunk.text;
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            try {
                const ev = JSON.parse(line) as TraceEvent;
                getTraceStore().dispatchBatch([ev]);
            } catch {
                /* skip malformed line */
            }
        }
    });

    return () => {
        try {
            res.cancel();
        } catch {
            /* already gone */
        }
        if (active === res) active = null;
    };
}

export async function triggerRun(opts: { scope: string; fail?: boolean; doc?: string }): Promise<void> {
    const params = new URLSearchParams({ scope: opts.scope });
    if (opts.fail) params.set("fail", "true");
    if (opts.doc) params.set("doc", opts.doc);
    await fetch(`/run?${params}`, { method: "POST" });
}
