/**
 * Demo server (Node-compatible, for StackBlitz / CodeSandbox WebContainers).
 *
 *   POST /run?scope=<scopeId>&fail=<bool>     → kicks off a workflow in the background
 *   WS   /traces/user/:scopeId                  → batched trace events for that scope
 *
 * Run with `npm run server`. Frontend on :5174 proxies to here.
 *
 * The canonical Bun version lives at `examples/demo-ws/src/server.ts`.
 */
import { createServer } from "node:http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import { WebSocketServer, type WebSocket } from "ws";

import { LiveTraceLayer, TraceSinkLive, liveTraceLogger } from "livetrace";
import { WSTransportLayer, getWsBroker } from "livetrace/transports/ws";
import type { TraceScope } from "livetrace/types";

import { runWorkflow } from "./workflow.js";

const TraceLive = LiveTraceLayer.pipe(
    Layer.provide(TraceSinkLive({ flushIntervalMs: 100 })),
    Layer.provide(WSTransportLayer),
);

const LoggerLive = Logger.replaceScoped(Logger.defaultLogger, Effect.succeed(liveTraceLogger));
const Runtime = Layer.merge(TraceLive, LoggerLive);

const PORT = Number(process.env.PORT ?? 8788);

const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
    }

    if (url.pathname === "/run" && req.method === "POST") {
        const scope = url.searchParams.get("scope") ?? "demo-user";
        const fail = url.searchParams.get("fail") === "true";
        const docId = url.searchParams.get("doc") ?? `report-${Date.now() % 10000}.pdf`;

        void Effect.runPromise(
            runWorkflow({ docId, scopeId: scope, fail }).pipe(
                Effect.provide(Runtime),
                Effect.scoped,
                Effect.catchAll(() => Effect.void),
            ),
        );

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ ok: true, traceScope: scope, docId }));
        return;
    }

    res.writeHead(404);
    res.end("not found");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const match = url.pathname.match(/^\/traces\/(team|org|user)\/(.+)$/);
    if (!match) {
        socket.destroy();
        return;
    }
    const [, type, id] = match;
    const scope: TraceScope = { type: type as "user", id: id! };

    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, scope);
    });
});

wss.on("connection", (ws: WebSocket, _req, scope: TraceScope) => {
    ws.send(JSON.stringify({ _hello: true }));
    const unsub = getWsBroker().subscribe(scope, (events) => {
        try {
            ws.send(JSON.stringify(events));
        } catch {
            /* socket gone */
        }
    });
    ws.on("close", () => unsub());
});

server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[demo-ws] server http://localhost:${PORT}  (ws /traces/...)`);
});
