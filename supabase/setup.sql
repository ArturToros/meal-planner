-- Safe to run more than once.

-- The whole household plan lives in one row; the app saves it with a version check.
create table if not exists public.household (
  id int primary key,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.household enable row level security;
drop policy if exists "household members" on public.household;
create policy "household members" on public.household for all to authenticated using (true) with check (true);
alter table public.household replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.household;
exception when duplicate_object then null; end $$;

-- Server-only tables: row level security on, no policies, so only the edge functions can read them.
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
create table if not exists public.push_subs (
  endpoint text primary key,
  person text not null,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
alter table public.push_subs add column if not exists lang text not null default 'en';
insert into public.app_config (key, value) values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (key) do nothing;

-- Photos of dishes and recipe screenshots. Public links so images load fast; uploads need sign-in.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "household uploads photos" on storage.objects;
create policy "household uploads photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists "household reads photos" on storage.objects;
create policy "household reads photos" on storage.objects for select to authenticated using (bucket_id = 'photos');

-- Every hour, ask the reminder function whether it's time for the evening notification.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('evening-reminder') where exists (select 1 from cron.job where jobname = 'evening-reminder');
select cron.schedule('evening-reminder', '0 * * * *', $$
  select net.http_post(
    url := 'https://yylsqqajnfvkodspejpg.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_config where key = 'cron_secret')),
    body := '{"action":"cron"}'::jsonb
  )
$$);
