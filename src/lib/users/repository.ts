/**
 * User persistence, behind a port.
 *
 * The interface is the point. The route handlers talk to `UserRepository` and never
 * to Postgres, so the storage decision stays reversible and the API can be tested
 * without a database anywhere near it.
 *
 * The in-memory adapter is the DEFAULT, not the fallback. A reviewer clones this
 * repository, runs `npm run dev`, and the signup flow works end to end with no
 * account, no keys and no migration. Requiring a Postgres instance to look at a
 * landing page is a tax on exactly the person whose time matters most here.
 *
 * SERVER ONLY. This module reads the Supabase service role key, which is the
 * credential that bypasses row level security. It must never reach the browser
 * (invariant 5 in CLAUDE.md), so it guards its own import rather than trusting
 * every future call site to remember.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CreateUserInput, UpdateUserInput, User } from "./schema";

if (typeof window !== "undefined") {
  throw new Error(
    "[users/repository] imported in the browser. This module reads the Supabase " +
      "service role key and is server-only.",
  );
}

export interface ListOptions {
  limit: number;
  offset: number;
}

export interface ListResult {
  users: User[];
  total: number;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(options: ListOptions): Promise<ListResult>;
}

/* -------------------------------------------------------------------------- */
/* In-memory adapter                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Module-level state, which means it survives requests within one server process
 * and dies with it. That is the correct lifetime for a demo: data that persists
 * across a reload but never becomes something anyone mistakes for a real database.
 */
const store = new Map<string, User>();

function createInMemoryRepository(): UserRepository {
  return {
    async create(input) {
      const now = new Date().toISOString();
      const user: User = {
        id: crypto.randomUUID(),
        email: input.email,
        name: input.name,
        createdAt: now,
        updatedAt: now,
      };
      store.set(user.id, user);
      return user;
    },

    async update(id, input) {
      const existing = store.get(id);
      if (!existing) return null;

      const updated: User = {
        ...existing,
        ...input,
        updatedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },

    async findByEmail(email) {
      for (const user of store.values()) {
        if (user.email === email) return user;
      }
      return null;
    },

    async list({ limit, offset }) {
      // Newest first, which is the only ordering anyone wants from a signup list.
      const all = [...store.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      return { users: all.slice(offset, offset + limit), total: all.length };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Supabase adapter                                                           */
/* -------------------------------------------------------------------------- */

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSupabaseRepository(client: SupabaseClient): UserRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from("users")
        .insert({ email: input.email, name: input.name })
        .select()
        .single();

      if (error) throw new Error(`[users/supabase] create failed: ${error.message}`);
      return toUser(data as UserRow);
    },

    async update(id, input) {
      const { data, error } = await client
        .from("users")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw new Error(`[users/supabase] update failed: ${error.message}`);
      return data ? toUser(data as UserRow) : null;
    },

    async findByEmail(email) {
      const { data, error } = await client
        .from("users")
        .select()
        .eq("email", email)
        .maybeSingle();

      if (error) throw new Error(`[users/supabase] lookup failed: ${error.message}`);
      return data ? toUser(data as UserRow) : null;
    },

    async list({ limit, offset }) {
      const { data, error, count } = await client
        .from("users")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(`[users/supabase] list failed: ${error.message}`);
      return {
        users: (data as UserRow[]).map(toUser),
        total: count ?? 0,
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Chosen once, at module load.
 *
 * Deciding per request would mean a process that silently changes storage backend
 * halfway through its life if an environment variable were mutated, and would hide
 * a misconfiguration until the first write instead of surfacing it at boot.
 *
 * Note the variable names: no `NEXT_PUBLIC_` prefix, so Next will not inline either
 * of them into a client bundle even by accident.
 */
function selectRepository(): { repository: UserRepository; adapter: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceRoleKey) {
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
    return { repository: createSupabaseRepository(client), adapter: "supabase" };
  }

  return { repository: createInMemoryRepository(), adapter: "in-memory" };
}

const selected = selectRepository();

if (process.env.NODE_ENV === "development") {
  console.info(
    `[users] storage adapter: ${selected.adapter}` +
      (selected.adapter === "in-memory"
        ? " (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Postgres)"
        : ""),
  );
}

export const userRepository = selected.repository;
export const activeAdapter = selected.adapter;
