"use client";

import { useEffect, useState } from "react";

import { ReplayPanel } from "@/components/replay/replay-panel";
import { subscribeToVariant } from "@/lib/analytics/context";

type Variant = "control" | "interactive_replay";

/**
 * Chooses which hero panel the visitor sees.
 *
 * The arm comes from the analytics layer's flag state, the same feature flag that
 * stamps `variant` onto every event. There is deliberately no second source of truth:
 * if this component read the flag independently, a visitor could be shown one arm and
 * have their events attributed to the other, and nothing downstream would reveal it.
 *
 * THE RACE, AND WHAT IS RENDERED DURING IT
 *
 * The flag resolves asynchronously and the hero renders before it. This component shows
 * the CONTROL panel in that window, and swaps to the interactive panel only once the
 * flag has resolved to `interactive_replay`. Three reasons, in order of weight:
 *
 * 1. Mounting `ReplayPanel` first and swapping away would autoplay the replay and fire
 *    `replay_started` for a visitor who belongs to the control arm. That is not a
 *    flicker problem, it is a contaminated experiment.
 *
 * 2. Control is where an unresolved flag lands anyway. Given that ad blockers suppress
 *    flag requests for a large share of this audience, that is a common path rather
 *    than an edge case. Rendering it immediately means those visitors see no swap at
 *    all.
 *
 *    This subscribes to the flag rather than waiting on `onVariantResolved`, which
 *    gives up after 2000ms. That timeout was the cause of a real defect: on a cold load
 *    the hero stayed static and only became interactive after a reload, because the
 *    timer expired before the flag landed and the component committed to control.
 *
 * 3. It keeps the reservation honest. The control panel is the lighter of the two, so
 *    the visitor sees real chrome — title bar, gridlines, axis — rather than a blank
 *    box, and `aspect-[16/10]` holds the chart area from the first server-rendered
 *    byte either way.
 *
 * The cost is paid by the interactive arm: when the flag resolves to
 * `interactive_replay`, the controls row mounts below the chart and the panel grows by
 * that row's height. That is one shift, for one arm, at flag-resolution time. The
 * alternative — reserving the controls row during the race — moves the same shift onto
 * the control arm, which is both the larger population here and the one Lighthouse
 * measures. Measured numbers are in PERFORMANCE.md.
 *
 * `control` arrives as a prop rather than being imported here, so the static panel
 * stays a Server Component and ships no JavaScript of its own.
 */
export function HeroPanel({ control }: { control: React.ReactNode }) {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    // Subscribes rather than racing a timeout. `onVariantResolved` gives up after
    // 2000ms and answers `control`, which is the right trade for an event but the
    // wrong one for a hero: a timed-out render commits the visitor to the control arm
    // for the entire visit, and their later events get attributed to an arm they were
    // never in. This waits for the real answer and swaps if it arrives.
    return subscribeToVariant(setVariant);
  }, []);

  if (variant === "interactive_replay") return <ReplayPanel />;

  return <>{control}</>;
}
