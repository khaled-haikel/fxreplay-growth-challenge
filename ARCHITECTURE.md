# Architecture

Every decision below names what it gave up. A trade-off with no cost listed is usually
a preference wearing a justification.

## Structure

```
src/
  app/
    page.tsx                  landing page — Server Component
    layout.tsx                fonts, metadata, AnalyticsProvider
    providers.tsx             analytics boot + page_viewed          (client)
    signup/page.tsx           signup shell — Server Component
    api/users/route.ts        POST create, GET list
    api/users/[id]/route.ts   PATCH update
  components/
    landing/                  9 section and chrome components       (server)
    replay/replay-panel.tsx   the interactive replay                (client)
    signup/signup-form.tsx    the signup form                       (client)
  lib/
    analytics/                tracking plan, client, server, context
    replay/                   seeded candle generator, session state
    users/                    schema, repository port + 2 adapters, API contract
mcp/tracking-plan-server/     MCP server exposing the tracking plan
supabase/migrations/          versioned SQL
.claude/                      agents and skill
```

27 TypeScript source files. Server Components by default; exactly three client
components — the replay, the signup form, and the analytics provider. Everything else
renders on the server.

Dependencies: `next`, `react`, `react-dom`, `zod`, `posthog-js`, `posthog-node`,
`@supabase/supabase-js`, `@modelcontextprotocol/sdk`. No UI library, no chart library,
no state manager, no test runner.

---

## Next.js over Astro — and Astro is the right answer on the team

**Astro is FX Replay's marketing stack, and for this page it would be the better
choice.** A landing page that is 90% static content with two interactive islands is
precisely what Astro's islands architecture exists for. It would ship less JavaScript by
default, and the performance number in [PERFORMANCE.md](PERFORMANCE.md) would likely be
better for it.

I chose Next.js anyway, for reasons that are about this artefact rather than about the
general case:

- The challenge requires a **Users API with three endpoints**. Next Route Handlers put
  the API and the page in one deployable with one type system. In Astro this is either
  a separate service or Astro's own endpoints, and either way the shared Zod schema
  crossing the client/server boundary gets more awkward.
- The **server-emitted conversion event** needs a server runtime adjacent to the write.
  Co-locating them is what makes the 81ms measurement below possible to reason about.
- Six hours. Depth in one framework beat breadth across two.

**What porting would involve.** The four section components are near-pure presentation
and would move to `.astro` almost verbatim — they have no client state. The replay panel
and the signup form become `client:load` islands, unchanged, because both are already
self-contained client components with explicit props. The Route Handlers become Astro
endpoints or a separate service; the Zod schemas and the tracking plan move unchanged,
since neither imports anything framework-specific. The real work is the analytics
provider: it currently relies on React effect ordering, which is exactly the thing that
broke once already (see `replay_started` below), and an island model would need that
boot sequence rethought rather than translated.

**Given up:** less JavaScript on the wire, and alignment with the team's existing stack —
which in a real engagement would outweigh everything above.

---

## Repository port with two adapters, in-memory as default

`src/lib/users/repository.ts` defines a `UserRepository` interface — `create`, `update`,
`findByEmail`, `list` — with two implementations selected once at module load:

```
SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY present  ->  Supabase Postgres
otherwise                                          ->  in-memory Map
```

The in-memory adapter is the **default**, not a fallback. This is the decision that most
directly serves "straightforward for another engineer to run": clone, `npm install`,
`npm run dev`, and the signup flow works end to end with no account, no keys and no
migration. A reviewer who has fifteen minutes spends them reading the code rather than
provisioning a database.

The port also keeps the route handlers honest. They talk to an interface and never to
Postgres, so the API was fully exercised — all status codes, both duplicate paths —
before Supabase existed.

The adapter is chosen at module load rather than per request, so a misconfiguration
surfaces at boot instead of at the first write.

**Given up:** the in-memory adapter is per-process, so it does not survive multiple
serverless instances or a cold start. In production that is fine because Supabase is
configured; in a demo deployment without credentials, two visitors can land on different
instances and see different data. Listed as a production risk.

---

## Conversion events are emitted from the server

