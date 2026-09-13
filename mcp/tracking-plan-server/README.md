# Tracking plan MCP server

A stdio MCP server that makes the analytics contract **queryable**, so an agent about
to instrument something can ask what an event requires instead of inventing one.

Event-name drift is the largest single source of dirty analytics data. It happens
because the contract lives in a file nobody reads at the moment they need it. This
turns it into a question an agent can ask.

## Source of truth

The server imports `src/lib/analytics/tracking-plan.ts` directly. It holds no copy, no
summary and no generated snapshot. `validate_event_payload` runs the application's own
`validateEvent`, so a payload that passes here passes at runtime — the tool and the app
cannot drift apart, because they are the same function.

## Tools

| Tool | Purpose |
|---|---|
| `list_events` | Every declared event with description, trigger and `emittedFrom`. Optional filter by side. |
| `get_event_schema(event_name)` | Required properties with types and enum members, plus the shared context. An unknown name returns the valid names, never a guess. |
| `validate_event_payload(event_name, properties, emitted_from)` | Runs the real `validateEvent`. Returns pass/fail with the specific violation. |

## Register it with Claude Code

The repository ships `.mcp.json`, so **no command is needed** — open the project in
Claude Code and approve the server when prompted.

To register it explicitly instead, from the project root:

```bash
claude mcp add tracking-plan -- node --experimental-transform-types mcp/tracking-plan-server/index.mjs
```

To register it for every project on your machine, using an absolute path:

```bash
claude mcp add --scope user tracking-plan -- node --experimental-transform-types /absolute/path/to/mcp/tracking-plan-server/index.mjs
```

## Verify without registering

```bash
node --experimental-transform-types mcp/tracking-plan-server/smoke-test.mjs
```

Spawns the server over stdio exactly as Claude Code does and exercises all three
tools, including two payloads that must fail and one that must pass.

## Why `--experimental-transform-types`

The server imports TypeScript directly. Node's plain type *stripping* is not enough:
`TrackingPlanViolation` uses constructor parameter properties, which have to be
transformed rather than erased. Requires Node 22.6+; developed on Node 24.
