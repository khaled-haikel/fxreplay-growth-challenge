/**
 * The interactive replay. This is the activation step of the funnel: the point where a
 * visitor stops reading about the product and uses it.
 *
 * ARCHITECTURE, because the obvious React version of this is the wrong one.
 *
 * All animation state lives in refs and the draw loop writes straight to a canvas.
 * React state changes only when something a human can see changes — a trade opens or
 * closes, playback starts or stops, the series ends, or the open P&L moves to a new
 * candle. At 60fps a per-frame `setState` would mean sixty reconciliations a second
 * for a chart React cannot help draw anyway.
 *
 * Canvas rather than SVG for the same reason: 120 candles is ~240 SVG nodes with
 * layout and paint on every advance. A canvas is one node.
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Panel } from "@/components/landing/panel";
import { track } from "@/lib/analytics/client";
import { recordReplayStart, recordTradeCount } from "@/lib/replay/session-state";
import {
  RISK_DISTANCE,
  SYMBOL,
  TIMEFRAME,
  candles,
} from "@/lib/replay/generate-candles";
import {
  drawChart,
  readChartColors,
  type ChartColors,
} from "@/lib/replay/draw-chart";

/** Candles already on screen at first paint, so the chart is never near-empty. */
const HISTORY = 40;
/**
 * Playback speed, as milliseconds per candle.
 *
 * Offered as time-per-candle rather than as a multiplier because that is the unit
 * the instrument is already measured in — a trader reading a 5m chart knows what
 * "one candle per second" means without converting anything.
 *
 * The default is a quarter-second: the full 120-candle series runs in about twenty
 * seconds, which is roughly as long as a visitor will watch before deciding whether
 * to touch it.
 */
const SPEED_OPTIONS = [
  { ms: 100, label: "0.1s" },
  { ms: 250, label: "0.25s" },
  { ms: 500, label: "0.5s" },
  { ms: 1000, label: "1s" },
  { ms: 2000, label: "2s" },
];
const DEFAULT_CANDLE_MS = 250;
/** Below this, a result is flat rather than a win or a loss. */
const BREAKEVEN_R = 0.05;

type Direction = "long" | "short";
type Status = "idle" | "playing" | "paused" | "ended";

interface Position {
  direction: Direction;
  entryPrice: number;
  entryIndex: number;
}

interface Result {
  direction: Direction;
  outcome: "win" | "loss" | "breakeven";
  pnlR: number;
  holdCandles: number;
}




function formatR(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}


/** R multiple for a position at a given price. Shorts profit as price falls. */
function rMultiple(position: Position, price: number): number {
  const move = price - position.entryPrice;
  const signed = position.direction === "long" ? move : -move;
  return signed / RISK_DISTANCE;
}

/**
 * A floating session card.
 *
 * These overlap the panel edges and are the only elements on the page carrying a
 * shadow besides the panel itself — that is what separates a card sitting *on* the
 * chart from one sitting beside it.
 *
 * Below `lg` the overlap is dropped entirely: at phone width there is no margin to
 * hang anything in, and a card over the chart would cover the thing it describes.
 */
