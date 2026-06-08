create extension if not exists pgcrypto;

create table if not exists public.loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null default '',
  bonus_balance integer not null default 0 check (bonus_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
  sale_id text,
  type text not null check (type in ('accrual', 'redemption')),
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists loyalty_customers_phone_idx on public.loyalty_customers(phone);
create index if not exists loyalty_transactions_customer_created_idx on public.loyalty_transactions(customer_id, created_at desc);

create or replace function public.loyalty_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loyalty_customers_updated_at on public.loyalty_customers;
create trigger loyalty_customers_updated_at
before update on public.loyalty_customers
for each row execute function public.loyalty_set_updated_at();

create or replace function public.loyalty_accrue(
  p_phone text,
  p_name text,
  p_sale_id text,
  p_sale_amount integer,
  p_percent numeric,
  p_comment text default ''
)
returns table (
  customer_id uuid,
  phone text,
  name text,
  bonus_balance integer,
  transaction_id uuid,
  transaction_amount integer
)
language plpgsql
security definer
as $$
declare
  v_customer public.loyalty_customers;
  v_bonus integer;
  v_transaction_id uuid;
begin
  if coalesce(trim(p_phone), '') = '' then
    raise exception 'phone is required';
  end if;

  if p_sale_amount <= 0 then
    raise exception 'sale amount must be positive';
  end if;

  v_bonus := floor(p_sale_amount * greatest(p_percent, 0) / 100)::integer;

  if v_bonus <= 0 then
    raise exception 'bonus amount must be positive';
  end if;

  select * into v_customer
  from public.loyalty_customers c
  where c.phone = p_phone
  for update;

  if not found then
    insert into public.loyalty_customers (phone, name, bonus_balance)
    values (p_phone, coalesce(nullif(trim(p_name), ''), p_phone), 0)
    returning * into v_customer;
  elsif coalesce(trim(p_name), '') <> '' and v_customer.name <> trim(p_name) then
    update public.loyalty_customers
    set name = trim(p_name)
    where id = v_customer.id
    returning * into v_customer;
  end if;

  update public.loyalty_customers
  set bonus_balance = public.loyalty_customers.bonus_balance + v_bonus
  where id = v_customer.id
  returning * into v_customer;

  insert into public.loyalty_transactions (customer_id, sale_id, type, amount, balance_after, comment)
  values (v_customer.id, nullif(trim(p_sale_id), ''), 'accrual', v_bonus, v_customer.bonus_balance, coalesce(p_comment, ''))
  returning id into v_transaction_id;

  return query select v_customer.id, v_customer.phone, v_customer.name, v_customer.bonus_balance, v_transaction_id, v_bonus;
end;
$$;

create or replace function public.loyalty_redeem(
  p_phone text,
  p_sale_id text,
  p_amount integer,
  p_comment text default ''
)
returns table (
  customer_id uuid,
  phone text,
  name text,
  bonus_balance integer,
  transaction_id uuid,
  transaction_amount integer
)
language plpgsql
security definer
as $$
declare
  v_customer public.loyalty_customers;
  v_transaction_id uuid;
begin
  if coalesce(trim(p_phone), '') = '' then
    raise exception 'phone is required';
  end if;

  if p_amount <= 0 then
    raise exception 'redeem amount must be positive';
  end if;

  select * into v_customer
  from public.loyalty_customers c
  where c.phone = p_phone
  for update;

  if not found then
    raise exception 'customer not found';
  end if;

  if v_customer.bonus_balance < p_amount then
    raise exception 'not enough bonuses';
  end if;

  update public.loyalty_customers
  set bonus_balance = public.loyalty_customers.bonus_balance - p_amount
  where id = v_customer.id
  returning * into v_customer;

  insert into public.loyalty_transactions (customer_id, sale_id, type, amount, balance_after, comment)
  values (v_customer.id, nullif(trim(p_sale_id), ''), 'redemption', p_amount, v_customer.bonus_balance, coalesce(p_comment, ''))
  returning id into v_transaction_id;

  return query select v_customer.id, v_customer.phone, v_customer.name, v_customer.bonus_balance, v_transaction_id, p_amount;
end;
$$;
