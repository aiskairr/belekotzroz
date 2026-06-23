create extension if not exists pgcrypto;

create table if not exists public.crm_users (
  id uuid primary key default gen_random_uuid(),
  login text not null unique,
  name text not null,
  position text not null default '',
  role text not null check (role in ('admin', 'owner', 'manager', 'seller', 'logistics', 'accountant', 'employee')),
  branches text[] not null default '{}',
  permissions jsonb not null default '[]'::jsonb,
  password_hash text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_users_active_name_idx on public.crm_users(active, name);

alter table public.crm_users enable row level security;

create or replace function public.crm_users_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_users_updated_at on public.crm_users;
create trigger crm_users_updated_at
before update on public.crm_users
for each row execute function public.crm_users_set_updated_at();

insert into public.crm_users (login, name, position, role, branches, permissions)
values
  ('adil', 'Адил', 'Менеджер', 'manager', array['ayu'], '["sales","debtSale","deliveries","reports","reportProfit","expenses","payroll","about"]'::jsonb),
  ('adilet', 'Адилет', 'Продавец', 'seller', array['besh'], '["sales","debtSale","deliveries","reports","about"]'::jsonb),
  ('askat', 'Аскат', 'Продавец, грузчик', 'seller', array['ayu'], '["sales","debtSale","deliveries","reports","about"]'::jsonb),
  ('barchynai', 'Барчынай', 'Продавец', 'seller', array['besh'], '["sales","debtSale","deliveries","reports","about"]'::jsonb),
  ('berdaly', 'Бердалы', 'Курьер, заведующий складом', 'logistics', array['ayu','besh'], '["sales","debtSale","deliveries","about"]'::jsonb),
  ('gulzat', 'Гулзат', 'Владелец', 'owner', array['ayu','besh'], '["sales","debtSale","deliveries","reports","expenses","payroll","priceFormula","audit","users","about"]'::jsonb),
  ('zhenishbek', 'Женишбек', 'Владелец', 'owner', array['ayu','besh'], '["sales","debtSale","deliveries","reports","expenses","payroll","priceFormula","audit","users","about"]'::jsonb),
  ('kudaiberdi', 'Кудайберди', 'Главный администратор', 'admin', array['ayu','besh'], '["sales","debtSale","deliveries","reports","expenses","payroll","priceFormula","audit","users","about"]'::jsonb),
  ('ulan', 'Улан', 'Продавец, грузчик', 'seller', array['besh'], '["sales","debtSale","deliveries","reports","about"]'::jsonb),
  ('cholpon', 'Чолпон', 'Менеджер', 'manager', array['besh'], '["sales","debtSale","deliveries","reports","reportProfit","expenses","payroll","about"]'::jsonb),
  ('yryskeldi', 'Ырыскелди', 'Продавец, грузчик', 'seller', array['ayu','besh'], '["sales","debtSale","deliveries","reports","about"]'::jsonb),
  ('elmira', 'Эльмира', 'Продавец', 'seller', array['besh'], '["sales","debtSale","deliveries","reports","about"]'::jsonb)
on conflict (login) do update set
  name = excluded.name,
  position = excluded.position,
  role = excluded.role,
  branches = excluded.branches,
  permissions = excluded.permissions,
  active = true;

-- Пароли задаются владельцем в CRM. Клиентская часть никогда не получает password_hash.
