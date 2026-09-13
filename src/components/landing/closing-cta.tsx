import { Glow } from "./atmosphere";
import { CtaLink } from "./cta-link";
import { Panel } from "./panel";

/**
 * The second and last ask. One sentence of value, then the same CTA as the hero —
 * same label, same destination, so the page makes a single offer rather than two.
 *
 * The panel beside it is what a session looks like when it is over: the journal the
 * proof section promised, filled in. It is the argument for signing up, made as
 * evidence rather than as a claim.
 */

/**
 * ILLUSTRATIVE SAMPLE VALUES. Not the live replay, not a track record, and not a
 * performance claim.
 *
 * Two of the four trades lose, and the win rate is 50%. That is deliberate on two
 * counts: a marketing page showing four winners is the first thing an experienced
 * trader discounts, and in this industry a rosy simulated result sitting next to a
 * signup form is exactly what a regulator reads as an implied performance claim.
 * A modest positive expectancy off a coin-flip win rate is both more honest and more
 * persuasive to the person we are talking to.
 */
const sampleTrades = [
  { direction: "LONG", holdCandles: 12, pnlR: 1.4 },
  { direction: "SHORT", holdCandles: 7, pnlR: -1.0 },
  { direction: "LONG", holdCandles: 23, pnlR: -0.55 },
  { direction: "SHORT", holdCandles: 15, pnlR: 2.1 },
] as const;

const summary = [
  { label: "Trades", value: "4" },
  { label: "Win rate", value: "50%" },
  { label: "Net R", value: "+1.95" },
];

/**
 * Direction arrow. Paired with the word LONG or SHORT in every case — the colour and
 * the arrow are both redundant encodings, so nothing here depends on seeing either.
 */
function DirectionArrow({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[0.85em] w-[0.85em] shrink-0"
    >
      {up ? (
        <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
      ) : (
        <path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" />
      )}
    </svg>
  );
}

function formatR(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}R`;
}

export function ClosingCta() {
  return (
    <section aria-labelledby="closing-heading" className="relative isolate">
      <Glow className="left-1/2 top-1/2 h-[420px] w-[min(760px,90%)] -translate-x-1/2 -translate-y-1/2" />

      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-14">
          <div className="fx-reveal">
            <h2
              id="closing-heading"
              className="max-w-[26ch] text-3xl sm:text-4xl lg:text-5xl"
            >
              Your first attempt should not be your first attempt.
            </h2>

            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-fg-secondary">
              Replay the market, take the trades, and find out what breaks your plan
              before an evaluation fee is the thing that teaches you.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <CtaLink placement="footer">Try FX Replay free</CtaLink>
              <p className="text-sm text-fg-muted">
                No card required. Free forever.
              </p>
            </div>
          </div>

          <div className="fx-reveal fx-reveal-2">
            <Panel
              bar={
                <>
                  <span className="font-mono text-sm text-fg-primary">
                    Session summary
                  </span>
                  <span className="ml-auto font-mono text-xs text-fg-muted">
                    EURUSD &middot; <span className="tabular">5m</span>
                  </span>
                </>
              }
            >
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Example replay session: four simulated trades with hold time and
                  result in R multiples.
                </caption>
                <thead>
                  <tr className="text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-2 text-left font-normal">
                      Direction
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">
                      Held
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sampleTrades.map((trade, index) => {
                    const isLong = trade.direction === "LONG";
                    const won = trade.pnlR >= 0;

                    return (
                      <tr
                        key={index}
                        className="border-t border-line-subtle"
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className={`flex items-center gap-1.5 font-mono ${
                              isLong ? "text-market-up" : "text-market-down"
                            }`}
                          >
                            <DirectionArrow up={isLong} />
                            {trade.direction}
                          </span>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-fg-secondary">
                          {trade.holdCandles}
                        </td>
                        <td
                          className={`tabular px-4 py-2.5 text-right font-semibold ${
                            won ? "text-market-up" : "text-market-down"
                          }`}
                        >
                          {formatR(trade.pnlR)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <dl className="grid grid-cols-3 border-t border-line-subtle">
                {summary.map((item, index) => (
                  <div
                    key={item.label}
                    className={`px-4 py-3 ${
                      index > 0 ? "border-l border-line-subtle" : ""
                    }`}
                  >
                    <dt className="text-xs text-fg-muted">{item.label}</dt>
                    <dd className="tabular mt-0.5 text-lg font-medium text-fg-primary">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <p className="mt-3 text-xs text-fg-muted">
              Example session. Simulated results.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
