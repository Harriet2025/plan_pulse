-- AuraGoal on Supabase, part 2: what the notify Edge Function needs. Run after schema.sql.

-- Server-only settings: the app's address, the push keys and the worker's secret. No role but the service role can read it.
create table public.server_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.server_settings enable row level security;
revoke all on public.server_settings from anon, authenticated;

/** The functions below are only for the Edge Function. */
create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
create function public.user_payload_for(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.user_payload(p_id)
$$;
revoke execute on function public.user_id_by_email(text), public.user_payload_for(uuid) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text), public.user_payload_for(uuid) to service_role;

-- Only real push services may be saved: the address comes from the browser, and the server will call it
create or replace function public.subscribe_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(p_endpoint) > 1000
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|[a-zA-Z0-9.-]+\.push\.services\.mozilla\.com|[a-zA-Z0-9.-]+\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'That is not a push address from a supported browser.';
  end if;
  if char_length(p_p256dh) > 255 or char_length(p_auth) > 64 then raise exception 'The subscription keys are not valid.'; end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid() and endpoint <> p_endpoint) >= 10 then
    raise exception 'You already have 10 devices. Remove one first.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 255))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke execute on function public.subscribe_push(text, text, text, text) from public, anon;
grant execute on function public.subscribe_push(text, text, text, text) to authenticated;

insert into public.server_settings (key, value) values
  ('worker_secret', to_jsonb(encode(extensions.gen_random_bytes(32), 'hex'))),
  ('app_url', to_jsonb('http://localhost:5173'::text));   -- the website's address, used in email links

-- Every minute: reminders and morning emails
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('auragoal-worker', '* * * * *', $job$
  select net.http_post(
    url := 'https://hdkjigczugqlfmbvgqgh.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', (select value #>> '{}' from public.server_settings where key = 'worker_secret')),
    body := '{}'::jsonb
  )
$job$);
