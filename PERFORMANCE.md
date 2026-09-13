# Performance, SEO and accessibility

## Lighthouse, measured against production

Run against `https://fxreplay-growth-challenge.vercel.app/` on 2026-09-13, headless
Chrome, Lighthouse 12, default mobile emulation and throttling.

| Category | Score |
|---|---|
| Performance | **53** |
| Accessibility | **100** |
| Best practices | **100** |
| SEO | **100** |

| Metric | Value |
|---|---|
| First Contentful Paint | 2.0 s |
| Largest Contentful Paint | 4.1 s |
| Total Blocking Time | **2,860 ms** |
| Cumulative Layout Shift | **0** |
| Speed Index | 4.7 s |
| Time to Interactive | 6.8 s |

To reproduce:

```bash
npx --yes lighthouse@12 https://fxreplay-growth-challenge.vercel.app/ \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new"
```

On Windows this exits non-zero on a temp-directory cleanup error *after* writing the
report; the JSON is still valid. Set `CHROME_PATH` if Chrome is not on `PATH`.

## Reading the performance score honestly

**53 is the weakest number in this project, and the cause is the product thesis.**

| Diagnostic | Value |
|---|---|
| Main-thread work | 9.2 s |
| JavaScript bootup time | 4.7 s |
| Total transfer | 525 KiB |
| Longest task | 881 ms |
| Next three tasks | 747 ms, 511 ms, 510 ms |

The replay autoplays on load: a canvas, a `requestAnimationFrame` loop, and a 120-candle
series advancing every 250ms. Lighthouse measures that as main-thread occupancy, and it
is not wrong to. The hero exists to be interactive, and interactivity has a cost that
shows up in exactly this metric.

That is an explanation, not a defence. The score is real and a visitor on a mid-range
phone experiences it.

**CLS of 0 is the number I am most pleased with.** The replay slot is reserved with a
fixed `aspect-[16/10]` container from the first server-rendered byte, so the canvas
mounts into space that was already allocated. The chart appearing shifts nothing.

**Three specific, unattempted fixes**, in order of expected value:

1. **The LCP element is the header wordmark** — a 19 KB SVG at `1609×209`, rendered at
   20px tall. It is `priority`-loaded, which is why it *is* the LCP, and it is far larger
   than it needs to be at that size. A smaller optimised asset is the cheapest win here.
2. **`surveys.js` is 34 KB of posthog-js we never use.** Setting `disable_surveys: true`
   removes it outright. The largest script is 186 KB and the next 72 KB; posthog-js is a
   substantial share of the bundle for a page that emits nine event types.
3. **Do not autoplay the replay until it is in view, or until the main thread is idle.**
   Deferring the rAF loop past first paint would move most of the 2,860ms out of the
   measured window. This has a real trade-off against the product thesis — a hero that is
   visibly moving is what communicates "this is playable" — so it is a decision to make
   deliberately rather than a pure optimisation. It should be measured per arm in the
   experiment.

### The deferral attempt, and why its result is not usable

Fix 3 was attempted indirectly. Gating the replay behind flag resolution — built for the
experiment's control arm — defers `ReplayPanel` from mounting until the flag lands, which
is a deferral in everything but name.

Re-measured against production after that shipped:

| | Before | After |
|---|---|---|
| Performance | 53 | 55 |
| First Contentful Paint | 2.0 s | 1.7 s |
| Largest Contentful Paint | 4.1 s | 3.8 s |
| **Total Blocking Time** | 2,860 ms | **3,110 ms** |
| Cumulative Layout Shift | 0 | **0** |
| Main-thread work | 9.2 s | 6.7 s |
| JS bootup | 4.7 s | 3.8 s |

**This comparison is invalid and should not be quoted as a performance win.** Lighthouse
measured a page with no canvas in it — "canvas" appears zero times in the report and none
of the replay's control text is present. It measured the **control arm**, not a deferred
treatment arm. Comparing 53 (treatment) against 55 (control) compares two different
pages.

The deferral is therefore **unmeasured**, not successful. Recording it as a failed
attempt rather than banking the two points.

**What the run did establish**, because it is the same page either way:

- **CLS is still 0.** The reservation holds across the variant switch.
- **The blocking time is not the canvas.** With no canvas on the page at all, TBT was
  *higher* at 3,110 ms, and the longest tasks — 963 ms and 671 ms — sit in a first-party
  application chunk. PostHog costs 2 ms of blocking and 51 KB. So the dominant cost is
  React hydration of the page itself, and fix 3 would have recovered less than assumed.
  That reframes the priority: the bundle, not the animation loop, is the thing to attack.
- FCP and LCP both improved by ~0.3 s, consistent with less work competing at startup.

**To measure the deferral properly**, the flag has to resolve to `interactive_replay`
inside the Lighthouse run, so both measurements are of the same arm. The straightforward
way is to force the flag on for the test session in PostHog and re-run. That was not done
here, and the number stays unclaimed until it is.

None of the three fixes were completed inside the six-hour budget.

## Rendering strategy

| Route | Strategy |
|---|---|
| `/` | Prerendered static |
| `/signup` | Server-rendered on demand |
| `/api/users`, `/api/users/[id]` | Server-rendered on demand |

Server Components by default. Exactly three client components exist — the replay panel,
the signup form, and the analytics provider. Everything else, including all nine landing
section components, renders on the server and ships no JavaScript of its own.

The landing page is therefore static HTML with two islands hydrating into it. That is the
right shape for this page; the caveat is that Next ships a React runtime to support those
islands whether the page needs it everywhere or not, which is the argument for Astro made
in [ARCHITECTURE.md](ARCHITECTURE.md).

## Caching and CDN

Vercel's edge network serves the static route. The signup page and the API routes are
dynamic by necessity — the signup page reads a query parameter for `entry_point`, and the
API writes.

Fonts are self-hosted through `next/font` with `display: swap`, so there is no
render-blocking request to a third-party font host and no FOIT.

**What would change with a real market feed:** the candle series would be fetched
server-side and cached at the edge with a short TTL, rather than generated in the client
bundle. That moves data off the JavaScript payload and lets many visitors share one
upstream fetch.

## SEO

Lighthouse scores **100**. The page has a `<title>` and meta description written for the
product rather than inherited from the template, one `<h1>`, semantic landmarks,
`lang="en"`, and a viewport meta tag. All content is server-rendered, so a crawler sees
the full page without executing JavaScript.

Not present: `robots.txt`, `sitemap.xml`, Open Graph and Twitter card tags, and structured
data. For a single-page marketing site these are quick additions; they were cut for
budget and are listed here rather than claimed.

## Accessibility

Lighthouse scores **100**: of 73 accessibility audits, 32 passed, **0 failed**, and 31
were not applicable to this page. Lighthouse does not catch everything,
so the checks below were done directly against the rendered markup and the token values.

**Heading order.** Exactly one `<h1>`, three `<h2>`, three `<h3>`, no skipped levels —
verified by extracting the outline from the rendered HTML rather than by reading JSX.

**Landmarks.** `<header>`, `<main>`, four `<section>` elements each with an
`aria-labelledby` pointing at its heading, and `<footer>`. The social proof strip is
deliberately a plain `<div>`: it has no heading, and a fifth region would be noise for a
screen reader stepping through landmarks.

**Keyboard operability.** Every interactive element is a real `<button>` or `<a>`. Zero
clickable `<div>`s and zero `role="button"` in the rendered output. The replay's controls
— play, step, speed, buy, sell, close, replay — are all native buttons and the speed
selector is a native `<select>`, chosen over a custom menu specifically so it is operable
and announced without reimplementing either.

**Focus visibility.** A 2px focus ring is defined once in the base layer on
`:focus-visible`, with an offset and its own token. It is never suppressed anywhere in
the cascade.

**Contrast — computed, not eyeballed.** Every pairing calculated from token values:

| Pairing | Ratio | |
|---|---|---|
| `fg-primary` on canvas | 19.08:1 | AAA |
| `fg-secondary` on canvas | 9.51:1 | AAA |
| `fg-muted` on canvas | 5.82:1 | AA |
| `fg-muted` on `surface` | 5.58:1 | AA |
| `fg-muted` on `surface-raised` | 4.91:1 | AA |
| `text-on-accent` on `accent` (the CTA) | 4.75:1 | AA |
| `market-up` on `surface-raised` (Buy) | 5.10:1 | AA |
| `market-down` on `surface-raised` (Sell) | 4.65:1 | AA |
| `accent-bright` on `accent-subtle` (eyebrow) | 7.10:1 | AAA |
| `accent-soft` on canvas ("1M+") | 7.00:1 | AA |
| `fg-muted` over a grid line | 5.48:1 | AA |