`account_created` fires from the Route Handler after the row commits, never from the
browser. The browser closes tabs, loses connectivity, and runs ad blockers — and during
this build **ad blockers suppressed every single client-side event** while server-emitted
events arrived untouched. The event that defines success must not depend on the least
reliable participant.

Measured in production, in one journey:

| | |
|---|---|
| Supabase row committed | `2026-09-13T03:50:09.983914Z` |
| `account_created` timestamp | `2026-09-13T03:50:10.065Z` |
| Delta | **81ms** |

That is the invariant demonstrated rather than asserted: the event fired *after* the
write, not before, and it survived the serverless function being killed the instant it
returned its 201. Both halves of that matter — `posthog-node` batches by default and
flushes later, and "later" never arrives in a function that has already exited. The
client is configured `flushAt: 1` with an awaited `shutdown()`, and the 81ms is the proof
those two lines do something.

The browser still contributes what the server cannot derive: `distinct_id`, the
experiment variant, the device type. All of it travels in the request body. Verified in
the same journey — `page_viewed` and `account_created` share `distinct_id`
`01a098e2-…`, and `identify()` keyed the person on the Supabase `user.id`
`8a9db777-…`, confirmed by querying the row directly.

**Given up:** a malformed analytics payload must never cost a signup, so the payload is
parsed leniently and a failure is logged and dropped while the 201 still returns. That
means a conversion can exist in Postgres with no corresponding event. The alternative —
failing the signup to protect its measurement — is worse.

---

## One Zod schema, both sides of the wire

`src/lib/users/schema.ts` is imported by the signup form and by the Route Handler. The
client validates for fast feedback; the server validates because a public endpoint is
not a form and anyone can POST anything to it.

Normalisation lives **in the schema**, not at any call site: `emailSchema` trims and
lowercases as part of parsing. So `"  ANA@Example.COM  "` becomes `ana@example.com`
before it reaches the repository, the uniqueness check, or the browser's copy of the same
schema. Verified against Postgres: the row for a submission with surrounding whitespace
and mixed case stored clean.

A rule enforced at a boundary holds. A rule enforced by whichever call site remembers it
holds until the next call site.

**Given up:** a shared schema means client and server evolve together. They cannot be
versioned independently, which would matter if a third party consumed this API.

---

## Deterministic seeded candle data

`src/lib/replay/generate-candles.ts` produces 120 OHLC candles from a seeded mulberry32
PRNG. No `Math.random` anywhere, so every visitor, render and CI run sees the same
series — a hero that differed per load would make any bug report unreproducible.

The series is built in **regimes** rather than as an i.i.d. walk: each regime holds its
own drift and volatility for 8–26 candles, with weak mean reversion toward the base
price. A constant-volatility random walk reads as noise to anyone who looks at charts
professionally, and this audience does. Measured on the output: 20-candle efficiency
ratios of 0.13–0.42, which is where real intraday sits, with a 43-pip total range and a
6.6-pip median candle.

**In production this would come from the same market data API the application already
uses**, fetched server-side and cached at the edge. The exported shape — a flat array of
`{ time, open, high, low, close }` for one symbol and timeframe — is deliberately the
shape that endpoint returns, so swapping the source is a change of import.

**Given up:** the replay shows one symbol on one timeframe with no real prices. What it
buys is a landing page that runs with zero configuration, no API key in the browser, no
rate limit on marketing traffic, and no dependency on a third party being up for the hero
to work.

---

## API design

Three endpoints, one error shape.

| | | |
|---|---|---|
| `POST` | `/api/users` | 201 created · 400 validation · 409 duplicate · 500 |
| `PATCH` | `/api/users/[id]` | 200 · 400 · 404 unknown id · 409 duplicate · 500 |
| `GET` | `/api/users` | 200 with pagination · 400 bad params |

```json
{ "error": { "code": "duplicate_email", "message": "...", "fields": [{ "field": "email", "reason": "..." }] } }
```

The codes were chosen to map onto the `signup_failed` reason enum, so the form maps a
failure to an analytics reason without a second lookup table.

