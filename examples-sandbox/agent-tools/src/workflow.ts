/**
 * Agent + tools pattern - Think → tool call → observe → think → answer.
 *
 * The shape:
 *   - One outer `withTrace` scope per agent run.
 *   - Each `Think N` is a `step()` wrapping an LLM call (`Effect.withSpan`).
 *   - Each tool call is its own `step()` so it appears as a discrete row
 *     in the UI. Inside, `Effect.withSpan` carries `tool.name` plus the
 *     args/result on the span so you can inspect them in the trace.
 *   - `Effect.logInfo` calls show the reasoning + tool invocations as
 *     SpanEvents on the active step.
 *
 * Adapted from the canonical Anthropic / OpenAI tool-use loop: the model
 * proposes a tool, the host runs it, the result feeds back into the next
 * Think, and eventually the model emits the final answer.
 */
import * as Effect from "effect/Effect";

import { step, withTrace } from "livetrace";

const sleep = (ms: number) => Effect.sleep(`${ms} millis`);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const think = (turn: number, tool: string, why: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`reasoning · need to call ${tool}() - ${why}`);
        yield* Effect.withSpan(sleep(520), "llm.chat", {
            attributes: {
                "llm.model": "claude-opus-4-7",
                "tokens.in": 180 + turn * 60,
                "tokens.out": 36,
                "cost.usd": 0.0004 * turn,
                "agent.turn": turn,
            },
        });
        yield* Effect.logInfo(`tool_use · ${tool}`);
    });

const callTool = (name: string, args: Record<string, unknown>, durationMs: number, result: string) =>
    Effect.gen(function* () {
        yield* Effect.logInfo(`${name}(${JSON.stringify(args).slice(0, 64)})`);
        yield* Effect.withSpan(sleep(durationMs), `tool.${name}`, {
            attributes: {
                "tool.name": name,
                "tool.args": JSON.stringify(args),
            },
        });
        yield* Effect.logInfo(`← ${result.slice(0, 90)}`);
    });

const generate = () =>
    Effect.gen(function* () {
        yield* Effect.logInfo("claude-opus-4-7 · TTFT 280ms · streaming");
        yield* Effect.withSpan(sleep(1800), "llm.generate", {
            attributes: {
                "llm.model": "claude-opus-4-7",
                "tokens.in": 920,
                "tokens.out": 84,
                "cost.usd": 0.012,
            },
        });
        yield* Effect.logInfo("complete · stop=end_turn");
    });

// ----------------------------------------------------------------------------
// Outer workflow
// ----------------------------------------------------------------------------

export interface AgentOptions {
    readonly query: string;
    readonly scopeId: string;
}

export const runWorkflow = ({ query, scopeId }: AgentOptions) =>
    Effect.gen(function* () {
        // Turn 1: web.search
        yield* step("Think 1")(think(1, "web.search", "need a current weather forecast"));
        yield* step("web.search")(
            callTool(
                "web.search",
                { query: "Lisbon weather forecast tomorrow", k: 3 },
                380,
                "Lisbon · Nov 14 · 18°C high · 12°C low · partly cloudy · 10% precipitation",
            ),
        );

        // Turn 2: calendar.peek
        yield* step("Think 2")(think(2, "calendar.peek", "check schedule for outdoor planning window"));
        yield* step("calendar.peek")(
            callTool(
                "calendar.peek",
                { date: "2026-11-14", scope: "team" },
                460,
                "3 events · 10:00 standup · 14:00 board prep · 16:30 1:1 (remote)",
            ),
        );

        // Final answer
        yield* step("Generate")(generate());
    }).pipe(
        withTrace({
            traceId: `agent:${Date.now()}`,
            label: `agent · ${query}`,
            scope: { type: "user", id: scopeId },
        }),
    );
