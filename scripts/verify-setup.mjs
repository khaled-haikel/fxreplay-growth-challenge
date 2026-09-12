#!/usr/bin/env node
/**
 * Setup verifier for the FX Replay growth challenge.
 *
 * Standalone: no build step, no dependencies, Node built-ins only. Run with
 * `npm run verify`. Prints a PASS/FAIL line per check and exits 1 if any check
 * failed. Skipped checks are reported but do not fail the run.
 *
 * It deliberately does NOT send an event to PostHog. Every event must exist in
 * `src/lib/analytics/tracking-plan.ts` (invariant 1 in CLAUDE.md), and a synthetic
 * event would pollute the project's analytics data.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = '.env.local';
const NETWORK_TIMEOUT_MS = 5000;

const PASS = 'PASS';
const FAIL = 'FAIL';
const SKIP = 'SKIPPED';

/** @type {{ status: string, title: string, detail: string }[]} */
const results = [];

function record(status, title, detail) {
  results.push({ status, title, detail });
}

function readIfPresent(relPath) {
  const abs = join(REPO_ROOT, relPath);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Minimal dotenv-style parser. Handles `KEY=value`, an optional `export ` prefix,
 * `#` comments, surrounding quotes, and CRLF line endings. Intentionally small --
 * adding `dotenv` as a dependency is out of scope.
 */
function parseEnv(source) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    env[key] = rawValue.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return env;
}

/** Translates one .gitignore pattern into a regex tested against a repo-relative path. */
function patternToRegExp(pattern) {
  const body = pattern
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<globstar>')
    .replace(/\*/g, '[^/]*')
    .replace(/<globstar>/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${body}$`);
}

/**
 * Asks git whether the path is ignored -- that is the authoritative answer, since git
 * applies the full pattern semantics. Falls back to matching .gitignore patterns by
 * hand when git is unavailable or this is not a repository.
 */
function isIgnored(relPath) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return { ignored: true, source: 'git check-ignore' };
  } catch (error) {
    if (error && error.status === 1) {
      return { ignored: false, source: 'git check-ignore' };
    }
    // git missing, or not a repository: fall through to the manual matcher.
  }

  const gitignore = readIfPresent('.gitignore');
  if (gitignore === null) {
    return { ignored: false, source: 'no .gitignore found' };
  }

  let ignored = false;
  let matchedBy = null;
  for (const rawLine of gitignore.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    const pattern = negated ? line.slice(1) : line;
    if (patternToRegExp(pattern).test(relPath)) {
      ignored = !negated;
      matchedBy = line;
    }
  }
  return {
    ignored,
    source: matchedBy ? `.gitignore pattern "${matchedBy}"` : '.gitignore (no matching pattern)',
  };
}

// --- 1. .env.local exists --------------------------------------------------
const envSource = readIfPresent(ENV_FILE);
record(
  envSource === null ? FAIL : PASS,
  `${ENV_FILE} exists at the repo root`,
  envSource === null ? `not found at ${join(REPO_ROOT, ENV_FILE)}` : join(REPO_ROOT, ENV_FILE),
);

const env = envSource === null ? {} : parseEnv(envSource);

// --- 2. .env.local is gitignored -------------------------------------------
const ignoreResult = isIgnored(ENV_FILE);
record(
  ignoreResult.ignored ? PASS : FAIL,
  `${ENV_FILE} is matched by .gitignore`,
  ignoreResult.ignored
    ? `ignored, per ${ignoreResult.source}`
    : `NOT ignored, per ${ignoreResult.source} -- secrets could be committed`,
);

// --- 3. PostHog project key ------------------------------------------------
const KEY_TITLE = 'NEXT_PUBLIC_POSTHOG_KEY is present and starts with "phc_"';
const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
if (!posthogKey) {
  record(FAIL, KEY_TITLE, `not set in ${ENV_FILE}`);
} else if (!posthogKey.startsWith('phc_')) {
  record(
    FAIL,
    KEY_TITLE,
    'set, but does not start with "phc_" -- that looks like a personal or server key, not the public project key',
  );
} else {
  record(PASS, KEY_TITLE, `phc_...${posthogKey.slice(-4)} (${posthogKey.length} chars)`);
}

// --- 4. PostHog host -------------------------------------------------------
const HOST_TITLE = 'NEXT_PUBLIC_POSTHOG_HOST is present and parses as an https URL';
const posthogHostRaw = env.NEXT_PUBLIC_POSTHOG_HOST;
/** @type {URL | null} */
let posthogHost = null;
if (!posthogHostRaw) {
  record(FAIL, HOST_TITLE, `not set in ${ENV_FILE}`);
} else {
  let parsed = null;
  try {
    parsed = new URL(posthogHostRaw);
  } catch {
    parsed = null;
  }
  if (parsed === null) {
    record(FAIL, HOST_TITLE, `"${posthogHostRaw}" is not a parseable URL`);
  } else if (parsed.protocol !== 'https:') {
    record(FAIL, HOST_TITLE, `"${posthogHostRaw}" uses ${parsed.protocol}// -- must be https`);
  } else {
    posthogHost = parsed;
    record(PASS, HOST_TITLE, parsed.origin);
  }
}