**Create is idempotent by email, and defended twice.** The handler reads before writing,
which produces the good error message; the unique index in the migration is the actual
guarantee, because two requests can interleave between that read and that write. Both
were verified independently against Postgres — the handler returns 409, and inserting the
same email twice straight through PostgREST returns `23505 duplicate key value violates
unique constraint "users_email_key"`.

**List paginates by default at three rows**, because that is the contract that survives
growth. Page size is capped at 100 rather than rejected: a caller asking for 10,000 gets
the maximum and the applied `limit` echoed back.

**The whole request body is validated, not a subset.** An earlier version picked `email`
and `name` out of the payload before parsing, which left `.strict()` with nothing to
reject — `{"isAdmin": true}` returned 201 with the field silently discarded. The body is
now parsed as a whole against a schema that extends the user schema with an optional
`analytics` key.

---

## Deployment and infrastructure

Vercel, `main` auto-deploying. Four environment variables: two `NEXT_PUBLIC_` PostHog
values that reach the browser, and two Supabase values that never do — verified by
grepping the built client bundles for `SUPABASE`, `service_role` and the key material,
all absent.

Rendering: `/` is prerendered static; `/signup` and the three API routes are
server-rendered on demand. The landing page ships as static HTML with two client islands
hydrating into it.

Supabase Postgres with the schema in `supabase/migrations/0001_create_users.sql` — uuid
primary key, unique index on email, a `created_at desc` index for the list endpoint, and
an `updated_at` trigger.

---

## RLS enabled with no policy

Row level security is on for `public.users` and **no policy is granted** to `anon` or
`authenticated`. Every access path goes through the server using the service role key,
which bypasses RLS. The table therefore has no client-reachable surface at all.

This is the correct posture *for this build*, where there is no authentication and the
server is the only actor. It is not the posture for a real system.

**With real auth, authorisation moves into the database.** Policies like "a user may read
and update only their own row" become RLS predicates on `auth.uid()`, the client talks to
Supabase directly with a user-scoped JWT, and the service role key stops being the
universal skeleton key. The advantage is that the rule is enforced by Postgres rather than
by every route handler remembering it — the same argument as putting email normalisation
in the schema, one layer down.

**Given up:** right now a bug in a route handler is the only thing between a request and
the whole table. The blast radius is bounded by there being exactly three handlers and no
authenticated client surface, but it is real.

---

## No tests

There is no test runner in this repository. That is a budget decision, and the honest
cost is that four of the defects listed in `DECISIONS.md` were found by inspecting
production data rather than by anything failing locally.

**The two contracts I would cover first**, chosen because they are the two that actually
broke:

1. **`contextSchema` rejects a payload missing `flag_resolved`.** The field was added
   precisely because `variant: "control"` meant two different things — a real assignment,
   or a flag that never resolved. A test that asserts the schema is strict about it is
   three lines and guards the field against being quietly made optional later.

2. **`POST /api/users` returns 409 rather than writing a duplicate row.** This is the
   endpoint's only interesting behaviour, it has two independent defences, and the
   `.strict()` bypass proves this class of bug is invisible to reading. Runs against the
   in-memory adapter with no database.

Both are pure functions over typed input. Neither needs a browser, a running server, or a
database. The reason to start there rather than with coverage is that these two encode
decisions someone could plausibly undo without realising what they were for.

---

## What would change at real scale

**Market data from the real feed**, cached at the edge, with the replay hydrating from a
server-rendered first frame instead of generating client-side.

**Authorisation in the database.** RLS policies keyed on the authenticated user, the
service role key confined to genuine admin paths.

**A rate limit on user creation.** `POST /api/users` is currently unauthenticated and
unthrottled — fine for a demo, not for a public endpoint.

**First-party analytics ingestion.** A rewrite from `/ingest/*` to PostHog, so client
events stop being blocked. This is the highest-value single change remaining and the
evidence for it is in [ANALYTICS.md](ANALYTICS.md).

**Observability beyond platform defaults.** Right now a failed `trackServer` call logs to
the Vercel function log and nothing aggregates it. The analytics layer already has the
harder half of this — a development-time detector that catches total telemetry loss — but
nothing equivalent runs in production.

**The replay's performance budget.** The chart holds the main thread for 2,860ms of
blocking time. At real traffic that is a conversion cost, and it is measurable.
