# The AI-native layer

Configuration in this repository is product, not documentation. The files under
`.claude/` and `mcp/` are meant to be run.

The problem they exist to solve is narrow: **an agent asked to instrument a behaviour
will invent an event name.** It is the most natural failure in the world — the contract
lives in a file it has not read, the name it coins is plausible, the code compiles, and
the data is quietly wrong from that point on. Event-name drift is the largest single
source of dirty analytics data, and review does not catch it reliably because the mistake
looks exactly like the correct answer.

## Project instructions

`CLAUDE.md` is loaded into every session. It carries the product thesis, an explicit
out-of-scope list, six invariants, and stop conditions — the cases where the correct
action is to stop and ask rather than improvise.

The invariants are the load-bearing part, because they are the rules that make the system
trustworthy rather than merely working: events are never invented, conversion events are
server-emitted, validation comes from one shared schema, business rules live in typed
modules rather than prompts, no secrets reach client code, and accessibility is not a
later pass.

`DECISIONS.md` is the counterpart — a dated log of every point where AI output was
corrected, rejected or overridden, and every non-obvious trade-off. It is a deliverable,
not a scratchpad, and most of the specifics in the human-judgment section below come from
it.

## The two-layer MCP architecture

Two servers close the instrumentation loop from opposite ends.

### Layer 1 — the tracking plan server (built here)

`mcp/tracking-plan-server/` · stdio · Node 18+, no experimental flags · three tools

| Tool | Purpose |
|---|---|
| `list_events` | Every declared event with description, trigger and `emittedFrom`, filterable by side |
| `get_event_schema` | One event's required properties with types and **enum members**, plus shared context |
| `validate_event_payload` | Runs the application's own `validateEvent` against a candidate payload |

Agents query the contract **before** instrumenting. `get_event_schema` returns enum
members explicitly, because those are precisely the values an agent would otherwise
guess. An unknown event name returns the list of valid names and an instruction to stop —
never a nearest match.

It imports a **compiled** copy of `tracking-plan.ts`, emitted by `npm run build:mcp` and
never hand-edited. That choice is defended below. `validate_event_payload` runs the real
validator, so a payload that passes here passes at runtime.

### Layer 2 — the PostHog MCP (third party, connected not built)

**We did not build this.** It is PostHog's official MCP server, connected to the project
like any other dependency.

Agents verify **after** instrumenting: that the event arrived, that it carried the right
properties, and that it shares a `distinct_id` with the rest of the journey. It also
manages the feature flag that runs the experiment.

### Why both — the argument from evidence

Layer 1 alone tells you the code is correct. Layer 2 alone tells you the data is wrong
but not why.

```
read the contract  →  implement against it  →  confirm arrival at the destination
    (layer 1)             (agent + skill)            (layer 2)
```

The gap between those ends is where this build's worst defect lived. **Layer 1 validated
the instrumentation as correct — and it was correct — while zero client-side events
reached PostHog for the entire development period.** An ad blocker suppressed all of
them. Every local check passed: types, lint, build, schema validation. Nothing in the
application failed. Only asking the destination what it had actually received revealed
it.

That experience is also why the analytics client now warns in development when no round
trip to PostHog completes. The loop needs a third property beyond read and verify:
failure between them has to be **loud**.

## Subagents

`.claude/agents/` — three, each with one responsibility and explicit limits. No agent
that helps with everything, because an agent with a vague remit confidently does the
wrong job.

| Agent | Responsibility | Hard limit |
|---|---|---|
| `analytics-instrumentor` | Places capture calls | Must call `get_event_schema` first. Must not invent names, add undeclared properties, or edit the tracking plan |
| `accessibility-auditor` | Audits against a fixed eight-point checklist | Reports measured values, never impressions. Does not fix silently |
| `contract-reviewer` | Reviews a diff against the `CLAUDE.md` invariants | Reports with file and line. Does not edit |

**The limits matter more than the capabilities.** `analytics-instrumentor` is explicitly
forbidden from editing `tracking-plan.ts`, because the obvious way to make a failing call
site pass is to widen the contract — which inverts the entire point of having one.
`accessibility-auditor` is required to compute contrast ratios with a script rather than
judge them, because a dark panel makes a failing pairing look completely fine.

## Skill

`.claude/skills/add-tracked-event/` — the complete path for introducing a new event:
check it does not already exist, declare it with description, trigger and `emittedFrom`,
define a strict property schema, place the call site on the correct side, and state what
to verify in PostHog afterwards.

It exists because that sequence is easy to half-do, and **a half-declared event is worse
than none** — it looks instrumented, passes review, and produces nothing.

---

# Where AI improved execution, and where its output was wrong

The specifics below are the ones worth probing. Each names how the defect was found,
because the detection method is the transferable part.

## Defects in AI-written code, and what caught each

**`.strict()` was doing nothing on `POST /api/users`.** The handler validated
`createUserSchema.safeParse({ email: body.email, name: body.name })` — hand-picking two
fields before validating them. Because unknown keys never reached the schema, `.strict()`
had nothing to reject, and `{"name":"Cy Reed","email":"cy@example.com","isAdmin":true}`
returned **201** with the extra key silently discarded.

