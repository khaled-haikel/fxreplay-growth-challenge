# The AI-native layer

Configuration in this repository is product, not documentation. The files under
`.claude/` and `mcp/` are meant to be run, not just read.

The problem they exist to solve is narrow and specific: **an agent asked to instrument
a behaviour will invent an event name.** It is the most natural thing in the world —
the contract lives in a file it has not read, the name it coins is plausible, the code
compiles, and the data is quietly wrong from that moment on. Event-name drift is the
largest single source of dirty analytics data, and no amount of review catches it
reliably, because the mistake looks exactly like the correct answer.

## The two-layer MCP architecture

Two servers close the instrumentation loop from opposite ends.

### Layer 1 — the tracking plan server (we built this)

`mcp/tracking-plan-server/` · stdio · three tools

Agents query the contract **before** instrumenting. `get_event_schema` returns the
required properties with their enum members, so the values an agent would otherwise
guess are handed to it instead. `validate_event_payload` runs the application's own
`validateEvent` against a candidate payload, so a pass is a pass at runtime rather
than an opinion.

It imports `src/lib/analytics/tracking-plan.ts` directly. No copy, no snapshot, no
generated summary — the app, the runtime validator and the agent tools read the same
module and therefore cannot disagree.

This prevents invented event names **at the source**, which is the only place the
problem is cheap to fix.

### Layer 2 — the PostHog MCP (third party, we connected it)

**We did not build this.** It is PostHog's official MCP server, connected to this
project like any other dependency.

Agents verify **after** instrumenting: that the event actually arrived, that it carried
the right properties, and that it shares a `distinct_id` with the rest of the visitor's
journey. It also manages the feature flag that runs the experiment.

### Why both

Layer 1 alone tells you the code is correct. Layer 2 alone tells you the data is wrong
but not why. Together:

```
read the contract  →  implement against it  →  confirm arrival at the destination
    (layer 1)             (agent + skill)            (layer 2)
```

The gap between those ends is where this project's worst bug lived. Instrumentation was
correct by every check layer 1 can perform, and **zero** client events reached PostHog
for the entire build — an ad blocker suppressed all of them, silently. Layer 1 could
never have caught it. Only asking the destination what it actually received did.

That experience is also why the analytics client now warns in development when no round
trip to PostHog completes: the loop needs a third property beyond read and verify, which
is that failure between them has to be **loud**.

## Subagents

`.claude/agents/` — three, each with one responsibility and explicit limits. No agent
that "helps with everything", because an agent with a vague remit is one that
confidently does the wrong job.

| Agent | Responsibility | Hard limit |
|---|---|---|
| `analytics-instrumentor` | Places capture calls | Must call `get_event_schema` first. Must not invent names, add undeclared properties, or edit the tracking plan |
| `accessibility-auditor` | Audits against a fixed eight-point checklist | Reports measured values, never impressions. Does not fix silently |
| `contract-reviewer` | Reviews a diff against `CLAUDE.md` invariants | Reports with file and line. Does not edit |

The limits matter more than the capabilities. `analytics-instrumentor` is explicitly
forbidden from editing `tracking-plan.ts`, because the obvious way to make a failing
call site pass is to widen the contract — which inverts the entire point of having one.

## Skill

`.claude/skills/add-tracked-event/` — the complete path for introducing a new event:
declare it with description, trigger and `emittedFrom`; define a strict property
schema; place the call site on the correct side; and state what to verify in PostHog
afterwards.

It exists because that sequence is easy to half-do, and a half-declared event is worse
than none — it looks instrumented and produces nothing.

## Running it

`.mcp.json` is committed, so opening this project in Claude Code offers the server
directly. To verify it without registering anything:

```bash
node --experimental-transform-types mcp/tracking-plan-server/smoke-test.mjs
```

That spawns the server over stdio exactly as Claude Code does and exercises all three
tools, including two payloads that must fail.
