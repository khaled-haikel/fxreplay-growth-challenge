/**
 * Three outcomes, not three features. Each one answers "what does this let me do the
 * night before my evaluation", which is the only question this visitor is asking.
 *
 * Each card opens with a miniature of the thing it describes rather than an icon.
 * An icon is a label for a feature; these are the feature, shown small — a candle
 * strip with a playhead, three journalled trades, three limits with one nearly
 * spent. They are drawn from the same vocabulary as the replay panel and the rules
 * panel, so the page reads as one product rather than as three illustrations of one.
 *
 * All three previews are decorative and hidden from assistive tech: the heading and
 * the body already say everything they say.
 */

/* -------------------------------------------------------------------------- */
/* Previews                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A candle strip with the playhead partway along it.
 *
 * Built from positioned elements rather than an SVG.
 *
 * The first version of this was an SVG with `preserveAspectRatio="none"`, which
 * stretched a 200x64 viewBox into a box around 340x92 — a non-uniform scale of about
 * 1.7x horizontally against 1.44x vertically. Every stroke came out a different
 * thickness depending on its axis, which is what made it look blurry and cheap. It
 * was not a resolution problem; it was a distortion one, and no amount of source
 * fidelity would have fixed it.
 *
 * Percentage-positioned elements have no such axis. They stay exactly 1px crisp at
 * any card width, take their colours from the tokens directly, and cost nothing.
 */
const PREVIEW_CLOSES = [
  40, 37, 39, 33, 30, 32, 26, 23, 25, 20, 22, 17, 19, 14, 16, 12,
];
const PREVIEW_WICK = 4;
const PLAYHEAD_INDEX = 9;

/** y is inverted the way a chart's is: a smaller number is a higher price. */
const previewBars = (() => {
  const raw = PREVIEW_CLOSES.map((close, index) => {
    const open = index === 0 ? 42 : PREVIEW_CLOSES[index - 1];
    return {
      open,
      close,
      top: Math.min(open, close) - PREVIEW_WICK,
      bottom: Math.max(open, close) + PREVIEW_WICK,
    };
  });

  const min = Math.min(...raw.map((c) => c.top));
  const max = Math.max(...raw.map((c) => c.bottom));
  const pct = (y: number) => ((y - min) / (max - min)) * 100;

  return raw.map((c) => {
    const bodyTop = pct(Math.min(c.open, c.close));
    return {
      up: c.close <= c.open,
      wickTop: pct(c.top),
      wickHeight: pct(c.bottom) - pct(c.top),
      bodyTop,
      bodyHeight: Math.max(3, pct(Math.max(c.open, c.close)) - bodyTop),
    };
  });
})();

function CandlePreview() {
  return (
    <div aria-hidden="true" className="relative h-full w-full px-4 py-3">
      <div className="flex h-full items-stretch gap-[3px]">
        {previewBars.map((bar, index) => (
          <div key={index} className="relative flex-1">
            <span
              className={`absolute left-1/2 w-px -translate-x-1/2 ${
                bar.up ? "bg-market-up" : "bg-market-down"
              }`}
              style={{ top: `${bar.wickTop}%`, height: `${bar.wickHeight}%` }}
            />
            <span
              className={`absolute inset-x-0 rounded-[1px] ${
                bar.up ? "bg-market-up" : "bg-market-down"
              }`}
              style={{ top: `${bar.bodyTop}%`, height: `${bar.bodyHeight}%` }}
            />
          </div>
        ))}
      </div>

      <span
        className="absolute inset-y-2 w-px border-l border-dashed border-accent"
        style={{
          left: `calc(1rem + ${((PLAYHEAD_INDEX + 0.5) / previewBars.length) * 100}%)`,
        }}
      />
    </div>
  );
}

/** Three journalled trades, in the shape the session summary uses. */
const previewTrades = [
  { direction: "LONG", up: true, result: "+1.20R", won: true },
  { direction: "SHORT", up: false, result: "-0.80R", won: false },
  { direction: "LONG", up: true, result: "+0.45R", won: true },
];

function JournalPreview() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col justify-center gap-1.5">
      {previewTrades.map((trade) => (
        <div
          key={trade.direction + trade.result}
          className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-canvas px-2.5 py-1"
        >
          <span
            className={`flex items-center gap-1 font-mono text-[10px] ${
              trade.up ? "text-market-up" : "text-market-down"
            }`}
          >
            <span>{trade.up ? "↑" : "↓"}</span>
            {trade.direction}
          </span>
          <span
            className={`tabular text-[10px] ${
              trade.won ? "text-market-up" : "text-market-down"
            }`}
          >
            {trade.result}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Three limits, the last of them nearly spent.
 *
 * The near-full bar is the whole point of the card. A constraint you are about to
 * hit is what an evaluation actually feels like, and it is the one thing a demo
 * account with no rules can never show you.
 */
const previewLimits = [
  { key: "target", fill: "w-[45%]", tone: "bg-accent" },
  { key: "daily", fill: "w-[68%]", tone: "bg-accent" },
  { key: "drawdown", fill: "w-[91%]", tone: "bg-market-down" },
];

function LimitPreview() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col justify-center gap-3.5">
      {previewLimits.map((limit) => (
        <div key={limit.key} className="flex items-center gap-2">
          <span className="h-[3px] flex-1 rounded-full bg-line-default">
            <span className={`block h-full rounded-full ${limit.fill} ${limit.tone}`} />
          </span>
          <span className="tabular w-3 text-right text-[10px] text-fg-muted">
            &mdash;
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const items = [
  {
    index: "01",
    Preview: CandlePreview,
    inset: false,
    heading: "Replay real market data at your own pace",
    body:
      "Step forward one candle at a time, or let it run. Pause on the setup that keeps " +
      "catching you out and take it again, until the decision stops being a decision.",
  },
  {
    index: "02",
    Preview: JournalPreview,
    inset: true,
    heading: "Every trade is journaled as you take it",
    body:
      "Direction, entry, exit, hold time and result are recorded while you work. You " +
      "review what you actually did, not the improved version you remember afterwards.",
  },
  {
    index: "03",
    Preview: LimitPreview,
    inset: true,
    heading: "Rehearse the evaluation, not just the market",
    body:
      "Set the profit target, daily loss cap and maximum drawdown your firm uses, then " +
      "find out whether your strategy survives them while the attempt is still free.",
  },
];

export function Proof() {
  return (
    <section aria-labelledby="proof-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-14 lg:py-16">
        <h2 id="proof-heading" className="fx-reveal text-3xl sm:text-4xl">
          Reps, not theory.
        </h2>

        <ul className="mt-10 grid gap-5 lg:grid-cols-3">
          {items.map((item, index) => (
            <li
              key={item.index}
              className={`group fx-reveal ${
                ["", "fx-reveal-2", "fx-reveal-3"][index]
              } flex h-full flex-col overflow-hidden rounded-xl border border-line-subtle bg-surface transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-line-default`}
            >
              {/* The preview gets its own inset band so the card reads as a piece of
                  product with a caption under it, rather than as a paragraph with a
                  picture stuck on top. */}
              <div
                className={`relative h-[92px] border-b border-line-subtle bg-surface-raised ${
                  item.inset ? "px-4 py-3" : ""
                }`}
              >
                <item.Preview />
                <span className="tabular absolute right-3 top-2.5 text-[10px] text-accent-soft">
                  {item.index}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-xl leading-snug">{item.heading}</h3>
                <p className="mt-3 leading-relaxed text-fg-secondary">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
