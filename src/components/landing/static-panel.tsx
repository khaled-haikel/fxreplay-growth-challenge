import Image from "next/image";

import { Panel } from "./panel";
import { SYMBOL, TIMEFRAME } from "@/lib/replay/generate-candles";

/**
 * The control arm of the hero experiment.
 *
 * Everything the interactive panel has except the interaction: the same `Panel`
 * chrome, the same title bar, the same reserved 16/10 body, the same gridlines and
 * price axis. No canvas, no animation loop, no controls, no instrumentation.
 *
 * A screenshot was deliberately not used. The hypothesis isolates *interactivity* —
 * whether letting a visitor take a trade converts better than describing one — so the
 * two arms must differ in exactly that and nothing else. A rendered image of a real
 * chart would also change the visual density, the colour, and the amount of market
 * information on screen, and a lift could then be attributed to any of them. The
 * skeleton keeps the comparison honest at the cost of a less impressive control.
 *
 * Server Component: it renders to static HTML and ships no JavaScript at all, which is
 * also what makes the arms differ in main-thread cost the way the experiment expects.
 */

/** Matches the interactive panel's gridline placement so the two arms sit identically. */
const GRIDLINE_FRACTIONS = [0.25, 0.5, 0.75];

/**
 * Four axis ticks as em dashes rather than prices.
 *
 * The control shows no market data, so inventing plausible price labels would put
 * fabricated numbers on the page — the same reason the evaluation rules panel uses
 * dashes. A dash reads as "not populated"; a made-up price reads as a claim.
 */
const AXIS_TICKS = [0, 1, 2, 3];

export function StaticPanel() {
  return (
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
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="text-xs text-fg-muted">Preview</span>
          </span>
        </>
      }
    >
      {/* The same reservation as the interactive arm. Both arms must occupy identical
          space from the first server-rendered byte or the experiment would compare two
          different layouts as well as two different heroes. */}
      <div className="relative aspect-[16/10] w-full">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[12%] bottom-[28%] flex flex-col justify-between opacity-60"
        >
          {GRIDLINE_FRACTIONS.map((fraction) => (
            <span key={fraction} className="h-px w-full bg-line-subtle" />
          ))}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[22%] h-px bg-line-subtle"
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[9%] flex justify-between px-5"
        >
          {AXIS_TICKS.map((tick) => (
            <span key={tick} className="tabular text-[10px] text-fg-muted">
              &mdash;
            </span>
          ))}
        </div>

        <p className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
          Market replay
        </p>
      </div>
    </Panel>
  );
}
