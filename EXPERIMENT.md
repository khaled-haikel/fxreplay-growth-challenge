# The experiment

## Hypothesis

Visitors cannot tell what FX Replay feels like before creating an account. Traders
compare everything to TradingView, where the chart is visible without signing up, so the
account is asked for before any value has been demonstrated.

**If the hero gives away a working piece of the product — an interactive replay where a
visitor takes a trade and sees the result — then more visitors will create an account,
because the ask arrives after the value rather than before it.**

The mechanism is specific: the moment a trade closes is the first time a visitor has
*experienced* the product rather than read about it. That moment is where the signup
prompt appears.

## Arms

Feature flag: `hero-interactive-replay`

| Arm | Hero |
|---|---|
| `control` | Headline, subhead, CTA, and a static chart image in the panel. No interaction. |
| `interactive_replay` | The same headline and CTA, with a playable replay: autoplay, buy/sell/close, live P&L in R, and a post-trade CTA inside the panel. |

Everything outside the hero is identical — same copy, same proof cards, same signup
form, same page structure. The only difference is whether the panel is interactive.

**Note on the current build:** only the `interactive_replay` arm is implemented. The
control arm needs a static panel variant, which is a small piece of work but real: the
`variant` value is already available to every component through
`getVariant()`, so branching the panel is the remaining step. Running the experiment
without it would compare the treatment against nothing.

## Primary metric

**Unique visitors reaching `account_created` ÷ unique visitors reaching `page_viewed`,
per arm.**

Unique visitors rather than events. `account_created` is server-emitted, so the numerator
survives ad blockers; the denominator does not, which is discussed under
[Threats](#threats-to-validity).

## Sizing

We do not know FX Replay's traffic, so every input below is stated as an assumption and
the arithmetic is shown. Substitute real numbers and the same formula applies.

**Assumptions**

| Input | Value | Why |
|---|---|---|
| Baseline conversion | 3% | Plausible for landing → free account with no card. Unverified. |
| Minimum detectable effect | +25% relative (3% → 3.75%) | Below this, the change is not worth the maintenance of a second hero. |
| Power (1 − β) | 80% | Convention. |
| Confidence (1 − α) | 95%, two-sided | Two-sided because the replay could plausibly *hurt* — a heavier hero that delays the CTA. |

**Formula** — two-proportion comparison:

```
n per arm = (Z_α/2 + Z_β)² × [ p₁(1−p₁) + p₂(1−p₂) ] / (p₂ − p₁)²
```

**Worked**

```
(Z_α/2 + Z_β)²  = (1.96 + 0.8416)²   = 7.849
p₁(1−p₁)        = 0.03 × 0.97        = 0.02910
p₂(1−p₂)        = 0.0375 × 0.9625    = 0.03609
numerator       = 7.849 × 0.06519    = 0.51171
denominator     = (0.0075)²          = 0.00005625

n per arm       = 0.51171 / 0.00005625 = 9,097
total           = 18,194
```

**Runtime**

| Weekly visitors | Weeks to reach 18,194 |
|---|---|
| 5,000 | 3.6 |
| 20,000 | 0.9 |

**Sensitivity** — the assumptions move this a lot, which is why they are stated rather
than buried:

| Baseline | MDE | n per arm | Total | Weeks @ 5k/wk |
|---|---|---|---|---|
| 2% | +20% | 21,106 | 42,212 | 8.4 |
| 2% | +25% | 13,807 | 27,614 | 5.5 |
| 3% | +20% | 13,911 | 27,822 | 5.6 |
| **3%** | **+25%** | **9,097** | **18,194** | **3.6** |
| 3% | +50% | 2,515 | 5,030 | 1.0 |
| 5% | +25% | 5,330 | 10,660 | 2.1 |

**Minimum runtime of two full weeks regardless of sample.** Trading activity has a
weekly rhythm — weekdays differ from weekends, and someone researching a prop firm
evaluation behaves differently on a Tuesday than a Sunday. Stopping at 9 days because
the sample arrived would sample a weekday bias.

## Decision criteria

Evaluated once, at the pre-declared sample size. No peeking at significance and stopping
early; that inflates the false positive rate well beyond the stated 5%.

### Ship the interactive replay

- Primary metric is significantly higher at p < 0.05, **and**
- the observed lift is at or above the +25% MDE, **and**
- neither guardrail is breached.

### Continue running

- The result is directionally positive but the confidence interval still contains zero,
  **and** the planned sample has not been reached.

If the full sample has been reached and the interval still contains zero, that is not a
"continue" — it is a reject. Extending a test until it produces the answer you wanted is
how a 5% false positive rate becomes a 30% one.

### Reject and keep the control

- The primary metric is lower, **or**
- the full sample is reached with no significant difference. The replay is a
  meaningfully more expensive hero — a canvas, a rAF loop, 2,860ms of blocking time. It
  has to earn that, and "no measurable difference" means it did not.

### Guardrails that override a positive result

Both are declared in the tracking plan. A variant that improves the primary metric while
breaching either does **not** ship.

| Guardrail | Definition | Why it overrides |
|---|---|---|
| **Signup failure rate** | `signup_failed / signup_started` | A lift bought with a form that fails more often is not a lift. It moves the failure later in the funnel, where it costs more. |
| **Activation quality** | `trade_closed / replay_started` | If more people start the replay but fewer finish a trade, the hero is attracting attention without delivering what it promises. That is a worse outcome than a flat conversion rate, because it trains visitors to distrust the page. |

A third signal worth watching, though not a formal guardrail: **LCP and total blocking
time per arm**. The treatment hero is measurably heavier, and a conversion lift that
comes with a materially worse experience on mid-range mobile is a trade that should be
made deliberately rather than discovered later.

## Analysis rules

**Events carrying `flag_resolved: false` are excluded from analysis, not counted as
control.**

This is the rule that makes the experiment trustworthy. Feature flags resolve
asynchronously; until they do, the code falls back to `control`. Without the field, a
flag that was blocked, slow, or failed would produce an event indistinguishable from a
genuine control assignment — and every such failure would silently inflate the control
arm, biasing the result toward "no effect".

The bias is not random, either. Flag requests fail for the same reasons analytics
requests fail — ad blockers, slow connections, restrictive networks — so the contaminated
rows would be concentrated in a particular kind of visitor rather than spread evenly.

A production event was captured carrying `variant: "control"` with `flag_resolved: false`
while PostHog's own annotation showed the visitor's true assignment was
`interactive_replay`. Counting that row as control would have been a straightforward
error in the direction of the null hypothesis.

Excluded rows are still valid for non-experiment reporting, where the arm does not
matter.

## Threats to validity

**The denominator is client-side and under-counts.** `page_viewed` is a browser event
and ad blockers suppressed 100% of client telemetry during this build. The numerator,
`account_created`, is server-emitted and complete. A partially-blocked denominator
against a complete numerator **inflates the apparent conversion rate** — and would do so
unevenly across arms only if blocking correlates with arm, which it should not. The
absolute rate is therefore untrustworthy; the *relative* comparison between arms survives,
which is what the decision rests on. Fixing this properly is the reverse proxy.

**Only one arm is built.** Stated above and worth repeating: there is no control hero
yet.

**One symbol, one timeframe, seeded data.** The replay always shows the same 120 EURUSD
candles. A visitor who reloads sees an identical session. Whether the effect holds with
real, varying market data is untested.

**Novelty.** An interactive hero may convert well initially because it is unusual rather
than because it is useful. A two-week minimum helps; a follow-up read at four weeks would
help more.
