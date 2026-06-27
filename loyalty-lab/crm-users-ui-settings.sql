alter table public.crm_users
  add column if not exists ui_settings jsonb not null default '{}'::jsonb;

comment on column public.crm_users.ui_settings is 'Персональные настройки интерфейса CRM: цвет, режим, плотность.';
