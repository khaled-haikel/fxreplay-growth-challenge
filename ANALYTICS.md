# Analytics

The tables below are generated from `src/lib/analytics/tracking-plan.ts`. That file is
the single source of truth — the application, the runtime validator, the MCP server and
this document all read the same declarations.

## Events

Nine declared events. Eight emit from the browser; the conversion emits from the server.

| Event | Emitted from | Trigger |
|---|---|---|
| `page_viewed` | client | Landing page mount. |
| `replay_started` | client | Play control activated, or autoplay begins when motion is allowed. |
| `trade_opened` | client | Buy or sell control activated. |
| `trade_closed` | client | Close control activated, or the replay reaches the end of data with an open position. |
| `replay_completed` | client | Final candle rendered with zero trades opened during the session. |
| `cta_clicked` | client | CTA activated. |
| `signup_started` | client | First meaningful interaction with a signup field. |
| `signup_failed` | client | Users API returns a non-2xx response, or the request never completes. |
| `account_created` | **server** | POST /api/users succeeds and the transaction commits. |

Naming is `snake_case`, past-tense verb. An event describes something that happened
(`trade_closed`), not something the code is about to do.

## Properties

Every schema is `.strict()`. An undeclared property is a validation error, not an extra
detail that quietly lands in the warehouse.

| Event | Property | Type |
|---|---|---|
| `page_viewed` | `path` | string |
| | `referrer` | string \| null |
| | `utm_source` | string \| null |
| | `utm_medium` | string \| null |
| | `utm_campaign` | string \| null |
| `replay_started` | `symbol` | string |
| | `initiated_by` | `user` \| `autoplay` |
| | `reduced_motion` | boolean |
| `trade_opened` | `direction` | `long` \| `short` |
| | `candle_index` | int ≥ 0 |
| | `time_since_replay_start_ms` | int ≥ 0 |
| `trade_closed` | `direction` | `long` \| `short` |
| | `outcome` | `win` \| `loss` \| `breakeven` |
| | `pnl_r` | number |
| | `hold_candles` | int > 0 |
| | `trade_number` | int > 0 |
| `replay_completed` | `symbol` | string |
| | `candles_watched` | int > 0 |
| `cta_clicked` | `placement` | `hero` \| `post_trade` \| `features` \| `footer` \| `nav` |
| | `label` | string |
| `signup_started` | `entry_point` | `hero` \| `post_trade` \| `features` \| `footer` \| `nav` |
| | `had_traded` | boolean |
| `signup_failed` | `reason` | `validation` \| `duplicate_email` \| `server_error` \| `network` |
| | `field` | string \| null |
| | `status_code` | int \| null |
| `account_created` | `user_id` | uuid |
| | `entry_point` | `hero` \| `post_trade` \| `features` \| `footer` \| `nav` |
| | `trades_before_signup` | int ≥ 0 |
| | `time_to_signup_ms` | int ≥ 0 \| null |

### Shared context, attached to every event

| Property | Type |
|---|---|
| `variant` | `control` \| `interactive_replay` |
| `flag_resolved` | boolean |
| `event_id` | uuid |
| `session_id` | string |
| `device_type` | `mobile` \| `tablet` \| `desktop` |

`variant` lives in shared context rather than on individual events so that any event can
be sliced by experiment arm without re-instrumenting. `event_id` is the deduplication key
for the case where the same logical event can originate on both sides.

## The funnel

| Step | Event | Label |
|---|---|---|
| 1 | `page_viewed` | Landed |
| 2 | `replay_started` | Started the replay |
| 3 | `trade_closed` | Completed a trade (activation) |
| 4 | `signup_started` | Began signup |
| 5 | `account_created` | Created an account |

Step 3 is the one that makes the rest interpretable. Without an activation step, a
drop-off tells you the variant lost but not whether nobody pressed play or everybody
played and nobody signed up. Those are different problems with different fixes.

## Primary conversion metric

**Unique visitors reaching `account_created` divided by unique visitors reaching
`page_viewed`, measured per experiment arm.**

