import Image from "next/image";

import { Panel } from "./panel";
import { StaticChart } from "./static-chart";
import { SYMBOL, TIMEFRAME } from "@/lib/replay/generate-candles";

/**
 * The control arm of the hero experiment.
 *
 * It renders the SAME chart as the treatment — same seeded series, same renderer, same
 * price line and axis — in its final state. The difference between the arms is precisely
 * and only interactivity:
 *
 *   no animation loop, no candle-by-candle advance
 *   no Play, Buy, Sell or Close controls
 *   no floating Session P&L / Trades / Status cards
 *   a static title bar status
 *
 * WHY IT IS NOT AN EMPTY SKELETON
 *
 * The first version of this control was a reserved box with gridlines and no data. That
 * was methodologically wrong: it varied both the presence of content and the presence of
 * interactivity, so a win for the treatment could have been caused by either. Worse, it
 * was a control nobody would actually build — someone shipping a static hero for this
 * product would render the chart, not leave a hole — which made the comparison a
 * foregone conclusion rather than a measurement.
 *
 * A control should be the best reasonable version of the alternative. This is that.
 *
 * The title bar reads "Preview" rather than "Paused": there is no playback to be paused,
 * and a status implying a stopped animation would suggest an interaction that does not
 * exist.
 */
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
      {/* The same reservation as the treatment. Both arms hold identical space from the
          first server-rendered byte, so the variant switch cannot shift layout. */}
      <StaticChart />
    </Panel>
  );
}
