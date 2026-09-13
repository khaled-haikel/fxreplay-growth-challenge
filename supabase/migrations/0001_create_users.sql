-- 0001_create_users
--
-- The users table behind the signup flow.
--
-- Uniqueness on email is enforced here rather than only in the route handler. The
-- handler's check-then-insert is a read followed by a write, and two requests can
-- interleave between them; the constraint is the only thing that actually makes a
-- duplicate impossible. The handler's 409 is the good error message, not the
-- guarantee.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Emails are normalised to lowercase before they reach the database (see
-- src/lib/users/schema.ts), so a plain unique index is enough and the planner can
-- use it for lookups by email as well.
create unique index if not exists users_email_key on public.users (email);

-- The list endpoint orders by created_at descending and pages through it.
create index if not exists users_created_at_idx on public.users (created_at desc);

comment on table public.users is
  'Accounts created from the marketing signup flow. No credentials: authentication is out of scope for this build.';

-- Row level security is on with no policies granted to anon or authenticated.
-- Every access path goes through the server using the service role key, which
-- bypasses RLS. That key is server-only and never reaches the browser, so this
-- table has no client-reachable surface at all.
alter table public.users enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();
