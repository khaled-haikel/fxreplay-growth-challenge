"use client";

import { useEffect, useRef } from "react";

import { candles } from "@/lib/replay/generate-candles";
import { drawChart, readChartColors } from "@/lib/replay/draw-chart";

/**
 * The control arm's chart: the same series as the treatment, in its final state.
 *
 * WHY THIS IS A CLIENT COMPONENT
 *
 * It is the minimum that drawing to a canvas allows. A canvas has no server-rendered
 * representation — the element can be emitted as HTML, but nothing is painted into it
 * until a 2D context exists, which only happens in a browser. So this component ships
 * JavaScript, and the honest framing is that it ships as little as possible: one effect,
 * one draw call, one resize observer, and no state at all.
 *
 * What it does NOT ship, which is the entire point: no animation loop, no trade
 * mechanics, no controls, no instrumentation. It paints once and stops.
 *
 * WHY IT DRAWS THE WHOLE SERIES
 *
 * The first version of this control rendered an empty skeleton, which confounded two
 * variables: whether the visitor saw market data at all, and whether they could interact
 * with it. A win for the treatment could then have been caused by either, and the
 * experiment would have produced a confident answer to a question nobody asked. The
 * control now shows the same chart, so the only difference between arms is
 * interactivity.
 */
export function StaticChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const colors = readChartColors();

    // The final candle, drawn once. `drawChart` shows a trailing window ending at this
    // index, so the control sees exactly what the treatment shows after its last tick.
    const paint = () => drawChart(canvas, container, candles.length - 1, colors);

    paint();

    // The only ongoing work: repaint on resize, because a canvas does not reflow. No
    // requestAnimationFrame, no timer, nothing that runs unprompted.
    const observer = new ResizeObserver(paint);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative aspect-[16/10] w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="EURUSD 5-minute candlestick chart using illustrative sample market data."
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