Unique visitors, not events: a visitor who reloads twice is one denominator entry.
Per arm, because a blended number cannot answer the question the experiment exists to
ask.

### Guardrails

| Guardrail | Definition | Rule |
|---|---|---|
| Signup failure rate | `signup_failed / signup_started` | Must not increase. A lift bought with a broken form is not a lift. |
| Activation quality | `trade_closed / replay_started` | Must not decrease. More people starting the replay but fewer finishing a trade means the hero attracts attention without delivering what it promises. |

---

# Data quality

This section is the one worth arguing with. Five of the guarantees below are enforced by
code; two are known holes with the mitigation stated.

## The tracking plan is the single source of truth

`track()` is generically typed over the declared event names. There is no string-literal
escape hatch, so **an undeclared event name does not compile**. Every consumer derives
from the same file:

- TypeScript types for every payload
- runtime validation at the emit boundary
- the funnel definition
- the MCP server that agents query before instrumenting

## Strict schemas

Property schemas are `.strict()`. `validateEvent` throws in development so a violation
surfaces during implementation; in production it logs, drops the event, and returns —
bad analytics is a defect, a broken page is an outage.

This was tested rather than assumed. Running a deliberately wrong payload through the MCP
server, which calls the application's own validator:

```
[tracking-plan] trade_closed: invalid properties:
  outcome Invalid option: expected one of "win"|"loss"|"breakeven";
  hold_candles Too small: expected number to be >0;
  (root) Unrecognized key: "note"
```

Three defects caught in one payload, including the undeclared key.

## The conversion event is emitted from the server

`account_created` is declared `emittedFrom: 'server'`, and `validateEvent` rejects an
attempt from the client:

```
[tracking-plan] account_created: may only be emitted from the server,
  attempted from the client
```

The reason is not theoretical. During this build, the browser proved to be the least
reliable participant in the system — see the ad blocker section below. The event that
defines success does not depend on it.

Verified in production: the Supabase row committed at `03:50:09.983Z` and
`account_created` carries `03:50:10.065Z` — **81ms later**, from `posthog-node`.

## Identity resolution

Everything before signup is attributed to an anonymous `distinct_id` in a cookie. The
signup request carries that id in its body, because the server has no cookie and cannot
derive it. After the API returns 201 — and only then — the browser calls
`identify(userId, { email, name })`.

The ordering matters. Identifying on submit rather than on success would merge an
anonymous visitor into an account for a conversion that might then fail, and there is no
undo for that.

**Without this the funnel never closes.** PostHog would see an anonymous visitor who
played the replay and a separate identified user who appeared from nowhere, and no query
would connect them.

Verified end to end in production:

| | |
|---|---|
| `page_viewed` `distinct_id` | `01a098e2-1283-7cb2-aec9-5deddbba5cb0` |
| `account_created` `distinct_id` | `01a098e2-1283-7cb2-aec9-5deddbba5cb0` |
| `$identify` fired | yes, merging the pre-signup journey into the account |
| Identified person keyed on | `8a9db777-…`, confirmed identical to the Supabase `user.id` |

## `flag_resolved`

Feature flags arrive asynchronously. Until they do, `variant` holds the control default,
and funnel-entry events wait up to 2000ms for resolution before emitting.

That created an ambiguity: **`variant: "control"` meant either a real control assignment
or a flag that never resolved.** Every blocked, slow or failed flag request silently
inflated the control arm and biased the experiment toward finding no effect. Nothing
downstream revealed it.

`flag_resolved` makes the two distinguishable. Events carrying `false` must be **excluded
from experiment analysis**, not counted as control. They remain valid for
non-experiment reporting, where the arm does not matter.

This is not hypothetical. A production `replay_started` was captured carrying
`variant: "control"` with `flag_resolved: false`, while PostHog's own server-side
annotation showed the visitor's real assignment was `interactive_replay`. Without the
field, that row would have been counted as a control observation for a treatment
visitor.

## Accepted system events

PostHog emits events of its own. Rather than leave a reviewer guessing whether an
unfamiliar `$` event is a defect, the plan declares which are expected:

| Event | Why it is allowed |
|---|---|
| `$pageleave` | Enabled via `capture_pageleave`. Gives time-on-page, which is the diagnostic that matters for a landing page. Stable system properties. |
| `$feature_flag_called` | Emitted when `getFeatureFlag` runs. It is how PostHog attributes exposure to an arm; disabling it means losing flag functionality. |
| `$experiment_exposure` | The record that a visitor was exposed to an arm. Experiment results are computed from it. |
| `$web_vitals` | Core Web Vitals from posthog-js. Low volume, and a slow LCP is a conversion problem before it is a performance one. |

`autocapture` and `capture_pageview` are **off**. Autocapture fires one event per click
keyed on CSS selectors, which breaks whenever markup changes and would bury the declared
funnel in noise. `capture_pageview` would shadow `page_viewed`, which carries the
properties the plan actually declares.

**Any system event not on this list is a defect to investigate.** That list did its job:
`$experiment_exposure` and `$web_vitals` were both added *after* a production
verification turned them up as undeclared.

## Ad blockers suppressed 100% of client telemetry

The most important finding in this build, and the one with the largest consequence.

**For the entire development period, not a single client-side event reached PostHog.**
Every declared browser event was blocked, along with PostHog's own `$pageleave` and
`$feature_flag_called`. The only events ever to arrive were two `account_created`,
emitted server-side from `posthog-node`, which no browser extension can touch.

**It was found by opening PostHog and noticing the project contained exactly one event
type.** Nothing in the application failed. The page rendered correctly, the console was
clean, the build passed, `tsc` and eslint were clean, and the funnel had a numerator and
no denominator. Every check that could be performed locally said the instrumentation was
correct — and it was correct. The transport was dead.

The diagnosis was settled by confirming the public key, the api_host and the entire init
path were verifiably present in the shipped client bundle, and that the server — using
the *same* key and the *same* host — delivered successfully from Node. The only variable
left between the working path and the dead one was the browser.

**This is load-bearing for this product, not an edge case.** The audience is retail
traders researching prop firm evaluations — a population that runs blockers far above
the general average, reaching finance and trading sites where blocking rates are higher
still. Any conversion metric built on client-side events will under-count by a margin
that is both large and *uneven*: the visitors most likely to block are not a random
sample of the funnel.

Two consequences were designed in before this was discovered, and both are vindicated by
it. Emitting `account_created` from the server is the reason a conversion was recorded at
all. And the funnel's denominator, which is client-side by necessity, is the number to
distrust.

**The mitigation is a reverse proxy on a first-party domain.** Rewriting `/ingest/*` to
the PostHog host means requests are no longer to a domain on any blocklist. It costs one
rewrite rule and a change of `api_host`, and it is the only measure that recovers the
blocked population rather than merely measuring the loss. It is deliberately not
implemented here: it needs the deployed domain and belongs with platform configuration
rather than a local build. **Until it exists, treat client-side counts as a floor.**

**The defect worth fixing was the silence, not the blocking.** An analytics layer that
delivers nothing and reports nothing is broken whatever the cause. PostHog's own state
is enough to detect it without sending a synthetic event: `posthog.init` always requests
feature flags, so `onFeatureFlags` failing to fire within a few seconds means no
successful round trip happened. The application was already subscribed to that callback
and was discarding the signal. It now warns, loudly, in development — within seconds of
page load rather than hours later in a dashboard.

## Timestamp ordering caveat

Events emitted before PostHog finishes initialising are queued and flushed once it is
ready. posthog-js stamps `timestamp` when `capture()` runs, which for a queued event is
at **flush** time, not emit time.

Separately, `page_viewed` waits for the feature flag before emitting while
`replay_started` does not. In a verified production journey that put `replay_started` at
`04:15:49.980` and `page_viewed` at `04:15:51.118` — **step 2 arriving 1.14 seconds
before step 1**.

This is correct behaviour: funnel entry must be attributed to the right arm, and that is
worth the delay. But **a funnel charted on raw timestamp will look wrong**, and whoever
builds that chart should order on the declared funnel sequence rather than on the clock.