*Caught by its own test.* I had read that code several times and seen a strict schema.
Exercising the endpoint with curl produced the 201 and made the gap obvious. The lesson
generalises: a schema is only strict at the boundary you actually hand it, and picking
fields out of a payload moves that boundary without looking like it does.

**`--fx-market-down` at 3.99:1 failed WCAG AA.** The red used for the Sell control and
every negative P&L measured 3.99:1 against `surface-raised` — under the 4.5:1 floor for
body text. Lightened 11% toward white to `#db595f`, giving 4.65:1 there and 5.51:1 on
canvas.

*Caught by computing contrast rather than eyeballing it,* before writing the markup. On
a dark panel the original looked perfectly fine. Every pairing on the page is calculated;
the table is in [PERFORMANCE.md](PERFORMANCE.md).

**`variant: "control"` meant two different things.** It meant either a real control
assignment or a feature flag that never resolved — because the code initialises to
`control` and falls back to it after a 2000ms timeout. Every blocked or slow flag request
silently inflated the control arm and biased the experiment toward no effect.

*Caught by reading the source.* No test covered it and none would have: both paths
produce a valid, well-formed event. Fixed by adding a required `flag_resolved` boolean.
It later caught a real instance in production — a treatment visitor recorded against
control.

**`replay_started` was dropped on every first page load.** React runs child effects
before parent effects. `AnalyticsProvider` wraps the tree, so `ReplayPanel` mounted first
and called `track('replay_started')` from its own effect *before* `initAnalytics()` had
run. `track()` had no initialised guard, so it called `posthog.capture()` on an
uninitialised client and the event vanished. Step 2 of the funnel was near-zero for every
autoplay visitor.

*Caught by noticing an event missing from a list* — not by an error, a test, or a type.
Nothing failed. The production event list simply did not contain something that should
have been there, and the giveaway was that the same event appeared normally on a
client-side navigation, where the module was already initialised.

**`time_to_signup_ms` measured tab age.** A real conversion carried 10,898,590ms — just
over three hours — for a journey that took about two minutes. `sessionStorage` lives as
long as the tab, so a stamp written once measured how long the tab had been open.

*Caught by reading the event properties* and noticing a number that could not be true.

## Suggestions I rejected

**The JSON snapshot for the MCP server.** When the server needed to stop requiring Node
22.6, a JSON snapshot of the tracking plan was one of the options on the table and the
simplest-looking one.

I rejected it. **A JSON snapshot can carry the property schemas but not a function**, and
`validate_event_payload` is required to run the application's *own* `validateEvent`.
Reimplementing validation in the server would have created a second definition of what a
valid event is — the exact failure the tracking plan exists to prevent. It would have
fixed the Node version and broken the more important property, quietly.

Compiling the TypeScript ahead of time keeps the real function, costs no new dependency
(`typescript` was already present), and runs on plain Node 18. The drift a build step
introduces is closed by a startup check: if the source is newer than the compiled copy,
the server says so on stderr rather than answering from stale data.

**Silent guards as a fix for dropped events.** When `replay_started` was being lost, the
obvious repair was `if (!initialized) return;` — matching the guards already on
`identifyUser` and `getDistinctId`. That is not a fix. Losing a funnel step quietly is
the defect; a guard that drops the event is the same defect with a cleaner conscience.
Events are now queued and replayed in order once init completes, with a capacity bound of
25 and a 10-second lifetime.

## What was delegated, what was done by hand

**Delegated:** component scaffolding, the canvas drawing routine, the seeded generator's
structure, route handler boilerplate, and the bulk of the prose in these documents.

**Done by hand, or by explicit instruction:** every invariant in `CLAUDE.md`. The
tracking plan's contents — which events exist, what each means, which side emits it. The
decision that the conversion event is server-only. The experiment design and its decision
criteria. The choice to make the in-memory adapter the default. The rejection of the JSON
snapshot. The scope cuts.

The division is not "AI writes code, human writes docs". It is that **AI was good at
producing a plausible implementation of a decision, and consistently bad at noticing when
a decision had a hole in it.** Four of the five defects above were in AI-written code that
compiled, passed lint, and looked right.

## How AI output was validated

Not by reading it. Reading is what missed the `.strict()` bypass through several passes.

- **Executed against the real thing.** The API was exercised with curl against both
  adapters — every status code, both duplicate defences. That is what produced the 201
  that exposed the strictness bug.
- **Computed rather than judged.** Every contrast pairing calculated from token values
  before markup was written. That is what caught 3.99:1.
- **Verified in the destination.** Every analytics claim checked against what PostHog
  actually received, not against what the code appeared to send. That is what revealed
  both the ad blocker and the missing `replay_started`.
- **Checked in the built output.** Secrets verified absent from `.next/static` rather
  than assumed absent from source.
- **Probed rather than assumed.** Before writing markup, a throwaway file established
  which Tailwind utilities actually exist — `text-primary` does not; the real name is
  `text-text-primary`, and the short spelling would have emitted no CSS while looking
  correct.

The pattern across all five: **the failures were silent, and every one was caught by
observing behaviour rather than by inspecting intent.**
