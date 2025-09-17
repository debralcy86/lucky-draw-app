-- 1) Ensure columns + sane defaults
alter table if exists public.withdraw_requests
  alter column status set default 'pending',
  alter column created_at set default now();

-- 2) Status guard (only these 3 states)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'withdraw_requests_status_check'
  ) then
    alter table public.withdraw_requests
      add constraint withdraw_requests_status_check
      check (status in ('pending','approved','rejected'));
  end if;
end$$;

-- 3) Amount must be > 0
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'withdraw_requests_amount_check'
  ) then
    alter table public.withdraw_requests
      add constraint withdraw_requests_amount_check
      check (amount > 0);
  end if;
end$$;

-- 4) Helpful indexes for admin list + user history
create index if not exists idx_withdraw_requests_status_created_at
  on public.withdraw_requests (status, created_at desc);

do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from pg_class t
    join pg_index i       on i.indrelid = t.oid
    join pg_class ix      on ix.oid = i.indexrelid
    join pg_attribute a1  on a1.attrelid = t.oid and a1.attnum = i.indkey[0]
    join pg_attribute a2  on a2.attrelid = t.oid and a2.attnum = i.indkey[1]
    where t.relname = 'withdraw_requests'
      and i.indnatts >= 2
      and a1.attname = 'user_id'
      and a2.attname = 'created_at'
  ) into v_exists;

  if not v_exists then
    execute $sql$
      create index idx_withdraw_requests_user_created_at
      on public.withdraw_requests (user_id, created_at desc);
    $sql$;
  end if;
end$$;

-- 5) (Optional) tighten note length to avoid abuse (comment out if not desired)
-- alter table public.withdraw_requests
--   add column if not exists note varchar(500);

-- 6) (Optional) FK to wallets (logical link; service role bypasses RLS anyway)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'withdraw_requests_user_fk'
  ) then
    alter table public.withdraw_requests
      add constraint withdraw_requests_user_fk
      foreign key (user_id) references public.wallets(user_id)
      on update cascade on delete restrict;
  end if;
end$$;
