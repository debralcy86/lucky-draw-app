-- sql/wallet_schema.sql
create extension if not exists pgcrypto;

create table if not exists public.wallets (
  user_id text primary key,
  balance numeric(18,2) not null default 0 check (balance >= 0)
);

create table if not exists public.wallet_txns (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.wallets(user_id) on delete cascade,
  type text not null check (type in ('credit','debit')),
  amount numeric(18,2) not null check (amount <> 0),
  balance_after numeric(18,2) not null check (balance_after >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_txns_user_created
  on public.wallet_txns(user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_txns enable row level security;

