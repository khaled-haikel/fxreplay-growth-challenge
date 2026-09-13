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

/** Called once, when the replay first advances. */
export function recordReplayStart(): void {
  if (safeRead(STARTED_AT_KEY)) return;
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
 */
export function readSessionProgress(): SessionProgress {
  const rawCount = Number(safeRead(TRADE_COUNT_KEY));
  const rawStart = Number(safeRead(STARTED_AT_KEY));

  const tradeCount =
    Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;

  const elapsedMs =
    Number.isFinite(rawStart) && rawStart > 0
      ? Math.max(0, Date.now() - rawStart)
      : null;

  return { tradeCount, elapsedMs };
}
