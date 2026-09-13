# FX Replay: growth engineering challenge

A marketing landing page whose hero is a working piece of the product.

**The thesis.** The biggest friction between marketing traffic and account creation is
that a visitor cannot tell what the tool feels like before signing up. Traders compare
everything to TradingView, where the chart is visible without an account. So the hero
gives away a piece of the product: an interactive replay where price advances candle by
candle, you take a position, close it, and see the result. The moment a trade closes is
the signup trigger, and that interaction is the activation step of the funnel rather
than decoration.

**Live:** https://fxreplay-growth-challenge.vercel.app

**Time spent:** roughly six hours across two sessions.

**Both experiment arms are built and verified in production.** The hero is behind the
`hero-interactive-replay` flag. Control renders the same 120 candles through the same
renderer (`src/lib/replay/draw-chart.ts`) in their final state; treatment plays them and
lets you trade. Holding the content constant is deliberate: the first control was an
empty skeleton, which varied both whether the visitor saw market data and whether they
could act on it, so a win could not have been attributed to either.
See [EXPERIMENT.md](EXPERIMENT.md).

---

## Run it locally

Zero configuration. No account, no keys, no database.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The replay runs, signup works end to end, and a user row is
created, because **the in-memory adapter is the default, not a fallback**. Requiring a
Postgres instance to look at a landing page is a tax on exactly the person whose time
matters most here.

The in-memory store lives for the life of the server process. Restarting `npm run dev`
clears it.

### Optionally: use Supabase instead

Add both variables to `.env.local` and restart. The adapter is selected once at module
load and logs which one is active in development.

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Then apply `supabase/migrations/0001_create_users.sql`. With neither variable set, the
app never touches Postgres.

### Analytics (optional)

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Without these the app runs normally and warns once in development that events will not
be sent.

### Other commands

```bash
npm run verify      # preflight: env vars, analytics module layout, host reachability
npm run build       # compiles the MCP tracking plan, then builds Next
npm run lint
npx tsc --noEmit
node mcp/tracking-plan-server/smoke-test.mjs   # exercises the MCP server's three tools
```

---

## Documents

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, the technical decisions and what each one gave up, API design, deployment, and what would change at real scale |
| [ANALYTICS.md](ANALYTICS.md) | Events, properties, the funnel, the primary metric, and the data-quality guarantees, with tables generated from the tracking plan |
| [EXPERIMENT.md](EXPERIMENT.md) | Hypothesis, arms, sizing arithmetic with assumptions stated, and decision criteria for all three outcomes |
| [AI-NATIVE.md](AI-NATIVE.md) | The two-layer MCP architecture, subagents, the skill, and the specific places AI output was wrong and how it was caught |
| [PERFORMANCE.md](PERFORMANCE.md) | Measured Lighthouse results against production, accessibility with computed contrast, and production risks |

---

## What I did not build, and why

Each of these was a deliberate cut against a six-hour budget, not an oversight. The
approach is documented in the linked section so the decision can be argued with.

**A reverse proxy for PostHog.** The single highest-value remaining change. Ad blockers
suppressed **100% of client-side telemetry** during this build, every browser event
including PostHog's own, while server-emitted events arrived untouched. Routing
ingestion through a first-party path is the only mitigation that recovers the blocked
population rather than measuring the loss. It needs the deployed domain and belongs in
platform configuration, so it was documented rather than rushed.
→ [ANALYTICS.md, Data quality](ANALYTICS.md#ad-blockers-suppressed-100-of-client-telemetry)

**Tests.** None exist. The two contracts worth covering first are the two that actually
broke: `contextSchema` rejecting a payload missing `flag_resolved`, and `POST /api/users`
returning 409 rather than writing a duplicate row. Both are pure functions over typed
input and need no browser.
→ [ARCHITECTURE.md, No tests](ARCHITECTURE.md#no-tests)

**Real authentication.** Out of scope by the brief. The users table has no credentials
column, and authorisation currently lives in the server rather than the database.
→ [ARCHITECTURE.md, RLS with no policy](ARCHITECTURE.md#rls-enabled-with-no-policy)

**A real market data feed.** The replay runs 120 deterministic seeded candles. The array
is shaped like the response the market data endpoint would return, so swapping the
source is a change of import.
→ [ARCHITECTURE.md, Deterministic seeded data](ARCHITECTURE.md#deterministic-seeded-candle-data)

**Rate limiting on user creation.** `POST /api/users` is unauthenticated and unthrottled.
→ [PERFORMANCE.md, Production risks](PERFORMANCE.md#production-risks)

**Deeper performance work on the replay.** Two fixes were made and production now
scores **87** on desktop with the treatment arm forced. What was *not* done is the rest
of the insights list: render-blocking requests and cache lifetimes were both left, and
the largest remaining cost is React hydration rather than the canvas, which is the part
that would need real work. The honest caveat is that only the `fetchpriority` fix can be
attributed. The rest of the 76 to 87 movement is run-to-run variance on a shared host,
and PERFORMANCE.md says so rather than claiming the win.
→ [PERFORMANCE.md](PERFORMANCE.md)
