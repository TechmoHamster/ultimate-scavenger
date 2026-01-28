-- SMS / Twilio settings + logs
-- Run this in Supabase SQL Editor (as postgres).

create table if not exists public.sms_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  send_demo_prefix boolean not null default true,
  template text,
  admin_phone text,
  from_number text,
  account_sid text,
  auth_token_enc text,
  messaging_service_sid text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sms_settings_singleton check (id = true)
);

create table if not exists public.sms_clue_rules (
  clue_index int primary key,
  enabled boolean not null default false,
  template text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sms_logs (
  id uuid primary key default uuid_generate_v4(),
  sent_at timestamptz default now(),
  triggered_by uuid references auth.users(id) on delete set null,
  is_demo boolean default false,
  to_number_masked text,
  from_number_masked text,
  message_preview text,
  status text not null, -- sent | error | skipped
  twilio_sid text,
  error text
);

alter table public.sms_settings enable row level security;
alter table public.sms_clue_rules enable row level security;
alter table public.sms_logs enable row level security;

-- No policies on purpose: these are accessed only via server routes using service role.
