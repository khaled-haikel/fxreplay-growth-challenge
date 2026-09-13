/**
 * Sample market data for the hero replay.
 *
 * ILLUSTRATIVE SAMPLE DATA. This is not a recording of a real session and must not be
 * presented as one. In production this series would come from the same market data API
 * the application already uses, fetched server-side and cached at the edge: the shape
 * below (a fixed array of OHLC candles for one symbol and timeframe) is deliberately
 * the shape that endpoint would return, so swapping the source is a change of import
 * and nothing else.
 *
 * The trade-off being bought here is a landing page that runs with zero configuration,
 * no API key in the browser, no rate limit on marketing traffic, and no dependency on
 * a third party being up for the hero to work.
 *
 * Deterministic by construction. The generator is seeded and there is no `Math.random`
 * anywhere in this file, so every visitor, every render and every CI run sees exactly
 * the same 120 candles. A hero that looked different on each load would make the
 * screenshot in a bug report useless.
 */

export interface Candle {
  /** Epoch milliseconds for the candle's open. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const SYMBOL = "EURUSD";
export const TIMEFRAME = "5m";

const SEED = 0x5eed_f00d;
const COUNT = 120;
const BASE_PRICE = 1.085;
const STEP_MS = 5 * 60 * 1000;
/** Fixed start so the axis labels are stable across renders. */
const START_TIME = Date.UTC(2026, 2, 10, 8, 0, 0);

/**
 * mulberry32. Thirty-two bits of state, a handful of integer ops, and a period long
 * enough that 120 draws never come close to it. Chosen over a dependency because a
 * seeded PRNG is ten lines and this project does not add packages for ten lines.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Five decimal places, which is how EURUSD is actually quoted. */
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Builds the series in regimes rather than as independent steps.
 *
 * A random walk with constant volatility reads as noise, and this audience looks at
 * charts all day — they would clock it immediately. Real intraday price action moves
 * in stretches: a push, a pause, a pullback that retraces part of it, then another
 * push. So each regime picks its own drift and volatility and holds them for a run of
 * candles, and a weak pull toward the base price keeps ten hours of 5m candles from
 * wandering somewhere EURUSD would not go.
 */
function generate(): Candle[] {
  const random = mulberry32(SEED);
  const series: Candle[] = [];

  let price = BASE_PRICE;
  let index = 0;

  while (index < COUNT) {
    // A regime runs 8-26 candles: long enough to read as a move, short enough that
    // the visible window always contains more than one.
    const regimeLength = 8 + Math.floor(random() * 19);

    // Per-candle drift, up to ~1.3 pips. Sign is what creates trends and pullbacks.
    const drift = (random() - 0.5) * 2 * 0.00013;
    // Volatility varies per regime, so quiet stretches and busy ones both appear.
    const volatility = 0.00022 + random() * 0.0004;

    for (let step = 0; step < regimeLength && index < COUNT; step += 1, index += 1) {
      const open = price;

      // Mean reversion toward the base. Weak enough not to flatten the trend, strong
      // enough to keep the series inside a plausible daily range.
      const pull = (BASE_PRICE - price) * 0.015;
      const shock = (random() - 0.5) * 2 * volatility;
      const close = open + drift + pull + shock;

      // Wicks are drawn independently of the body, and occasionally much longer than
      // it — that asymmetry is most of what makes a candle series look real.
      const range = Math.abs(close - open);
      const wickHigh = random() * (volatility * 0.85) + range * 0.12;
      const wickLow = random() * (volatility * 0.85) + range * 0.12;

      series.push({
        time: START_TIME + index * STEP_MS,
        open: round5(open),
        high: round5(Math.max(open, close) + wickHigh),
        low: round5(Math.min(open, close) - wickLow),
        close: round5(close),
      });

      price = close;
    }
  }

  return series;
}

/**
 * The series. Generated once at module load and frozen: it is shared by every consumer
 * and nothing should be able to mutate the chart's data out from under it.
 */
export const candles: readonly Candle[] = Object.freeze(generate());

/** Distance from entry that counts as 1R. 15 pips is a normal intraday stop. */
export const RISK_DISTANCE = 0.0015;
