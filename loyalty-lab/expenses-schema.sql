create extension if not exists pgcrypto;

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (category in ('fixed', 'variable', 'one_time', 'operational', 'marketing', 'taxes', 'financial')),
  subcategory text not null,
  amount numeric(14, 2) not null check (amount > 0),
  branch_name text not null default '',
  payment_method text not null default '',
  description text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_expenses_date_idx on public.business_expenses(expense_date desc);
create index if not exists business_expenses_category_idx on public.business_expenses(category);

create or replace function public.business_expenses_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_expenses_updated_at on public.business_expenses;
create trigger business_expenses_updated_at
before update on public.business_expenses
for each row execute function public.business_expenses_set_updated_at();