function DataCard({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line-default bg-surface-raised px-3 py-2 shadow-xl ${className}`}
    >
      <p className="text-[10px] leading-4 text-fg-muted">{label}</p>
      <div className="mt-0.5 text-sm leading-5">{children}</div>
    </div>
  );
}

/** Circular arrow. Drawn rather than imported, like every other mark on the page. */
function RestartGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[0.9em] w-[0.9em]"
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.9-4.16" />
      <path d="M13.5 1.5V4.5H10.5" />
    </svg>
  );
}

/** Skip-to-next-candle mark. */
function StepGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[0.9em] w-[0.9em]"
    >
      <path d="M3.5 3.5l6 4.5-6 4.5z" />
      <path d="M12.5 3.5v9" />
    </svg>
  );
}

export function ReplayPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef<ChartColors | null>(null);
  const rafRef = useRef<number | null>(null);

  /** Playback state. Written every frame, never read by React during render. */
  const playbackRef = useRef({
    index: HISTORY - 1,
    lastFrame: 0,
    accumulator: 0,
    playing: false,
  });

  /** Trade state, mirrored into React only where the UI needs it. */
  const tradeRef = useRef<{
    position: Position | null;
    count: number;
    everOpened: boolean;
  }>({ position: null, count: 0, everOpened: false });

  const completedRef = useRef(false);
  /** Set from an effect below. `finish` needs to settle an open position, and
   *  `closePosition` is declared after it. */
  const closeRef = useRef<() => void>(() => {});
  const startedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  /** Read by the loop every frame, so changing speed never forces a render. */
  const speedRef = useRef(DEFAULT_CANDLE_MS);

  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState<Position | null>(null);
  const [openR, setOpenR] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [speedMs, setSpeedMs] = useState(DEFAULT_CANDLE_MS);

  /**
   * Presentation-only session totals for the floating cards.
   *
   * `tradeCount` mirrors `tradeRef.current.count`, which already existed but lived
   * in a ref React cannot re-render from. `sessionR` is genuinely new: the panel
   * previously kept only the most recent result and discarded the ones before it,
   * so a running total had nothing to accumulate from. Neither feeds analytics.
   */
  const [tradeCount, setTradeCount] = useState(0);
  const [sessionR, setSessionR] = useState(0);

  /* ---------------------------------------------------------------- drawing */

  /**
   * Paints the current frame.
   *
   * The drawing lives in `drawChart`, shared with the control arm so the two cannot
   * drift. The only thing this arm varies is the index, which its loop advances.
   */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const colors = (colorsRef.current ??= readChartColors());
    drawChart(canvas, container, playbackRef.current.index, colors);
  }, []);

  /* ------------------------------------------------------------- playback */

  const stopFrame = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /**
   * Ends the series.
   *
   * A position still open here is settled rather than abandoned. The tracking plan
   * declares `trade_closed`'s trigger as "Close control activated, or the replay
   * reaches the end of data with an open position" — the second half of that was
   * not implemented, so a visitor who opened a trade and let the replay run out
   * produced no activation event at all.
   *
   * `replay_completed` stays diagnostic: only when the whole series was watched
   * without a single trade, and only once per session however many times the
   * visitor replays it.
   */
  const finish = useCallback(() => {
    playbackRef.current.playing = false;
    stopFrame();
    setStatus("ended");

    if (tradeRef.current.position) {
      closeRef.current();
      return;
    }

    if (!tradeRef.current.everOpened && !completedRef.current) {
      completedRef.current = true;
      track("replay_completed", {
        symbol: SYMBOL,
        candles_watched: playbackRef.current.index + 1,
      });
    }
  }, [stopFrame]);

  /**
   * The loop lives in a ref so it can schedule itself.
   *
   * A `useCallback` that calls `requestAnimationFrame(frame)` inside its own body
   * references itself before it is declared, and a self-referencing memo cannot be
   * re-created when its dependencies change without the running loop still holding
   * the stale one. The ref is re-pointed whenever `draw` or `finish` change, and the
   * loop always schedules whatever is current.
   */
  const frameRef = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    frameRef.current = (now: number) => {
      const playback = playbackRef.current;
      if (!playback.playing) return;

      if (playback.lastFrame === 0) playback.lastFrame = now;
      playback.accumulator += now - playback.lastFrame;
      playback.lastFrame = now;

      let advanced = false;
      const perCandle = speedRef.current;
      while (
        playback.accumulator >= perCandle &&
        playback.index < candles.length - 1
      ) {
        playback.index += 1;
        playback.accumulator -= perCandle;
        advanced = true;
      }

      draw();

      // The only state write in the loop, and it is per candle rather than per
      // frame, and only while a position is open — the P&L is on screen then and a
      // human is watching it move.
      if (advanced && tradeRef.current.position) {
        setOpenR(
          rMultiple(tradeRef.current.position, candles[playback.index].close),
        );
      }

      if (playback.index >= candles.length - 1) {
        finish();
        return;
      }

      rafRef.current = requestAnimationFrame(frameRef.current);
    };
  }, [draw, finish]);

  /** Emits `replay_started` exactly once, on the first advance of any kind. */
  const markStarted = useCallback((initiatedBy: "user" | "autoplay") => {
    if (startedRef.current) return;
    startedRef.current = true;
    startedAtRef.current = performance.now();
    // Presentation state for the signup page. Not an event.
    recordReplayStart();

    track("replay_started", {
      symbol: SYMBOL,
      initiated_by: initiatedBy,
      reduced_motion: reducedMotionRef.current,
    });
  }, []);

  const play = useCallback(
    (initiatedBy: "user" | "autoplay") => {
      if (playbackRef.current.index >= candles.length - 1) return;
      markStarted(initiatedBy);

      playbackRef.current.playing = true;
      playbackRef.current.lastFrame = 0;
      setStatus("playing");

      stopFrame();
      rafRef.current = requestAnimationFrame(frameRef.current);
    },
    [markStarted, stopFrame],
  );

  const pause = useCallback(() => {
    playbackRef.current.playing = false;
    stopFrame();
    setStatus("paused");
  }, [stopFrame]);

  /** Manual advance. The only way forward when the visitor asked for less motion. */
  const stepForward = useCallback(() => {
    const playback = playbackRef.current;
    if (playback.index >= candles.length - 1) return;

    markStarted("user");
    playback.index += 1;
    draw();

    if (tradeRef.current.position) {
      setOpenR(rMultiple(tradeRef.current.position, candles[playback.index].close));
    }
    if (playback.index >= candles.length - 1) finish();
  }, [draw, finish, markStarted]);

  /**
   * Runs the series again from the start.
   *
   * Without this the hero dies: the data is 120 candles at 260ms, so roughly
   * twenty seconds after load the chart froze on its last frame with no way back,
   * and every visitor arriving later than that met a still image.
   *
   * Session totals survive a replay on purpose — the trades really were taken, and
   * the cards above are a session summary, not a per-run one.
   */
  const restart = useCallback(() => {
    const playback = playbackRef.current;
    playback.index = HISTORY - 1;
    playback.accumulator = 0;
    playback.lastFrame = 0;
    draw();

    if (reducedMotionRef.current) {
      setStatus("paused");
      return;
    }

    playback.playing = true;
    setStatus("playing");
    stopFrame();
    rafRef.current = requestAnimationFrame(frameRef.current);
  }, [draw, stopFrame]);

  /* ---------------------------------------------------------------- trades */

  const openPosition = useCallback((direction: Direction) => {
    if (tradeRef.current.position) return;

    const index = playbackRef.current.index;
    const next: Position = {
      direction,
      entryPrice: candles[index].close,
      entryIndex: index,
    };

    tradeRef.current.position = next;
    tradeRef.current.everOpened = true;
    setPosition(next);
    setOpenR(0);
    setResult(null);

    track("trade_opened", {
      direction,
      candle_index: index,
      // Measured from the first advance, not from mount: time spent before the
      // visitor engaged is not time-to-trade.
      time_since_replay_start_ms:
        startedAtRef.current === null
          ? 0
          : Math.max(0, Math.round(performance.now() - startedAtRef.current)),
    });
  }, []);

  const closePosition = useCallback(() => {
    const open = tradeRef.current.position;
    if (!open) return;

    const index = playbackRef.current.index;
    const pnlR = rMultiple(open, candles[index].close);
    // The schema requires a positive integer. Opening and closing on the same
    // candle is legal in the UI and would otherwise emit 0 and throw in dev.
    const holdCandles = Math.max(1, index - open.entryIndex);
    const outcome =
      pnlR > BREAKEVEN_R ? "win" : pnlR < -BREAKEVEN_R ? "loss" : "breakeven";
    const tradeNumber = tradeRef.current.count + 1;

    tradeRef.current.count = tradeNumber;
    tradeRef.current.position = null;

    setPosition(null);
    setResult({ direction: open.direction, outcome, pnlR, holdCandles });
    setTradeCount(tradeNumber);
    setSessionR((total) => total + pnlR);
    recordTradeCount(tradeNumber);

    // ACTIVATION. The moment the product has been experienced rather than read about.
    track("trade_closed", {
      direction: open.direction,
      outcome,
      pnl_r: Number(pnlR.toFixed(2)),
      hold_candles: holdCandles,
      trade_number: tradeNumber,
    });
  }, []);

  useEffect(() => {
    closeRef.current = closePosition;
  }, [closePosition]);

  /* --------------------------------------------------------------- effects */

  // Reduced motion, watched rather than sampled: a visitor can change the system
  // setting while the page is open, and autoplay must stop if they do.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = (matches: boolean) => {
      reducedMotionRef.current = matches;
      setReducedMotion(matches);
      if (matches) {
        playbackRef.current.playing = false;
        stopFrame();
        setStatus((current) => (current === "playing" ? "paused" : current));
      }
    };

    apply(query.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [stopFrame]);

  // First paint, resize handling, and autoplay. Redraws on container resize so the
  // chart is never stretched or stale.
  useEffect(() => {
    draw();

    const container = containerRef.current;
    const playback = playbackRef.current;
    const observer = new ResizeObserver(() => draw());
    if (container) observer.observe(container);

    if (!reducedMotionRef.current) play("autoplay");

    return () => {
      observer.disconnect();
      playback.playing = false;
      stopFrame();
    };
    // Intentionally mount-only: `play` and `draw` are stable, and re-running this
    // would restart playback from wherever the visitor had got to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ view */

  const ended = status === "ended";
  const playing = status === "playing";
  const directionLabel = (direction: Direction) =>
    direction === "long" ? "Long" : "Short";

  // Outlined rather than filled: a solid green and red pair either side of the hero
  // CTA would leave three things competing to be pressed.
  const controlBase =
    "inline-flex items-center gap-2 rounded-full border bg-surface-raised px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const controlClass = `${controlBase} border-line-default text-fg-primary enabled:hover:border-line-strong`;
  const buyClass = `${controlBase} border-market-up text-market-up enabled:hover:bg-surface`;
  const sellClass = `${controlBase} border-market-down text-market-down enabled:hover:bg-surface`;

  // Colour is never the only carrier: every one of these is paired with a word and,
  // for numbers, an explicit sign.
  const statusLabel =
    status === "playing" ? "Live" : status === "ended" ? "Ended" : "Paused";

  // Colour is never the only signal: the sign is explicit and the label is a word.
  const sessionTone =
    tradeCount === 0
      ? "text-fg-secondary"
      : sessionR >= 0
        ? "text-market-up"
        : "text-market-down";

  // One definition per card, rendered twice: floating at `lg`, stacked below the
  // panel under it. Duplicating the values instead would let the two drift.
  const cardContent = {
    pnl: (
      <DataCard label="Session P&L">
        <span className={`tabular font-semibold ${sessionTone}`}>
          {formatR(sessionR)}
        </span>
      </DataCard>
    ),
    status: (
      <DataCard label="Status">
        <span className="flex items-center gap-2 text-fg-primary">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              status === "playing" ? "bg-market-up" : "bg-fg-muted"
            }`}
          />
          {statusLabel}
        </span>
      </DataCard>
    ),
    trades: (
      <DataCard label="Trades">
        <span className="tabular font-semibold text-fg-primary">
          {tradeCount}
        </span>
      </DataCard>
    ),
  };

  const resultSentence = result
    ? `${directionLabel(result.direction)} closed. ${
        result.outcome === "win"
          ? "Win"
          : result.outcome === "loss"
            ? "Loss"
            : "Breakeven"
      }, ${formatR(result.pnlR)} over ${result.holdCandles} ${
        result.holdCandles === 1 ? "candle" : "candles"
      }.`
    : "";

  return (
    <div className="relative">
      <Panel
        className="shadow-2xl"
        bar={
          <>
            <Image
              src="/isotypeWhite.svg"
              alt=""
              aria-hidden="true"
              width={719}
              height={719}
              className="h-3 w-3 shrink-0"
            />
            <span className="font-mono text-sm text-fg-primary">{SYMBOL}</span>
            <span className="tabular text-sm text-fg-muted">{TIMEFRAME}</span>

            <span className="ml-auto flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  playing ? "bg-market-up" : "bg-fg-muted"
                }`}
              />
              <span className="text-xs text-fg-muted">
                {playing ? "Playing" : ended ? "Ended" : "Paused"}
              </span>
            </span>
          </>
        }
      >
        <div ref={containerRef} className="relative aspect-[16/10] w-full">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${SYMBOL} ${TIMEFRAME} candlestick replay using illustrative sample market data. Trade results are announced below the chart.`}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <div className="space-y-3 border-t border-line-subtle p-3">
          <div className="flex flex-wrap items-center gap-2">
            {ended ? (
              <button type="button" onClick={restart} className={controlClass}>
                <RestartGlyph />
                Replay
              </button>
            ) : reducedMotion ? null : (
              <button
                type="button"
                onClick={() => (playing ? pause() : play("user"))}
                disabled={ended}
                className={controlClass}
              >
                {playing ? (
                  <span aria-hidden="true" className="flex gap-[3px]">
                    <span className="block h-3 w-[3px] bg-fg-primary" />
                    <span className="block h-3 w-[3px] bg-fg-primary" />
                  </span>
                ) : (
                  <Image
                    src="/isotypeWhite.svg"
                    alt=""
                    aria-hidden="true"
                    width={719}
                    height={719}
                    className="h-3 w-3"
                  />
                )}
                {playing ? "Pause" : "Play"}
              </button>
            )}

            <button
              type="button"
              onClick={stepForward}
              disabled={ended}
              aria-label="Step forward one candle"
              title="Step forward one candle"
              className={`${controlClass} px-3`}
            >
              <StepGlyph />
            </button>

            {/* Seconds per candle. A native select so it is keyboard operable and
                announced without a custom menu implementation behind it. */}
            <label className="relative inline-flex items-center">
              <span className="sr-only">Seconds per candle</span>
              <select
                value={speedMs}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  speedRef.current = next;
                  setSpeedMs(next);
                }}
                className="tabular appearance-none rounded-full border border-line-default bg-surface-raised py-1.5 pl-4 pr-8 text-sm font-semibold text-fg-primary"
              >
                {SPEED_OPTIONS.map((option) => (
                  <option key={option.ms} value={option.ms}>
                    {option.label}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="pointer-events-none absolute right-3 h-2.5 w-2.5 text-fg-muted"
              >
                <path d="M2.5 4.5L6 8l3.5-3.5" />
              </svg>
            </label>

            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-default" />

            <button
              type="button"
              onClick={() => openPosition("long")}
              disabled={position !== null || ended}
              className={buyClass}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => openPosition("short")}
              disabled={position !== null || ended}
              className={sellClass}
            >
              Sell
            </button>
            <button
              type="button"
              onClick={closePosition}
              disabled={position === null}
              className={controlClass}
            >
              Close
            </button>
          </div>

          {position && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                className={
                  position.direction === "long"
                    ? "font-semibold text-market-up"
                    : "font-semibold text-market-down"
                }
              >
                {directionLabel(position.direction)}
              </span>
              <span className="text-fg-muted">
                entry{" "}
                <span className="tabular text-fg-secondary">
                  {position.entryPrice.toFixed(5)}
                </span>
              </span>
              <span
                className={`tabular font-semibold ${
                  openR >= 0 ? "text-market-up" : "text-market-down"
                }`}
              >
                {formatR(openR)}
              </span>
            </p>
          )}

          {/* Results are announced, not just shown. Present from first render so the
              live region is already in the accessibility tree when it changes. */}
          <p aria-live="polite" className="text-sm text-fg-secondary">
            {resultSentence}
          </p>

          {result && (
            <Link
              href="/signup?from=post_trade"
              onClick={() =>
                track("cta_clicked", {
                  placement: "post_trade",
                  label: "Keep this session",
                })
              }
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-bold text-fg-on-accent transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-pressed"
            >
              Keep this session
            </Link>
          )}
        </div>
      </Panel>

      {/* Floating at desktop widths, where there is margin to hang them in. */}
      <div className="pointer-events-none hidden lg:block">
        <div className="absolute -left-6 top-[13%] w-[132px]">
          {cardContent.pnl}
        </div>
        <div className="absolute -right-6 top-[36%] w-[122px]">
          {cardContent.status}
        </div>
        <div className="absolute -right-6 top-[60%] w-[112px]">
          {cardContent.trades}
        </div>
      </div>

      {/* Stacked below the panel on phones: no overlap, nothing covering the chart. */}
      <div className="mt-3 grid grid-cols-3 gap-2 lg:hidden">
        {cardContent.pnl}
        {cardContent.status}
        {cardContent.trades}
      </div>
    </div>
  );
}
