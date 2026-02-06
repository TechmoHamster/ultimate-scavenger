-- Enable extensions
create extension if not exists "uuid-ossp";

-- Authorized names for the name gate (case-insensitive match via normalized_name)
create table if not exists public.authorized_names (
  id uuid primary key default uuid_generate_v4(),
  display_name text not null,
  normalized_name text not null unique,
  created_at timestamptz default now()
);

-- User profile table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text,
  role text default 'player',
  is_disabled boolean default false,
  tutorial_completed boolean default false,
  tutorial_completed_at timestamptz,
  tutorial_skipped boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Automatically create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.email = 'zach2741@gmail.com' then 'admin' else 'player' end
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;

-- Helper to check admin role
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles are viewable by staff" on public.profiles;
drop policy if exists "Profiles are updatable by owner" on public.profiles;
drop policy if exists "Profiles are manageable by staff" on public.profiles;

create policy "Profiles are viewable by owner" on public.profiles
for select
using (auth.uid() = id);

create policy "Profiles are viewable by staff" on public.profiles
for select
using (public.is_moderator());

create policy "Profiles are updatable by owner" on public.profiles
for update
using (auth.uid() = id);

create policy "Profiles are manageable by staff" on public.profiles
for update
using (public.is_moderator());

-- Keep authorized_names locked (only service role reads)
alter table public.authorized_names enable row level security;

-- Clues table
create table if not exists public.clues (
  id uuid primary key default uuid_generate_v4(),
  clue_index int not null unique,
  label text not null,
  title text not null,
  clue text not null,
  reminder text,
  reward int default 0,
  hints_enabled boolean default true,
  hint_limit int default 2,
  is_final boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.clue_secrets (
  id uuid primary key default uuid_generate_v4(),
  clue_id uuid references public.clues(id) on delete cascade,
  password text,
  password_hash text,
  password_ciphertext text,
  requires_unlock boolean default true,
  radius_meters int,
  lat double precision,
  lng double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.clue_hints (
  id uuid primary key default uuid_generate_v4(),
  clue_id uuid references public.clues(id) on delete cascade,
  sort_order int not null,
  cost int default 0,
  text text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clues enable row level security;
alter table public.clue_hints enable row level security;
alter table public.clue_secrets enable row level security;

drop policy if exists "Clues are readable by anyone" on public.clues;
drop policy if exists "Hints are readable by anyone" on public.clue_hints;
drop policy if exists "Admins can manage clues" on public.clues;
drop policy if exists "Admins can manage hints" on public.clue_hints;
drop policy if exists "Admins can manage clue secrets" on public.clue_secrets;

create policy "Clues are readable by anyone" on public.clues for select using (true);
create policy "Hints are readable by anyone" on public.clue_hints for select using (true);

create policy "Admins can manage clues" on public.clues for all using (public.is_admin());
create policy "Admins can manage hints" on public.clue_hints for all using (public.is_admin());
create policy "Admins can manage clue secrets" on public.clue_secrets for all using (public.is_admin());

alter table public.clues drop column if exists password;
alter table public.clues drop column if exists radius_meters;
alter table public.clues drop column if exists lat;
alter table public.clues drop column if exists lng;

-- Player state and progress
create table if not exists public.player_state (
  player_id uuid primary key references auth.users(id) on delete cascade,
  current_clue_index int default 0,
  wallet_balance int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.step_completions (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references auth.users(id) on delete cascade,
  clue_index int not null,
  completed_at timestamptz default now(),
  geo_lat double precision,
  geo_lng double precision,
  distance_meters double precision
);

create table if not exists public.hint_purchases (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references auth.users(id) on delete cascade,
  clue_index int not null,
  hint_order int not null,
  cost int not null,
  purchased_at timestamptz default now()
);

alter table public.player_state enable row level security;
alter table public.step_completions enable row level security;
alter table public.hint_purchases enable row level security;

drop policy if exists "Player state readable by owner" on public.player_state;
drop policy if exists "Player state updatable by owner" on public.player_state;
drop policy if exists "Player state insert by owner" on public.player_state;
drop policy if exists "Staff can manage player state" on public.player_state;
drop policy if exists "Step completions readable by owner" on public.step_completions;
drop policy if exists "Step completions insert by owner" on public.step_completions;
drop policy if exists "Staff can manage completions" on public.step_completions;
drop policy if exists "Hint purchases readable by owner" on public.hint_purchases;
drop policy if exists "Hint purchases insert by owner" on public.hint_purchases;
drop policy if exists "Staff can manage hint purchases" on public.hint_purchases;

create policy "Player state readable by owner" on public.player_state
for select using (auth.uid() = player_id);

create policy "Player state updatable by owner" on public.player_state
for update using (auth.uid() = player_id);

create policy "Player state insert by owner" on public.player_state
for insert with check (auth.uid() = player_id);

create policy "Staff can manage player state" on public.player_state
for all using (public.is_moderator());

create policy "Step completions readable by owner" on public.step_completions
for select using (auth.uid() = player_id);

create policy "Step completions insert by owner" on public.step_completions
for insert with check (auth.uid() = player_id);

create policy "Staff can manage completions" on public.step_completions
for all using (public.is_moderator());

create policy "Hint purchases readable by owner" on public.hint_purchases
for select using (auth.uid() = player_id);

create policy "Hint purchases insert by owner" on public.hint_purchases
for insert with check (auth.uid() = player_id);

create policy "Staff can manage hint purchases" on public.hint_purchases
for all using (public.is_moderator());

-- Helper to normalize names on insert
create or replace function public.normalize_name(input text)
returns text as $$
  select regexp_replace(lower(trim(input)), '\\s+', ' ', 'g');
$$ language sql immutable;

-- Example inserts for authorized names
-- insert into public.authorized_names (display_name, normalized_name)
-- values
-- ('Zachary Johnson', public.normalize_name('Zachary Johnson')),
-- ('Zach', public.normalize_name('Zach')),
-- ('Erika Maurer', public.normalize_name('Erika Maurer')),
-- ('Erika', public.normalize_name('Erika'));
