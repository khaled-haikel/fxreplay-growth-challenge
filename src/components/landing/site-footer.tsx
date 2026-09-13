import Image from "next/image";

export function SiteFooter() {
  return (
    <footer className="border-t border-line-subtle">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-6 py-6 sm:py-7 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Image
            src="/FXReplayLogo.svg"
            alt="FX Replay"
            width={1609}
            height={209}
            className="h-[16px] w-auto opacity-60"
          />

          <p className="text-sm text-fg-muted">
            &copy; <span className="tabular">2026</span> FX Replay. Market replay
            and backtesting for manual traders.
          </p>
        </div>

        {/* This industry expects a risk disclosure, and its absence is louder than
            its presence to anyone who reads these pages for a living. Written for
            this product rather than copied from theirs. */}
        <p className="max-w-[90ch] border-t border-line-subtle pt-4 text-xs leading-relaxed text-fg-muted">
          FX Replay is a backtesting and educational tool. It is not a broker, does
          not execute real orders, and does not hold client funds. Everything traded
          here is simulated against historical data. Simulated results are
          hypothetical: they do not account for real execution, slippage, financing
          or liquidity, and they are not a reliable indicator of future trading
          performance. Trading leveraged instruments carries a substantial risk of
          loss.
        </p>
      </div>
    </footer>
  );
}
