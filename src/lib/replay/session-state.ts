/**
 * What the replay leaves behind for the signup page.
 *
 * PRESENTATION STATE, not analytics. Nothing here emits an event. It exists so the
 * success screen can say "you closed three trades" instead of something generic, and
 * so `account_created` can carry a real `trades_before_signup` rather than a zero
 * the server had no way to know was wrong.
 *
 * The keys live in one module because two files read them. A string literal copied
 * into both is a bug waiting for the day one of them is renamed.
 *
 * sessionStorage rather than localStorage on purpose: this is one visit's progress.
 * A visitor who comes back next week has not just finished a replay, and telling
 * them they did would be a lie the page tells confidently.
 */

const TRADE_COUNT_KEY = "fxr_trade_count";
const STARTED_AT_KEY = "fxr_replay_started_at";

/**
 * How long a single visit is allowed to be before its start stamp stops meaning
 * anything.
 *
 * `sessionStorage` lives as long as the tab, not as long as the visit. A tab left
 * open overnight and returned to in the morning still holds the stamp from the night
 * before, and the difference is tab age rather than time to signup. That is not
 * hypothetical: a real conversion went out carrying 10,898,590ms — just over three
 * hours — for a journey that took about two minutes.
 *
 * Two hours is well beyond any genuine landing-page session and well short of the
 * overnight case that produces the nonsense.
 */
const MAX_JOURNEY_MS = 2 * 60 * 60 * 1000;

/** Every access is guarded: private browsing and some webviews throw on storage. */
function safeWrite(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // A page that cannot remember the trade count still works. Losing this is a
    // slightly less personal success screen, not a broken signup.
  }
}

function safeRead(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Called when the replay first advances.
 *
 * Keeps an existing stamp so the measurement spans the whole visit rather than
 * restarting on every replay — but replaces one that is older than a plausible
 * visit, which is what makes a long-lived tab start a fresh journey cleanly
 * instead of inheriting yesterday's clock.
 */
export function recordReplayStart(): void {
  const existing = Number(safeRead(STARTED_AT_KEY));
  const isUsable =
    Number.isFinite(existing) &&
    existing > 0 &&
    Date.now() - existing <= MAX_JOURNEY_MS;

  if (isUsable) return;
  safeWrite(STARTED_AT_KEY, String(Date.now()));
}

/** Called on every close, with the session's running total. */
export function recordTradeCount(count: number): void {
  safeWrite(TRADE_COUNT_KEY, String(count));
}

export interface SessionProgress {
  tradeCount: number;
  /** Time from the first replay advance to now, or null if the replay never ran. */
  elapsedMs: number | null;
}

/**
 * Read at signup. Elapsed is computed here rather than stored, so it measures the
 * distance to the moment the account is created rather than to the last trade.
 *
 * An elapsed time beyond `MAX_JOURNEY_MS` is reported as `null`, not as the number.
 * `time_to_signup_ms` is nullable in the tracking plan precisely so that "we do not
 * know" is expressible, and an honest null is worth more than a confident three-hour
 * figure sitting on the primary conversion event and quietly skewing every median
 * computed from it.
 */
export function readSessionProgress(): SessionProgress {
  const rawCount = Number(safeRead(TRADE_COUNT_KEY));
  const rawStart = Number(safeRead(STARTED_AT_KEY));

  const tradeCount =
    Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;

  let elapsedMs: number | null = null;
  if (Number.isFinite(rawStart) && rawStart > 0) {
    const candidate = Math.max(0, Date.now() - rawStart);
    elapsedMs = candidate <= MAX_JOURNEY_MS ? candidate : null;
  }

  return { tradeCount, elapsedMs };
}