Two results that changed the code rather than being reported after the fact:

- **`market-down` was 3.99:1** and failed AA. Lightened from `#d6454b` to `#db595f`,
  hue unchanged, giving 4.65:1.
- **`text-on-accent` on `accent-hover` is 3.63:1** and was never shipped. The CTA hover
  darkens to `accent-pressed` (6.29:1) instead of lightening, which is the opposite of
  the token naming's suggestion and the right call.

Electric Blue itself is 3.86:1 on `surface` and therefore can never carry text. That
constraint is why `accent-soft` and `accent-bright` exist.

**`prefers-reduced-motion`.** The replay does not autoplay under the reduce preference;
the visitor advances the chart with an explicit Step forward control, and the Play/Pause
toggle is removed entirely. This is watched with a `matchMedia` change listener rather
than sampled once, so flipping the system setting mid-session stops playback immediately.

The page's entrance and scroll-reveal animations are separately gated inside
`prefers-reduced-motion: no-preference`. That is deliberate belt and braces: the global
reduce block zeroes `animation-duration`, which does **not** stop a scroll-driven
animation, because a timeline paces it rather than a duration.

**`aria-live` for dynamic results.** Trade outcomes are announced through a
`aria-live="polite"` region, and so are signup failures. Both regions are present from
first render rather than created when the message appears, so a screen reader is already
watching them.

**Colour never carries meaning alone.** Every trade direction pairs colour with the word
LONG or SHORT *and* an arrow glyph. Every P&L figure carries an explicit `+` or `−`. The
replay's status pairs its dot with the word Playing, Paused or Ended. Red and green is
the worst available pair for deuteranopia, and a sign plus a label costs nothing.

All decorative SVG is `aria-hidden` — verified as **6 of 6** in the production
markup, alongside 1 `<h1>`, 3 `<h2>`, 3 `<h3>`, 4 `<section>` elements, and the
replay slot's single reserved `aspect-[16/10]` container.

## Production risks

Specific, ordered by how likely they are to matter.

**Ad blockers suppress client telemetry.** Not a risk but an observed fact: during this
build, 100% of client-side events were blocked while server-emitted events arrived
untouched. This audience runs blockers above average. The conversion numerator survives
because it is server-emitted; the denominator does not. **Treat client-side counts as a
floor.** Mitigation is a reverse proxy on a first-party path — documented in
[ANALYTICS.md](ANALYTICS.md), not implemented.

**The in-memory adapter does not survive multiple instances.** With Supabase configured
this is moot. Without it, a deployment across several serverless instances gives each its
own `Map`, so a user created on one is invisible to another and a cold start empties it.
Acceptable for a zero-config demo, not for anything real.

**No rate limiting on user creation.** `POST /api/users` is unauthenticated and
unthrottled. A trivial script can fill the users table. A real deployment needs a rate
limit keyed on IP at minimum, and probably a captcha or an email verification step.

**Seeded data instead of a real market feed.** Every visitor sees the same 120 EURUSD
candles. A returning visitor sees an identical session, which undermines the "replay real
market data" claim the page makes if anyone looks twice.

**Observability is limited to platform defaults.** A failed `trackServer` call writes to
the Vercel function log and nothing aggregates it. There is no error tracking, no alerting
and no uptime monitoring. The analytics layer has a development-time detector for total
telemetry loss, but nothing equivalent runs in production — which is the wrong way round,
given that the failure it catches was discovered in production.

**No tests.** Covered in [ARCHITECTURE.md](ARCHITECTURE.md), including the two contracts
that would be written first. The honest cost is that most defects in this build were found
by inspecting production data rather than by anything failing locally.

**Performance at 53 on mobile.** Named above with three specific fixes. At real traffic
this is a conversion cost, and since the heavier hero is exactly what the experiment is
testing, it should be measured per arm rather than assumed neutral.
