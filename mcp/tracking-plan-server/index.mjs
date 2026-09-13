#!/usr/bin/env node
/**
 * Tracking plan MCP server.
 *
 * Makes the analytics contract queryable, so an agent about to instrument something
 * can ASK what an event requires instead of inventing one. Event-name drift is the
 * largest single source of dirty analytics data, and it happens because the contract
 * lives in a file nobody reads at the moment they need it.
 *
 * SOURCE OF TRUTH: this server imports `src/lib/analytics/tracking-plan.ts` directly.
 * It does not hold a copy, a summary, or a generated snapshot of the plan. The app,
 * the runtime validator and these tools all read the same module, so the three cannot
 * disagree — and `validate_event_payload` runs the application's own `validateEvent`
 * rather than reimplementing it.
 *
 * The TypeScript is loaded with Node's `--experimental-transform-types`. Plain type
 * stripping is not enough: `TrackingPlanViolation` uses constructor parameter
 * properties, which have to be transformed rather than erased.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const trackingPlanPath = resolve(here, "../../src/lib/analytics/tracking-plan.ts");

const { trackingPlan, contextSchema, validateEvent } = await import(
  pathToFileURL(trackingPlanPath).href
);

const eventNames = Object.keys(trackingPlan);

/* -------------------------------------------------------------------------- */
/* Schema introspection                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Unwraps a Zod field into something an agent can act on.
 *
 * Reports the base type, the enum members where the value is a closed set, and
 * whether null is allowed. The enum members are the important part: they are exactly
 * the values an agent would otherwise guess at, and guessing produces a payload the
 * validator rejects at runtime.
 */
function describeField(schema) {
  let def = schema?._zod?.def ?? schema?._def ?? {};
  let nullable = false;
  let optional = false;

  // Unwrap nullable/optional wrappers to reach the underlying type.
  while (def.type === "nullable" || def.type === "optional") {
    if (def.type === "nullable") nullable = true;
    if (def.type === "optional") optional = true;
    const inner = def.innerType;
    def = inner?._zod?.def ?? inner?._def ?? {};
  }

  const description = { type: def.type ?? "unknown" };
  if (nullable) description.nullable = true;
  if (optional) description.optional = true;

  if (def.type === "enum" && def.entries) {
    description.enum = Object.keys(def.entries);
  }

  // Surface the numeric constraints the plan actually relies on, so an agent knows
  // that `hold_candles: 0` is a violation before it ships one.
  if (def.type === "number" && Array.isArray(def.checks)) {
    const constraints = def.checks
      .map((check) => check?._zod?.def ?? check?._def ?? {})
      .map((c) => c.check ?? c.kind)
      .filter(Boolean);
    if (constraints.length > 0) description.constraints = constraints;
  }

  return description;
}

function describeObject(objectSchema) {
  const shape = objectSchema?.shape ?? {};
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [key, describeField(value)]),
  );
}

function unknownEventError(eventName) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: `Unknown event: "${eventName}".`,
            hint:
              "Events are never invented. If this event genuinely does not exist, " +
              "stop and ask a human to add it to the tracking plan first.",
            valid_events: eventNames,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function json(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

const server = new McpServer({
  name: "tracking-plan",
  version: "1.0.0",
});

server.registerTool(
  "list_events",
  {
    title: "List declared analytics events",
    description:
      "Every event declared in the tracking plan, with its description, the trigger " +
      "that fires it, and whether it may be emitted from the client or the server. " +
      "Call this first when you are unsure which event covers a behaviour.",
    inputSchema: {
      emitted_from: z
        .enum(["client", "server"])
        .optional()
        .describe("Optional filter: only events emitted from this side."),
    },
  },
  async ({ emitted_from }) => {
    const events = eventNames
      .filter((name) => !emitted_from || trackingPlan[name].emittedFrom === emitted_from)
      .map((name) => ({
        event: name,
        description: trackingPlan[name].description,
        trigger: trackingPlan[name].trigger,
        emittedFrom: trackingPlan[name].emittedFrom,
      }));

    return json({ count: events.length, events });
  },
);

server.registerTool(
  "get_event_schema",
  {
    title: "Get the full schema for one event",
    description:
      "The exact properties one event requires, with types and enum members, plus " +
      "the shared context every event carries. Call this BEFORE writing any capture " +
      "call. An unknown name returns the list of valid names, never a guess.",
    inputSchema: {
      event_name: z.string().describe("Exact event name, e.g. 'trade_closed'."),
    },
  },
  async ({ event_name }) => {
    const definition = trackingPlan[event_name];
    if (!definition) return unknownEventError(event_name);

    return json({
      event: event_name,
      description: definition.description,
      trigger: definition.trigger,
      emittedFrom: definition.emittedFrom,
      properties: describeObject(definition.properties),
      shared_context: describeObject(contextSchema),
      notes: [
        "The properties schema is strict: an undeclared property is a validation error.",
        `This event may only be emitted from the ${definition.emittedFrom}.`,
        "Shared context is attached automatically by buildContext(); do not pass it by hand.",
      ],
    });
  },
);

server.registerTool(
  "validate_event_payload",
  {
    title: "Validate a candidate payload against the plan",
    description:
      "Runs the application's own validateEvent against a payload and reports pass " +
      "or fail with the specific violation. This is the same function the app calls " +
      "at the emit boundary, so a payload that passes here passes at runtime.",
    inputSchema: {
      event_name: z.string().describe("Exact event name."),
      properties: z
        .record(z.string(), z.unknown())
        .describe("The candidate properties object."),
      emitted_from: z
        .enum(["client", "server"])
        .describe("Where the payload would be emitted from."),
      context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Optional shared context. Omit it and a valid placeholder is supplied, so " +
          "the result reflects your properties rather than a context you invented.",
        ),
    },
  },
  async ({ event_name, properties, emitted_from, context }) => {
    if (!trackingPlan[event_name]) return unknownEventError(event_name);

    // A stand-in that satisfies contextSchema, so the caller is told about problems
    // in the payload they asked about rather than about a context they did not send.
    const placeholderContext = {
      variant: "control",
      flag_resolved: true,
      event_id: "00000000-0000-4000-8000-000000000000",
      session_id: "mcp-validation",
      device_type: "desktop",
    };

    try {
      const validated = validateEvent(
        event_name,
        properties,
        context ?? placeholderContext,
        emitted_from,
      );
      return json({
        valid: true,
        event: event_name,
        emitted_from,
        validated_properties: validated.properties,
      });
    } catch (error) {
      return json({
        valid: false,
        event: event_name,
        emitted_from,
        violation: error?.message ?? String(error),
        detail: error?.detail ?? null,
      });
    }
  },
);

await server.connect(new StdioServerTransport());
