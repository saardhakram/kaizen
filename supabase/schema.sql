-- Kaizen database schema
-- Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- Safe to run more than once.

-- ─────────── Habits ───────────
create table if not exists public.habits (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  emoji       text not null default '✅',
  kind        text not null check (kind in ('build', 'quit')),
  hue         integer not null default 200 check (hue between 0 and 360),
  days        integer[] not null default '{0,1,2,3,4,5,6}',   -- 0 = Sunday ... 6 = Saturday
  start_date  date not null default current_date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists habits_user_idx on public.habits (user_id);

-- ─────────── Daily check-ins ───────────
-- One row per habit per day. No row means "not logged".
create table if not exists public.logs (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid not null,
  day         date not null,
  status      text not null check (status in ('done', 'partial', 'missed', 'skip')),
  reason      text check (reason is null or char_length(reason) <= 1000),
  tags        text[] not null default '{}',     -- reason categories, main reason first
  manual      text[] not null default '{}',     -- categories you picked by hand
  updated_at  timestamptz not null default now(),
  primary key (habit_id, day),
  -- a log can only point at a habit owned by the same person
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index if not exists logs_user_day_idx on public.logs (user_id, day);

-- ─────────── Settings (one row per person) ───────────
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme       text not null default 'auto' check (theme in ('auto', 'dark', 'light')),
  day_ends    integer not null default 3 check (day_ends between 0 and 6),
  cats        jsonb not null default '[]',      -- reason categories and their keywords
  focus       jsonb not null default '{}',      -- focus areas picked in each monthly review
  updated_at  timestamptz not null default now()
);

-- ─────────── Row-level security: everyone sees only their own rows ───────────
alter table public.habits        enable row level security;
alter table public.logs          enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "own habits"   on public.habits;
drop policy if exists "own logs"     on public.logs;
drop policy if exists "own settings" on public.user_settings;

create policy "own habits"   on public.habits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own logs"     on public.logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Signed-in users get table access (row-level security above still limits them to their own rows).
-- Signed-out visitors get none.
grant select, insert, update, delete on public.habits, public.logs, public.user_settings to authenticated;
