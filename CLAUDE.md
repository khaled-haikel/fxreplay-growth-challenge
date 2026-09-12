# CLAUDE.md

Project-level instructions for Claude Code. Read this before proposing or writing anything.

## What this is

A marketing landing experience for **FX Replay**, a browser-based market replay and
backtesting tool for manual traders. Built as a technical challenge for a Growth
Engineer role.

**Business objective:** increase the conversion rate from marketing traffic to account
creation.

**Product thesis:** the biggest friction in this funnel is that a visitor cannot tell
what the tool feels like before creating an account. Traders compare everything to
TradingView, where the chart is visible without signing up. So the landing page gives
away a piece of the product: an interactive mini replay in the hero. Play, the price
advances candle by candle, the visitor takes a position, closes it, sees the result.
The moment the trade closes is the signup trigger.

That interaction is not decoration. It is the activation step in the funnel and the
basis of the proposed experiment.

## Scope discipline

The work is time-boxed to roughly six hours. Scope is deliberately small and the
evaluators explicitly value thoughtful trade-offs over feature completeness.

**Out of scope. Do not build these, do not suggest them:**

- Real authentication, sessions, JWT, password hashing, OAuth
- Multiple symbols, multiple timeframes, or a symbol picker in the replay
- Technical indicators, drawing tools, or chart settings
- An admin UI for listing users (the API endpoint plus a test is sufficient)
- Light/dark theme toggle (the brand is dark-first; assume dark)
- Internationalization
- Broad test coverage (test the contracts, not the framework)
- Scroll-triggered animation on sections
- n8n, queues, background workers, or any external orchestration

If a task seems to require one of these, **stop and ask** instead of building it.

## Stack, already decided

Do not propose alternatives to these. They were chosen deliberately and the rationale
is documented in `ARCHITECTURE.md`.

- **Next.js (App Router)** with TypeScript. Server Components by default; client
  components only for the replay and the signup form.
- **Tailwind CSS**, with FX Replay brand tokens mapped into the theme.
- **Route Handlers** for the Users API.
- **Supabase Postgres** in production, behind a repository interface, with an
  in-memory adapter as the default so the project runs with zero configuration.
- **PostHog** for product analytics, feature flags, and the experiment.
- **Vercel** for deployment.

## Invariants

These are the rules that make the system trustworthy. Breaking one is a defect even if
the code compiles and the tests pass.

**1. Event names are never invented.**
Every analytics event must exist in `src/lib/analytics/tracking-plan.ts`. Do not add a
`posthog.capture()` call with a string literal. Do not rename an event to make a call
site read better. If you need an event that does not exist, stop and ask.

**2. Conversion events are emitted from the server.**
`account_created` fires from the Route Handler after the user row is committed, never
from a form handler in the browser. The browser closes tabs, loses connectivity, and
runs ad blockers. The event that defines success must not depend on it.

**3. Validation happens at the edge, from a shared schema.**
The client validates for fast feedback. The server validates because the client is
hostile. Both read the same Zod schema. There must never be two definitions of what a
valid user is.

**4. Business rules live in code, not in prompts or in component bodies.**
Validation rules, funnel definitions, and event contracts belong in typed modules with
tests.

**5. No secrets in client code.**
The Supabase service key is server-only. The only PostHog value that reaches the
browser is the public project key.

**6. Accessibility is not a later pass.**
Every interactive element is reachable and operable by keyboard with a visible focus
state. The replay must honor `prefers-reduced-motion`: with that preference active it
does not autoplay, and the visitor advances the chart manually. Trade results are
announced through an `aria-live` region.

## Stop conditions

Stop and tell me. Do not improvise a way around any of these.

- A file, table, environment variable, or dependency you expected does not exist.
- A change would require editing `tracking-plan.ts` to make unrelated code work.
- A task needs a new third-party dependency. Name it, say what it costs, and wait.
- The replay implementation is trending past sixty minutes of work.
- A migration would drop, rename, or rewrite an existing column.
- Something in this file contradicts what I asked for in the prompt. Flag the conflict;
  do not silently pick one.

## How we work

**Plan before code.** For anything beyond a single-file edit, produce the plan first:
what changes, in what order, what could break. Wait for approval.

**One task per session.** Finish it, verify it, commit it, then move on. Do not bundle
unrelated changes into one diff.

**Verify before declaring done.** "It compiles" is not verification. State what you
actually checked and what you did not.

**Say what you did not do.** If you skipped something, cut a corner, or made an
assumption, say so in the summary. An unflagged shortcut is worse than a flagged gap.

## Conventions

- Event names: `snake_case`, past tense verb (`trade_closed`, not `closeTrade`).
- Files: `kebab-case`. React components: `PascalCase`.
- No hard-coded hex colors. Use the semantic tokens from the Tailwind theme. The brand
  kit README is explicit about this and it is an evaluated criterion.
- Numeric values in the UI (price, P&L, R multiple) use the mono font with tabular
  figures, so digits do not shift horizontally as values update.
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).

## Decision log

`DECISIONS.md` records every point where I corrected, rejected, or overrode
AI-generated output, and every non-obvious trade-off. When you propose something and I
change it, remind me to log it. This file is a deliverable, not a scratchpad.
