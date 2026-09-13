/**
 * The chart renderer, shared by both arms of the hero experiment.
 *
 * This was extracted from the replay panel rather than rewritten. Both the interactive
 * arm and the control arm draw the same candles, the same gridlines, the same axis and
 * the same accent price line, because the experiment isolates interactivity and nothing
 * else — two drawing implementations would drift, and the day they drifted the arms
 * would differ in ways nobody chose.
 *
 * The only thing an arm varies is `index`: the interactive panel advances it once per
 * tick, the control passes the final candle and draws once.
 *
 * Deliberately framework-free. No React, no hooks, no module state — it takes a canvas,
 * a container and an index, and paints. That is what makes it callable from a component
 * that runs an animation loop and from one that renders a single frame.
 */

import { candles } from "./generate-candles";

/** Candles in the visible window. The chart scrolls rather than compressing. */
export const VISIBLE_CANDLES = 60;

export interface ChartColors {
  up: string;
  down: string;
  accent: string;
  onAccent: string;
  line: string;
  label: string;
  mono: string;
}

function resolveToken(root: CSSStyleDeclaration, name: string, depth = 0): string {
  const raw = root.getPropertyValue(name).trim();
  if (depth > 3) return raw;
  const indirection = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
  return indirection ? resolveToken(root, indirection[1], depth + 1) : raw;
}

export function readChartColors(): ChartColors {
  const root = getComputedStyle(document.documentElement);
  const mono = resolveToken(root, "--font-jetbrains");

  return {
    up: resolveToken(root, "--chart-up"),
    down: resolveToken(root, "--chart-down"),
    accent: resolveToken(root, "--chart-accent"),
    onAccent: resolveToken(root, "--chart-on-accent"),
    line: resolveToken(root, "--chart-line"),
    label: resolveToken(root, "--chart-label"),
    mono: mono ? `${mono}, ui-monospace, monospace` : "ui-monospace, monospace",
  };
}

function formatClock(time: number): string {
  const date = new Date(time);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Paints the chart up to and including `index`.
 *
 * Sizes the backing store to the device pixel ratio each call, so the same function
 * handles a resize and a repaint without the caller tracking which happened.
 */
export function drawChart(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  index: number,
  colors: ChartColors,
): void {
    // canvas, container and colors arrive as parameters.

    const ctx = canvas.getContext("2d");
    if (!ctx) return;



    // Back the canvas with real device pixels, or the chart is soft on retina.
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(container.clientWidth));
    const height = Math.max(1, Math.floor(container.clientHeight));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 12, right: 64, bottom: 26, left: 10 };
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = height - padding.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    if (plotWidth <= 0 || plotHeight <= 0) return;


    const start = Math.max(0, index - VISIBLE_CANDLES + 1);
    const visible = candles.slice(start, index + 1);
    if (visible.length === 0) return;

    let low = Infinity;
    let high = -Infinity;
    for (const candle of visible) {
      if (candle.low < low) low = candle.low;
      if (candle.high > high) high = candle.high;
    }
    // Breathing room so the extremes never touch the frame.
    const span = Math.max(high - low, 1e-5);
    low -= span * 0.08;
    high += span * 0.08;

    const yFor = (price: number) =>
      plotBottom - ((price - low) / (high - low)) * plotHeight;

    // Crisp hairlines: a 1px line on a half-pixel boundary does not blur.
    const hairline = (y: number) => Math.round(y) + 0.5;

    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.line;

    for (const fraction of [0.25, 0.5, 0.75]) {
      const y = hairline(plotTop + plotHeight * fraction);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    const axisY = hairline(plotBottom);
    ctx.beginPath();
    ctx.moveTo(plotLeft, axisY);
    ctx.lineTo(plotRight, axisY);
    ctx.stroke();

    // Time ticks under the axis, taken from the candles actually on screen.
    ctx.fillStyle = colors.label;
    ctx.font = `400 10px ${colors.mono}`;
    ctx.textBaseline = "top";
    for (let tick = 0; tick < 4; tick += 1) {
      const position = tick / 3;
      const candle = visible[Math.round(position * (visible.length - 1))];
      const x = plotLeft + plotWidth * position;
      ctx.textAlign = tick === 0 ? "left" : tick === 3 ? "right" : "center";
      ctx.fillText(formatClock(candle.time), x, plotBottom + 8);
    }

    // Candles.
    const slot = plotWidth / VISIBLE_CANDLES;
    const bodyWidth = Math.max(1, Math.floor(slot * 0.62));
    const offset = VISIBLE_CANDLES - visible.length;

    for (let i = 0; i < visible.length; i += 1) {
      const candle = visible[i];
      const rising = candle.close >= candle.open;
      const colour = rising ? colors.up : colors.down;
      const centre = plotLeft + (offset + i + 0.5) * slot;

      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;

      // Wick.
      const wickX = Math.round(centre) + 0.5;
      ctx.beginPath();
      ctx.moveTo(wickX, yFor(candle.high));
      ctx.lineTo(wickX, yFor(candle.low));
      ctx.stroke();

      // Body. A doji would vanish at sub-pixel height, so it keeps a 1px floor.
      const bodyTop = yFor(Math.max(candle.open, candle.close));
      const bodyBottom = yFor(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      ctx.fillRect(
        Math.round(centre - bodyWidth / 2),
        Math.round(bodyTop),
        bodyWidth,
        Math.round(bodyHeight),
      );
    }

    // Last close: the one accent mark inside the chart.
    const lastClose = visible[visible.length - 1].close;
    const closeY = hairline(yFor(lastClose));

    ctx.strokeStyle = colors.accent;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(plotLeft, closeY);
    ctx.lineTo(plotRight, closeY);
    ctx.stroke();
    ctx.setLineDash([]);

    // The price sits on a filled chip: accent text on the surface fill would be
    // 3.86:1, under AA. On the chip it is 4.75:1.
    const priceText = lastClose.toFixed(5);
    ctx.font = `500 11px ${colors.mono}`;
    const chipWidth = ctx.measureText(priceText).width + 12;
    const chipHeight = 18;
    const chipX = plotRight + 4;
    const chipY = closeY - chipHeight / 2;

    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, chipWidth, chipHeight, 3);
    ctx.fill();

    ctx.fillStyle = colors.onAccent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(priceText, chipX + chipWidth / 2, chipY + chipHeight / 2 + 0.5);
}