// --- 5. Required source files exist ----------------------------------------
const REQUIRED_FILES = [
  'src/lib/analytics/tracking-plan.ts',
  'src/lib/analytics/context.ts',
  'src/lib/analytics/client.ts',
  'src/lib/analytics/server.ts',
  'src/app/providers.tsx',
];
const missingFiles = REQUIRED_FILES.filter((relPath) => !existsSync(join(REPO_ROOT, relPath)));
record(
  missingFiles.length === 0 ? PASS : FAIL,
  'required analytics and provider files exist',
  missingFiles.length === 0
    ? `all ${REQUIRED_FILES.length} present`
    : `missing: ${missingFiles.join(', ')}`,
);

// --- 6. Layout mounts the provider -----------------------------------------
const LAYOUT = 'src/app/layout.tsx';
const LAYOUT_TITLE = `${LAYOUT} mounts AnalyticsProvider`;
const layoutSource = readIfPresent(LAYOUT);
if (layoutSource === null) {
  record(FAIL, LAYOUT_TITLE, 'file not found');
} else {
  const hasName = layoutSource.includes('AnalyticsProvider');
  const hasClosingTag = layoutSource.includes('</AnalyticsProvider>');
  if (hasName && hasClosingTag) {
    record(PASS, LAYOUT_TITLE, 'references AnalyticsProvider and closes the element around children');
  } else {
    const missing = [
      hasName ? null : '"AnalyticsProvider"',
      hasClosingTag ? null : '"</AnalyticsProvider>"',
    ].filter(Boolean);
    record(FAIL, LAYOUT_TITLE, `missing ${missing.join(' and ')}`);
  }
}

// --- 7. Dependencies -------------------------------------------------------
const DEPS_TITLE = 'posthog-js, posthog-node and zod are in package.json dependencies';
const REQUIRED_DEPS = ['posthog-js', 'posthog-node', 'zod'];
const packageJsonSource = readIfPresent('package.json');
if (packageJsonSource === null) {
  record(FAIL, DEPS_TITLE, 'package.json not found');
} else {
  let deps = null;
  try {
    deps = JSON.parse(packageJsonSource).dependencies ?? {};
  } catch {
    deps = null;
  }
  if (deps === null) {
    record(FAIL, DEPS_TITLE, 'package.json is not valid JSON');
  } else {
    const missingDeps = REQUIRED_DEPS.filter((name) => !(name in deps));
    record(
      missingDeps.length === 0 ? PASS : FAIL,
      DEPS_TITLE,
      missingDeps.length === 0
        ? REQUIRED_DEPS.map((name) => `${name}@${deps[name]}`).join(', ')
        : `missing from dependencies: ${missingDeps.join(', ')}`,
    );
  }
}

// --- 8. Network reachability -----------------------------------------------
// A plain GET against the host origin. It confirms DNS resolution and that something
// answers over HTTPS; any status code counts as reachable. No event is sent.
const NETWORK_TITLE = 'configured PostHog host is reachable over the network';
if (posthogHost === null) {
  record(FAIL, NETWORK_TITLE, 'no valid host configured -- see the NEXT_PUBLIC_POSTHOG_HOST check above');
} else {
  const target = new URL('/', posthogHost);
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: '*/*' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    record(
      PASS,
      NETWORK_TITLE,
      `GET ${target.href} responded ${response.status} ${response.statusText || ''}`.trim() +
        ` in ${Date.now() - startedAt}ms`,
    );
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const code = error?.cause?.code ?? error?.code;
    record(
      FAIL,
      NETWORK_TITLE,
      timedOut
        ? `GET ${target.href} timed out after ${NETWORK_TIMEOUT_MS}ms`
        : `GET ${target.href} failed: ${code ?? error?.message ?? 'unknown error'}`,
    );
  }
}

// --- 9 & 10. Optional PostHog API checks, deliberately not attempted -------
// Validating the key against PostHog and asserting the "hero-interactive-replay" flag
// exists both need a specific public API endpoint and request shape. Guessing one
// would produce a check that fails for the wrong reason, so they are reported as
// skipped rather than approximated.
const SKIP_REASON =
  'the current PostHog public endpoint and request shape were not confirmed; guessing one would make the check unreliable. Verify in the PostHog UI.';
record(SKIP, 'PostHog accepts the project API key', SKIP_REASON);
record(SKIP, 'feature flag "hero-interactive-replay" exists', SKIP_REASON);

// --- Report ----------------------------------------------------------------
const counts = { [PASS]: 0, [FAIL]: 0, [SKIP]: 0 };

console.log('');
console.log('Setup verification');
console.log(`  repo root: ${REPO_ROOT}`);
console.log('');

results.forEach((result, index) => {
  counts[result.status] += 1;
  console.log(`[ ${result.status.padEnd(7)} ] ${String(index + 1).padStart(2)}. ${result.title}`);
  if (result.detail) console.log(`               ${result.detail}`);
});

console.log('');
console.log(`${counts[PASS]} passed, ${counts[FAIL]} failed, ${counts[SKIP]} skipped`);

if (counts[FAIL] > 0) {
  console.log('');
  console.log('Setup is incomplete. Fix the failures above, then run `npm run verify` again.');
  process.exit(1);
}

console.log('Setup looks good.');
