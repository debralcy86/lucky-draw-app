-- Enable RLS and add basic read policies for wallets and wallet_txns
-- Adjust to your auth model. Assumes user_id matches auth.uid().

-- Wallets
alter table if exists wallets enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'wallets' and policyname = 'Read own wallet'
  ) then
    create policy "Read own wallet" on public.wallets
      for select
      using ( user_id = auth.uid() );
  end if;
end $$;

-- Wallet transactions
alter table if exists wallet_txns enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'wallet_txns' and policyname = 'Read own txns'
  ) then
    create policy "Read own txns" on public.wallet_txns
      for select
      using ( user_id = auth.uid() );
  end if;
end $$;

-- Note: writes are intentionally not allowed here; server uses service role.

