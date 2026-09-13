import { HeroPanel } from "./hero-panel";
import { StaticPanel } from "./static-panel";

import { Glow, GridTexture } from "./atmosphere";
import { CtaLink } from "./cta-link";

/**
 * The hero exists to get the replay in front of the visitor. The left column argues
 * for about four seconds; the panel on the right is what actually sells.
 *
 * Bottom padding is deliberately smaller than the shared section rhythm. The stats
 * strip is the last thing in this section and it belongs to what follows it, not to
 * a gap.
 */

/** Published figures from fxreplay.com, not illustrative capability claims. */
const stats = [
  { value: "1M+", label: "traders" },
  { value: "2003", label: "data history since" },
  { value: "1s", label: "finest granularity" },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative isolate">
      <GridTexture />

      <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-6 sm:pt-14 sm:pb-8 lg:pt-16 lg:pb-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          {/* Panel leads on a phone, where it is the only thing worth scrolling for. */}
          <div className="order-2 lg:order-1">
            <p className="fx-enter inline-flex items-center rounded-full border border-accent-soft/40 bg-accent-subtle px-3 py-1 font-mono text-[12px] leading-5 text-accent-bright">
              Built for prop firm evaluations
            </p>

            {/* The break is explicit rather than left to balancing, so the split
                lands on the clause and the headline is always exactly two lines. */}
            <h1
              id="hero-heading"
              className="fx-enter fx-enter-2 mt-6 max-w-[22ch] text-4xl sm:text-5xl lg:text-[2.9rem] xl:text-[3.25rem]"
            >
              Practise the attempt
              <span className="block text-fg-secondary">
                before you pay for it.
              </span>
            </h1>

            <p className="fx-enter fx-enter-3 mt-5 max-w-[52ch] text-lg leading-relaxed text-fg-secondary">
              FX Replay runs real market data candle by candle. Take the trade,
              manage it, and see how it ends — under the same drawdown and daily
              loss rules your evaluation will judge you on.
            </p>

            <div className="fx-enter fx-enter-4 mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <CtaLink placement="hero">Try FX Replay free</CtaLink>
              <p className="text-sm text-fg-muted">
                No card required. Free forever.
              </p>
            </div>

            <ul className="fx-enter fx-enter-5 mt-10 flex border-t border-line-subtle pt-6">
              {stats.map((stat, index) => (
                <li
                  key={stat.label}
                  className={
                    index === 0
                      ? "pr-6 sm:pr-8"
                      : "border-l border-line-subtle pl-6 pr-6 sm:pl-8 sm:pr-8"
                  }
                >
                  <span className="tabular block text-2xl font-medium text-fg-primary">
                    {stat.value}
                  </span>
                  <span className="mt-1 block text-xs text-fg-muted">
                    {stat.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Replay panel */}
          <div className="fx-enter fx-enter-2 relative order-1 lg:order-2">
            <Glow className="fx-glow-strong -inset-x-8 -top-6 -bottom-6" />

            {/* The arm is chosen from the same feature flag that stamps `variant`
                onto every event. `StaticPanel` is passed in already server-rendered,
                so the control arm ships no JavaScript of its own. */}
            <HeroPanel control={<StaticPanel />} />
          </div>
        </div>
      </div>
    </section>
  );
}
