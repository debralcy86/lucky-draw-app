-- Optional if not already enabled
create extension if not exists pgcrypto;

-- Your withdraw schema (restate for clarity)
create table if not exists public.withdraw_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.wallets(user_id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_withdraw_user_created
  on public.withdraw_requests(user_id, created_at desc);

-- (RLS is OK to keep if you ever use anon; server uses service key anyway)
alter table public.withdraw_requests enable row level security;

drop policy if exists withdraw_select_own on public.withdraw_requests;
create policy withdraw_select_own
  on public.withdraw_requests
  for select
  using (user_id = auth.uid());

drop policy if exists withdraw_insert_self on public.withdraw_requests;
create policy withdraw_insert_self
  on public.withdraw_requests
  for insert
  with check (user_id = auth.uid());
