create extension if not exists pgcrypto;

create table if not exists public.business_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  document_type text not null,
  document_name text not null default '',
  document_url text not null default '',
  branch_name text not null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  scheduled_at timestamptz not null,
  employee_name text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'assigned', 'in_transit', 'delivered', 'cancelled')),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_type, document_id)
);

create index if not exists business_deliveries_schedule_idx on public.business_deliveries(scheduled_at, status);
create index if not exists business_deliveries_branch_idx on public.business_deliveries(branch_name);
alter table public.business_deliveries enable row level security;

create or replace function public.business_deliveries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_deliveries_updated_at on public.business_deliveries;
create trigger business_deliveries_updated_at
before update on public.business_deliveries
for each row execute function public.business_deliveries_set_updated_at();
