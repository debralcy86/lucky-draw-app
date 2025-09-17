-- sql/draw_schema.sql

-- 1) Draws (each draw has a scheduled time and lifecycle status)
create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  code text unique,                                -- optional human code like 2025-09-09-2000
  status text not null default 'open'               -- open | closed | executed
    check (status in ('open','closed','executed')),
  scheduled_at timestamptz not null,               -- when the draw is supposed to run
  closed_at timestamptz,                            -- when entries stop
  executed_at timestamptz,                          -- when winner is picked & payouts applied
  winning_figure int,                               -- 1..36 when executed
  created_at timestamptz not null default now()
);

-- 2) Bets (entries) — simple per-user figure choice & stake
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  draw_id uuid not null references public.draws(id) on delete cascade,
  figure int not null check (figure between 1 and 36),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_draws_status_sched on public.draws(status, scheduled_at);
create index if not exists idx_bets_draw on public.bets(draw_id);
create index if not exists idx_bets_user on public.bets(user_id);

-- (Optional) RLS — enable reads only for own bets; draws are public-readable
alter table public.draws enable row level security;
alter table public.bets  enable row level security;

-- Public can read draws
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='draws' and policyname='draws_read_all'
  ) then
    create policy draws_read_all on public.draws
      for select using (true);
  end if;
end$$;

-- Bets: user can read only their own rows.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bets' and policyname='bets_select_own'
  ) then
    create policy bets_select_own on public.bets
      for select using (user_id = auth.uid());
  end if;
end$$;

-- Note: Inserts/updates for bets/draws will be performed by the server (service role),
-- so we do not open write policies to the public for now.

