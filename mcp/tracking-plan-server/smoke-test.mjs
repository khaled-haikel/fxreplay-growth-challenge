/**
 * Smoke test for the tracking plan MCP server.
 *
 * Spawns the server over stdio exactly the way Claude Code does and exercises all
 * three tools, including three payloads that must FAIL. Run it to verify the server
 * works without registering it first. Plain Node 18+, no flags:
 *
 *   node mcp/tracking-plan-server/smoke-test.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["mcp/tracking-plan-server/index.mjs"],
});

const client = new Client({ name: "tracking-plan-smoke-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS EXPOSED:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  return result.content[0].text;
}

function section(title, note) {
  console.log(`\n========== ${title} ==========`);
  if (note) console.log(`${note}\n`);
}

section("list_events (no filter)");
console.log(await call("list_events", {}));

section("list_events (emitted_from: server)");
console.log(await call("list_events", { emitted_from: "server" }));

section("get_event_schema('trade_closed')");
console.log(await call("get_event_schema", { event_name: "trade_closed" }));

section(
  "validate_event_payload — MUST FAIL",
  "Case 1: trade_closed with pnl_r omitted entirely.",
);
console.log(
  await call("validate_event_payload", {
    event_name: "trade_closed",
    emitted_from: "client",
    properties: {
      direction: "long",
      outcome: "win",
      hold_candles: 12,
      trade_number: 1,
    },
  }),
);

section(
  "validate_event_payload — MUST FAIL",
  "Case 2: account_created is server-only, attempted from the client.",
);
console.log(
  await call("validate_event_payload", {
    event_name: "account_created",
    emitted_from: "client",
    properties: {
      user_id: "3f1a0c52-9b1e-4c2a-9f0d-6c1b2e7a4d55",
      entry_point: "post_trade",
      trades_before_signup: 3,
      time_to_signup_ms: 42000,
    },
  }),
);

section(
  "validate_event_payload — MUST FAIL",
  "Case 3: outcome misspelled, hold_candles = 0 where a positive integer is required,\nand an undeclared property added.",
);
console.log(
  await call("validate_event_payload", {
    event_name: "trade_closed",
    emitted_from: "client",
    properties: {
      direction: "long",
      outcome: "winner",
      pnl_r: 1.4,
      hold_candles: 0,
      trade_number: 1,
      note: "undeclared",
    },
  }),
);

section("validate_event_payload — MUST PASS");
console.log(
  await call("validate_event_payload", {
    event_name: "trade_closed",
    emitted_from: "client",
    properties: {
      direction: "long",
      outcome: "win",
      pnl_r: 1.4,
      hold_candles: 12,
      trade_number: 1,
    },
  }),
);

section(
  "get_event_schema — unknown name",
  "Must return the valid names and an instruction to stop, never a nearest match.",
);
console.log(await call("get_event_schema", { event_name: "trade_completed" }));

await client.close();
