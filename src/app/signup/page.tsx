import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Glow, GridTexture } from "@/components/landing/atmosphere";
import { SignupForm } from "@/components/signup/signup-form";
import { trackingPlan } from "@/lib/analytics/tracking-plan";

export const metadata: Metadata = {
  title: "Create your FX Replay account",
  description:
    "Create a free FX Replay account and keep the session you just played. No card required.",
};

/**
 * The placement the visitor arrived from, taken from the `from` query parameter that
 * every CTA sets.
 *
 * Validated against the tracking plan's own enum rather than a list retyped here, so
 * a hand-edited URL cannot smuggle an undeclared `entry_point` into `signup_started`
 * and make `validateEvent` throw in the visitor's browser. Anything unrecognised
 * falls back to the hero.
 */
const entryPointSchema =
  trackingPlan.account_created.properties.shape.entry_point;

export default async function SignupPage(props: PageProps<"/signup">) {
  const searchParams = await props.searchParams;
  const raw = searchParams.from;
  const parsed = entryPointSchema.safeParse(
    Array.isArray(raw) ? raw[0] : raw,
  );
  const entryPoint = parsed.success ? parsed.data : "hero";

  return (
    <div className="relative isolate flex flex-1 flex-col">
      <div
        aria-hidden="true"
        className="fx-top-fade pointer-events-none absolute inset-x-0 top-0 -z-10 h-[200px]"
      />

      <header className="border-b border-line-subtle">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center" aria-label="FX Replay home">
            <Image
              src="/FXReplayLogo.svg"
              alt="FX Replay"
              width={1609}
              height={209}
              priority
              className="h-[20px] w-auto"
            />
          </Link>

          <Link href="/" className="text-sm text-fg-muted hover:text-fg-primary">
            Back to the replay
          </Link>
        </div>
      </header>

      <main className="relative isolate flex flex-1 items-center">
        <GridTexture />
        <Glow className="fx-glow-strong left-1/2 top-1/2 h-[460px] w-[min(720px,92%)] -translate-x-1/2 -translate-y-1/2" />

        <div className="mx-auto w-full max-w-lg px-6 py-12 sm:py-16">
          <div className="rounded-2xl border border-line-default bg-surface p-7 shadow-2xl sm:p-9">
            <h1 className="text-3xl sm:text-4xl">Keep this session.</h1>
            <p className="mt-4 text-lg leading-relaxed text-fg-secondary">
              One step, no card, and the replay carries on where you left it.
            </p>

            <div className="mt-8">
              <SignupForm entryPoint={entryPoint} />
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-fg-muted">
            FX Replay is a backtesting and educational tool. It is not a broker and
            does not execute real orders. Simulated results are hypothetical and are
            not a reliable indicator of future trading performance.
          </p>
        </div>
      </main>
    </div>
  );
}
