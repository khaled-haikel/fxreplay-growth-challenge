import { Panel } from "./panel";

/**
 * Speaks to one person: the trader with an evaluation booked and a fee already spent
 * or about to be.
 *
 * The band carries a border as well as a fill. `surface` on `canvas` is 1.04:1, so
 * without the rules above and below it this section would have no edge at all.
 */

/**
 * The constraints an evaluation is actually decided by.
 *
 * Every value is an em dash on purpose. These are numbers the trader sets to match
 * their own firm, and putting plausible figures here would be a fabricated claim
 * about firms we know nothing about — the kind that gets screenshotted and quoted
 * back later.
 *
 * The track behind each dash is what stops that reading as missing data. A marker
 * sitting somewhere along a limit says "this is a dial you set"; four bare dashes in
 * a column say "this table failed to load". Marker positions differ per row so the
 * panel reads as four separate constraints rather than one repeated graphic. They are
 * illustrative positions, not values — which is why none of them carries a number.
 *
 * Each track carries a filled segment up to its marker, in the accent. An unfilled
 * rail with a dot on it is ambiguous — it could be a slider nobody has touched. A
 * filled portion reads immediately as a value that has been set, and in blue it reads
 * as a control rather than a progress bar. The accent is 3.39:1 against the panel,
 * under the 4.5:1 it would need to carry text but comfortably over the 3:1 required
 * of a graphic, which is all it is being asked to be.
 */
const rules = [
  { label: "Profit target", fill: "w-[62%]", marker: "left-[62%]" },
  { label: "Daily loss cap", fill: "w-[34%]", marker: "left-[34%]" },
  { label: "Max drawdown", fill: "w-[47%]", marker: "left-[47%]" },
  { label: "Trading days", fill: "w-[78%]", marker: "left-[78%]" },
];

export function Audience() {
  return (
    <section
      aria-labelledby="audience-heading"
      className="border-y border-line-subtle bg-surface"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.88fr)] lg:items-start lg:gap-14">
          <div className="fx-reveal">
            <h2
              id="audience-heading"
              className="max-w-[20ch] text-3xl sm:text-4xl lg:text-5xl"
            >
              If you have an evaluation booked, this was built for you.
            </h2>

            <div className="mt-8 max-w-[60ch] space-y-5 text-lg leading-relaxed text-fg-secondary">
              <p>
                What fails most candidates is not a bad entry. It is a drawdown
                limit that does not care how right you were an hour ago, and a
                daily loss cap that ends the session while you are still certain
                the trade is coming back.
              </p>
              <p>
                You cannot rehearse that on an account with no consequences, and
                you cannot learn it from other people&rsquo;s winning screenshots.
                You learn it by sitting through the session again and making the
                call again.
              </p>
            </div>

            {/* The closing line is the argument in one sentence, so it stops being
                a fourth paragraph. Two columns of flat prose facing a panel was the
                part of this page that still read as a document. */}
            <p className="mt-7 max-w-[60ch] rounded-r-lg border-l-2 border-accent bg-surface-raised py-4 pl-5 pr-5 text-lg font-semibold leading-relaxed text-fg-primary">
              Practise until the rules feel boring. Then pay the fee.
            </p>
          </div>

          <Panel
            className="fx-reveal fx-reveal-2"
            surface="raised"
            bar={
              <span className="font-mono text-sm text-fg-muted">
                Evaluation rules
              </span>
            }
          >
            <p className="border-b border-line-subtle px-4 py-2 text-xs italic text-fg-muted">
              Configured per firm
            </p>

            <div className="px-4">
              {rules.map((rule, index) => (
                <div
                  key={rule.label}
                  className={`flex items-center gap-4 py-4 ${
                    index > 0 ? "border-t border-line-subtle" : ""
                  }`}
                >
                  <span className="w-[7.5rem] shrink-0 text-sm text-fg-secondary">
                    {rule.label}
                  </span>

                  {/* Decorative. The label and the dash carry every bit of the
                      meaning; the track is what makes the dash look chosen. */}
                  <span
                    aria-hidden="true"
                    className="relative h-[3px] min-w-10 flex-1 rounded-full bg-line-default"
                  >
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full bg-accent ${rule.fill}`}
                    />
                    {/* The ring punches a gap in the track so the dot reads as a
                        handle sitting on the rail rather than a bead threaded
                        through it. */}
                    <span
                      className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-primary ring-2 ring-surface-raised ${rule.marker}`}
                    />
                  </span>

                  <span className="tabular shrink-0 text-sm text-fg-muted">
                    &mdash;
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
