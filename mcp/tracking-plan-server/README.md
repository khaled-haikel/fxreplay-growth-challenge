# Tracking plan MCP server

A stdio MCP server that makes the analytics contract **queryable**, so an agent about
to instrument something can ask what an event requires instead of inventing one.

Event-name drift is the largest single source of dirty analytics data. It happens
because the contract lives in a file nobody reads at the moment they need it. This
turns it into a question an agent can ask.

## Source of truth

`src/lib/analytics/tracking-plan.ts`, and nothing else.

The server reads a **compiled** copy of that file in `generated/`, emitted by
`npm run build:mcp` and never edited by hand. Compilation is the only transformation:
the schemas are the same objects and `validate_event_payload` runs the application's
own `validateEvent`, so this server and the running app cannot give different answers.

If the source is ever newer than the compiled copy, the server says so on stderr at
startup rather than answering from stale data.

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
claude mcp add tracking-plan -- node mcp/tracking-plan-server/index.mjs
```

To register it for every project on your machine, using an absolute path:

```bash
claude mcp add --scope user tracking-plan -- node /absolute/path/to/mcp/tracking-plan-server/index.mjs
```

## Verify without registering

```bash
node mcp/tracking-plan-server/smoke-test.mjs
```

Spawns the server over stdio exactly as Claude Code does and exercises all three
tools, including two payloads that must fail and one that must pass.

## Requirements

**Node 18+. No experimental flags.**

The compiled plan is committed, so the server runs immediately after `npm install`
with no build step required of a reviewer.

### Why compilation rather than a JSON snapshot

A JSON snapshot can carry the property schemas, but it cannot carry a function — and
`validate_event_payload` is required to run the application's *own* `validateEvent`
rather than a reimplementation. Reimplementing it would create a second definition of
what a valid event is, which is the exact failure the tracking plan exists to prevent.

Compiling keeps the real function. It also costs no new dependency: `typescript` is
already a devDependency, so `build:mcp` is a `tsc` invocation and nothing more. It runs
as part of `npm run build`.

An earlier version imported the `.ts` directly under `--experimental-transform-types`,
which required Node 22.6+. An MCP server that will not launch on the evaluator's
machine is worth nothing regardless of how it is designed.
