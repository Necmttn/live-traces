/**
 * Demo server (Node-compatible, for StackBlitz / CodeSandbox WebContainers).
 *
 *   POST /run?scope=<scopeId>&fail=<bool>  → kicks off a workflow in the background
 *   GET  /traces/user/:scopeId              → SSE stream of trace events for that scope
 *
 * Run with `npm run server`. Frontend on :5173 proxies to here.
 *
 * Pattern: document pipeline (Parse → Chunk → Embed → Index). The workflow
 * lives in `src/workflow.ts`.
 */
import { serve } from "@hono/node-server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";

import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace";
import { SSETransportLayer, getSseBroker } from "livetrace/transports/sse";

import { runWorkflow } from "./workflow.js";

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(SSETransportLayer),
);

const LoggerLive = Logger.replaceScoped(Logger.defaultLogger, Effect.succeed(liveTraceLogger));

const Runtime = Layer.merge(TraceLive, LoggerLive);

function sseHeaders(): HeadersInit {
    return {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
    };
}

const PORT = Number(process.env.PORT ?? 8787);

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    if (url.pathname === "/run" && req.method === "POST") {
        const scope = url.searchParams.get("scope") ?? "demo-user";
        const docId = url.searchParams.get("doc") ?? `report-${Date.now() % 10000}.pdf`;

        void Effect.runPromise(
            runWorkflow({ docId, scopeId: scope }).pipe(
                Effect.provide(Runtime),
                Effect.scoped,
                Effect.catchAll(() => Effect.void),
            ),
        );

        return new Response(JSON.stringify({ ok: true, traceScope: scope, docId }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }

    const match = url.pathname.match(/^\/traces\/(team|org|user)\/(.+)$/);
    if (match) {
        const [, type, id] = match;
        return new Response(
            new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    controller.enqueue(encoder.encode(`: connected\n\n`));

                    const unsub = getSseBroker().subscribe(
                        { type: type as "user", id: id! },
                        (events) => {
                            try {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(events)}\n\n`));
                            } catch {
                                /* connection closed */
                            }
                        },
                    );

                    const heartbeat = setInterval(() => {
                        try {
                            controller.enqueue(encoder.encode(": hb\n\n"));
                        } catch {
                            /* closed */
                        }
                    }, 15_000);

                    req.signal.addEventListener("abort", () => {
                        clearInterval(heartbeat);
                        unsub();
                        try {
                            controller.close();
                        } catch {
                            /* already closed */
                        }
                    });
                },
            }),
            { headers: sseHeaders() },
        );
    }

    return new Response("not found", { status: 404 });
}

serve({ fetch: handler, port: PORT });

// eslint-disable-next-line no-console
console.log(`[doc-pipeline] server http://localhost:${PORT}`);
