/**
 * A band, not a section: bordered top and bottom, compact padding, no heading.
 *
 * It answers the question the hero raises — is there a real product behind this —
 * with the two cheapest pieces of evidence available: how many people use it, and
 * what it covers. Deliberately quiet. A logo wall or a marquee would make the page
 * look like it is trying harder than the product needs it to.
 *
 * Rendered as a plain element rather than a `section` so it does not add a fifth
 * landmark region for a screen reader to step through.
 */

const assetClasses = [
  "Forex",
  "Futures",
  "Stocks",
  "Indices",
  "Crypto",
  "Metals",
  "Bonds",
];

export function SocialProof() {
  return (
    <div className="border-y border-line-subtle">
      <div className="fx-reveal mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-4">
        <p className="text-sm text-fg-secondary">
          Trusted by <span className="tabular font-semibold text-accent-soft">1M+</span> traders
        </p>

        <ul className="flex flex-wrap items-center gap-2">
          {assetClasses.map((assetClass) => (
            <li
              key={assetClass}
              className="rounded-full border border-line-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors duration-200 hover:border-line-strong hover:text-fg-secondary"
            >
              {assetClass}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
