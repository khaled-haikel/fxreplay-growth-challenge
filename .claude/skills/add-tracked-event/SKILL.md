---
name: add-tracked-event
description: The complete path for introducing a new analytics event — declare it in the tracking plan, define its property schema, place the call site, and verify arrival in PostHog. Use whenever a behaviour needs measuring and no declared event covers it.
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Adding a tracked event

This exists because the sequence is easy to half-do, and a **half-declared event is
worse than none**: it looks instrumented, it passes review, and it produces nothing.
The failure is silent at every step.

Do all five. In this order.

## 0. Check it does not already exist

Call `list_events` on the tracking-plan MCP server, or read
`src/lib/analytics/tracking-plan.ts`.

Reusing a declared event is almost always right. A second event describing the same
behaviour splits the funnel between two names, and nothing downstream reveals it — the
numbers simply come out lower than reality and stay that way.

If an event exists, stop here and use it. **Do not proceed to step 1.**

## 1. Declare the event

In `src/lib/analytics/tracking-plan.ts`, add a `defineEvent` entry. Every field earns
its place:

- **`description`** — why this event exists, not what it is called. This is what a
  future reader uses to decide whether to reuse it.
- **`trigger`** — the exact user or system action that fires it. "Close control
  activated, or the replay reaches the end of data with an open position" is a trigger.
  "When a trade closes" is not: it does not tell an implementer where the call goes.
- **`emittedFrom`** — `client` or `server`. Conversion events are server-only per
  invariant 2 in `CLAUDE.md`: the browser closes tabs, loses connectivity, and runs ad
  blockers, and the event that defines success must not depend on it.

Naming: `snake_case`, past-tense verb. The event describes something that happened
(`trade_closed`), not something the code is about to do (`closeTrade`).

## 2. Define the property schema

A `z.object({...}).strict()` on the same entry.

`.strict()` is not optional. It is what makes an undeclared property a loud error
rather than a field that quietly lands in the warehouse and is discovered a quarter
later by someone building a dashboard.

Guidance that has already cost this project real bugs:

- Use `z.enum` for any closed set. Enums are the values an implementer would otherwise
  guess, and a guess produces a payload the validator rejects at runtime.
- Constrain numbers honestly. `hold_candles` is `.int().positive()` because zero is
  impossible — and that constraint caught a real defect where opening and closing on
  the same candle emitted `0` and threw in development.
- Use `.nullable()` where "unknown" is a legitimate answer. It is far better to send
  null than a confident wrong number. `time_to_signup_ms` is nullable for exactly this
  reason, after a real conversion shipped carrying three hours for a two-minute journey.
- Do not add the shared context fields. `buildContext()` attaches `variant`,
  `flag_resolved`, `event_id`, `session_id` and `device_type` to every event already.

## 3. Place the call site

**Client events:** `track('event_name', { ... })` from `@/lib/analytics/client`. The
event name is constrained by the type system and the properties are validated at
runtime, so a typo fails to compile and a bad payload fails before it leaves the
browser.

**Server events:** `trackServer({ event, properties, context, distinctId })` from
`@/lib/analytics/server`, **after** the write commits — never before, and never
optimistically. The server has no cookie, so `distinctId` must travel with the request
or the event lands against a stranger and the funnel never closes.

Validate the payload with `validate_event_payload` on the MCP server before you
consider the call site finished. It runs the same `validateEvent` the app runs.

## 4. Say what to verify in PostHog

The work is not done when the code compiles. Write down, for whoever checks:

- The event name to look for, and the `distinct_id` it should share with the rest of
  that visitor's journey.
- Each property and the value it should carry for a known test journey.
- That no *other* event appeared alongside it — a duplicate usually means an effect
  fired twice.

Then confirm it. **Do not send a synthetic event to test this.** Every event must exist
in the tracking plan (invariant 1), and a fabricated payload pollutes the same metric
you are trying to measure. Drive the real path in a browser instead.

One warning from experience: client-side events can be blocked entirely by an ad
blocker while the application shows no sign of it. If nothing arrives, check the
console for the transport warning and DevTools → Network filtered on `posthog` before
concluding the instrumentation is wrong.

## Stop conditions

Stop and ask a human if:

- Making the call site work would require **changing an existing event's** schema.
  That breaks every historical row already recorded under it.
- You cannot tell whether the event belongs on the client or the server. That is a
  measurement design decision, not an implementation detail.
