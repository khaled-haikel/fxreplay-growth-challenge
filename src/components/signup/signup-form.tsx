/**
 * The signup form. The last step of the funnel, and the one place on this page where
 * every failure mode has to be designed rather than defaulted.
 *
 * IDENTITY. `identifyUser` runs only after a 201 comes back. Identifying earlier —
 * on submit, on blur, anywhere optimistic — would merge an anonymous visitor into an
 * account for a conversion that might then fail, and PostHog has no undo for that.
 *
 * `account_created` is NOT emitted here. It is server-only in the tracking plan, and
 * `validateEvent` would throw if this file tried (invariant 2).
 */

"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { buildContext } from "@/lib/analytics/context";
import { getDistinctId, identifyUser, track } from "@/lib/analytics/client";
import {
  readSessionProgress,
  type SessionProgress,
} from "@/lib/replay/session-state";
import type { ApiErrorBody } from "@/lib/users/api-contract";
import { emailSchema, nameSchema, type User } from "@/lib/users/schema";

type EntryPoint = "hero" | "post_trade" | "features" | "footer" | "nav";
type Status = "idle" | "submitting" | "success";

interface FieldErrors {
  name?: string;
  email?: string;
}

export function SignupForm({ entryPoint }: { entryPoint: EntryPoint }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** Anything that is not a field problem: server, network, or a duplicate. */
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [account, setAccount] = useState<User | null>(null);
  /**
   * Only the success screen reads this, and it is filled in from the submit handler
   * where the value is already needed. Seeding it from an effect on mount would be
   * a synchronous setState in an effect — a cascading render for a value nothing on
   * the idle form displays. Reading `sessionStorage` during render instead would
   * disagree with the server pass and break hydration.
   */
  const [progress, setProgress] = useState<SessionProgress>({
    tradeCount: 0,
    elapsedMs: null,
  });

  const startedRef = useRef(false);

  /** `signup_started` fires on the first real keystroke, once per mount. */
  function markStarted(): void {
    if (startedRef.current) return;
    startedRef.current = true;

    track("signup_started", {
      entry_point: entryPoint,
      had_traded: readSessionProgress().tradeCount > 0,
    });
  }

  function validate(field: "name" | "email", value: string): string | undefined {
    const schema = field === "name" ? nameSchema : emailSchema;
    const result = schema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  }

  function handleBlur(field: "name" | "email", value: string): void {
    setFieldErrors((current) => ({ ...current, [field]: validate(field, value) }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The button is disabled while submitting, but a form can also be submitted with
    // Enter, so the guard is here rather than only on the control.
    if (status === "submitting") return;

    setFormError(null);

    const nextErrors: FieldErrors = {
      name: validate("name", name),
      email: validate("email", email),
    };

    if (nextErrors.name || nextErrors.email) {
      setFieldErrors(nextErrors);
      track("signup_failed", {
        reason: "validation",
        field: nextErrors.name ? "name" : "email",
        status_code: null,
      });
      return;
    }

    setFieldErrors({});
    setStatus("submitting");

    const current = readSessionProgress();

    let response: Response;
    try {
      response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          // The server cannot derive any of this: no cookie, no viewport, no flags.
          analytics: {
            distinctId: getDistinctId() ?? "anonymous",
            context: buildContext(),
            entry_point: entryPoint,
            trades_before_signup: current.tradeCount,
            time_to_signup_ms: current.elapsedMs,
          },
        }),
      });
    } catch {
      setStatus("idle");
      setFormError(
        "We could not reach the server. Check your connection and try again.",
      );
      track("signup_failed", {
        reason: "network",
        field: null,
        status_code: null,
      });
      return;
    }

    if (!response.ok) {
      setStatus("idle");

      let body: ApiErrorBody | null = null;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = null;
      }

      if (response.status === 409) {
        setFieldErrors({ email: "This email is already registered" });
        setFormError(
          "You already have an account with that email. Try signing in instead.",
        );
        track("signup_failed", {
          reason: "duplicate_email",
          field: "email",
          status_code: 409,
        });
        return;
      }

      if (response.status === 400) {
        const fields = body?.error.fields ?? [];
        setFieldErrors(
          Object.fromEntries(fields.map((f) => [f.field, f.reason])) as FieldErrors,
        );
        setFormError(body?.error.message ?? "Some details need fixing.");
        track("signup_failed", {
          reason: "validation",
          field: fields[0]?.field ?? null,
          status_code: 400,
        });
        return;
      }

      setFormError(
        body?.error.message ?? "Something went wrong on our end. Please try again.",
      );
      track("signup_failed", {
        reason: "server_error",
        field: null,
        status_code: response.status,
      });
      return;
    }

    const { data } = (await response.json()) as { data: User };

    // Only now. The account exists, so the anonymous visitor and this user are
    // genuinely the same person, and the funnel can close.
    identifyUser(data.id, { email: data.email, name: data.name });

    setAccount(data);
    setProgress(current);
    setStatus("success");
  }

  if (status === "success" && account) {
    return <SuccessPanel account={account} progress={progress} />;
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field
        id="signup-name"
        label="Name"
        type="text"
        autoComplete="name"
        value={name}
        error={fieldErrors.name}
        disabled={submitting}
        onChange={(value) => {
          markStarted();
          setName(value);
        }}
        onBlur={() => handleBlur("name", name)}
      />

      <Field
        id="signup-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        error={fieldErrors.email}
        disabled={submitting}
        onChange={(value) => {
          markStarted();
          setEmail(value);
        }}
        onBlur={() => handleBlur("email", email)}
      />

      {/* Form-level failures are announced. A visitor who submitted with the
          keyboard may never look back up at the top of the form. */}
      <div aria-live="polite" className="min-h-0">
        {formError && (
          <p className="rounded-lg border border-market-down bg-surface-raised px-4 py-3 text-sm text-fg-primary">
            {formError}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-bold text-fg-on-accent transition-colors duration-150 ease-out hover:bg-accent-pressed disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Creating your account…" : "Create my account"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        No card required. Free forever.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  type: "text" | "email";
  autoComplete: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-fg-secondary">
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-2 block w-full rounded-lg border bg-surface-raised px-4 py-3 text-base text-fg-primary placeholder:text-fg-muted disabled:opacity-60 ${
          error ? "border-market-down" : "border-line-default"
        }`}
      />

      {/* The region is always present so a screen reader is already watching it
          when the message appears, rather than being handed a new live region. */}
      <p id={errorId} aria-live="polite" className="mt-2 text-sm text-market-down">
        {error}
      </p>
    </div>
  );
}

/**
 * The conversion moment, given a screen rather than a toast.
 *
 * If the visitor traded in the replay, the copy says so. That is the whole argument
 * of this page closing: they did not read that the product works, they used it, and
 * the account they just made is where that continues.
 */
function SuccessPanel({
  account,
  progress,
}: {
  account: User;
  progress: SessionProgress;
}) {
  const traded = progress.tradeCount > 0;

  return (
    <div className="text-center">
      <p className="font-mono text-xs text-accent-bright">Account created</p>

      <h2 className="mt-4 text-3xl">
        You&rsquo;re in, {account.name.split(" ")[0]}.
      </h2>

      {traded ? (
        <p className="mx-auto mt-4 max-w-[46ch] text-lg leading-relaxed text-fg-secondary">
          You closed{" "}
          <span className="tabular font-semibold text-fg-primary">
            {progress.tradeCount}
          </span>{" "}
          {progress.tradeCount === 1 ? "trade" : "trades"} before signing up. Your
          full session picks up where the hero left off. Same data, same rules, no
          time limit.
        </p>
      ) : (
        <p className="mx-auto mt-4 max-w-[46ch] text-lg leading-relaxed text-fg-secondary">
          Your workspace is ready. Load a session, set the rules your firm uses, and
          take the first trade with nothing riding on it.
        </p>
      )}

      <dl className="mx-auto mt-8 max-w-xs space-y-2 rounded-xl border border-line-default bg-surface-raised px-5 py-4 text-left text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Name</dt>
          <dd className="text-fg-primary">{account.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Email</dt>
          <dd className="truncate text-fg-primary">{account.email}</dd>
        </div>
        {traded && (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-fg-muted">Trades this session</dt>
            <dd className="tabular text-fg-primary">{progress.tradeCount}</dd>
          </div>
        )}
      </dl>

      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-bold text-fg-on-accent transition-colors duration-150 ease-out hover:bg-accent-pressed"
      >
        Back to the replay
      </Link>
    </div>
  );
}
