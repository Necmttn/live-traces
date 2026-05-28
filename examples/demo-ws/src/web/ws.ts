import type { TraceEvent } from "livetrace/types";
import { getTraceStore } from "livetrace/react";

let socket: WebSocket | null = null;

// Backend WebSocket URL. Override at build time with `VITE_WS_URL` if your
// reverse proxy / deploy URL differs from your HTTP origin; defaults to the
// dev server on :8788.
const BACKEND_WS = (import.meta.env?.VITE_WS_URL as string | undefined) ?? "ws://localhost:8788";

export function connect(scopeType: "user" | "team" | "org", scopeId: string): () => void {
    socket?.close();
    const url = `${BACKEND_WS}/traces/${scopeType}/${encodeURIComponent(scopeId)}`;
    socket = new WebSocket(url);

    socket.onmessage = (msg) => {
        try {
            const parsed = JSON.parse(msg.data) as unknown;
            // Skip the initial hello frame.
            if (parsed && typeof parsed === "object" && "_hello" in parsed) return;
            const batch = parsed as TraceEvent[];
            getTraceStore().dispatchBatch(batch);
        } catch {
            /* skip malformed payloads */
        }
    };

    return () => socket?.close();
}

export async function triggerRun(opts: { scope: string; fail?: boolean; doc?: string }): Promise<void> {
    const params = new URLSearchParams({ scope: opts.scope });
    if (opts.fail) params.set("fail", "true");
    if (opts.doc) params.set("doc", opts.doc);
    await fetch(`/run?${params}`, { method: "POST" });
}
