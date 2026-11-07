-- AuraGoal on Supabase, part 6: personal touches. Run after together.sql.
--   * profiles.nickname: what the app calls you (the dashboard greeting), instead of the name you signed up with.
--   * partner_prefs: per person, per partner: a nickname you give that partner, and your chat wallpaper. Only you
--     see your own choices; your partner keeps theirs.
--   * A goals challenge ("each of us completes 2 goals this week"), and the plan challenges say what counted.

-- ---- Your nickname ----
alter table public.profiles add column nickname text
  check (nickname is null or char_length(btrim(nickname)) between 1 and 40);
grant update (nickname) on public.profiles to authenticated;

create or replace function private.user_payload(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u public.profiles;
  v_email text;
  v_today date;
  v_missed integer;
  v_alive boolean;
  v_count integer;
begin
  select * into u from public.profiles where id = p_id;
  if not found then return null; end if;
  select email into v_email from auth.users where id = p_id;
  v_today := private.today_in(u.timezone);
  v_missed := private.missed_workdays(u.last_active_date, u.rest_days, v_today);
  v_alive := u.streak_count > 0 and v_missed <= u.streak_freezes;
  v_count := case when v_alive then u.streak_count else 0 end;
  return jsonb_build_object(
    'id', u.id, 'email', v_email, 'display_name', u.display_name, 'nickname', u.nickname,
    'avatar_v', extract(epoch from u.avatar_updated_at)::bigint,
    'streak_count', v_count, 'best_streak', greatest(u.best_streak, v_count), 'streak_freezes', u.streak_freezes,
    'rest_days', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from generate_series(1, 7) as d where ((u.rest_days::integer >> (d - 1)) & 1) = 1),
    'last_active', u.last_active_date, 'streak_active_today', u.last_active_date = v_today,
    'streak_protected', v_alive and v_missed > 0, 'rest_today', private.is_rest_day(u.rest_days, v_today),
    'daily_capacity_min', u.daily_capacity_min, 'digest_enabled', u.digest_enabled, 'digest_time', u.digest_time, 'timezone', u.timezone,
    'planning_day', u.planning_day, 'week_planned', u.week_planned
  );
end $$;

-- ---- Your nickname for a partner, and your chat wallpaper with them ----
create table public.partner_prefs (
  partnership_id bigint not null references public.partnerships (id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname       text check (nickname is null or char_length(btrim(nickname)) between 1 and 40),
  -- 'preset:<name>' or 'photo:<partnership id>/<file>' (a photo in the chat-media bucket)
  wallpaper      text check (wallpaper is null or wallpaper ~ '^(preset:[a-z]{1,20}|photo:[0-9]{1,18}/[A-Za-z0-9._-]{1,120})$'),
  updated_at     timestamptz not null default now(),
  primary key (partnership_id, owner_id)
);
alter table public.partner_prefs enable row level security;
revoke all on public.partner_prefs from public, anon, authenticated;
grant select, delete on public.partner_prefs to authenticated;
grant insert (partnership_id, nickname, wallpaper) on public.partner_prefs to authenticated;
grant update (nickname, wallpaper) on public.partner_prefs to authenticated;
-- The policy cannot read partnerships itself (signed-in users have no grant on it), so it asks this function
create function public.is_my_partnership(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partnerships p where p.id = p_id and p.status = 'ACCEPTED' and auth.uid() in (p.inviter_id, p.invitee_id))
$$;
revoke execute on function public.is_my_partnership(bigint) from public, anon;
grant execute on function public.is_my_partnership(bigint) to authenticated;
create policy "own" on public.partner_prefs for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.is_my_partnership(partnership_id)
    and (wallpaper is null or wallpaper not like 'photo:%' or split_part(substr(wallpaper, 7), '/', 1) = partnership_id::text)
  );

-- ---- Challenges: a goals challenge, and what counted ----
alter table public.partner_challenges drop constraint partner_challenges_kind_check;
alter table public.partner_challenges add constraint partner_challenges_kind_check
  check (kind in ('EACH_GOALS', 'EACH_PLANS', 'TOTAL_PLANS', 'CHAT_DAYS', 'HABIT'));

/** Goals someone completed in the week starting p_monday: their own, and shared goals finished with a partner. */
create function private.goals_done_in_week(p_id uuid, p_monday date) returns integer
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.goals g
          where g.user_id = p_id and g.status = 'COMPLETED' and (g.completed_at at time zone 'UTC')::date between p_monday and p_monday + 6)::integer
       + (select count(*) from public.team_goals t join public.partnerships p on p.id = t.partnership_id
          where p_id in (p.inviter_id, p.invitee_id) and t.status = 'COMPLETED'
            and (t.completed_at at time zone 'UTC')::date between p_monday and p_monday + 6)::integer
$$;

/** Where someone's plans this week came from: { day: day plans, steps: steps of their goals, shared: shared plans }. */
create function private.plans_parts(p_id uuid, p_monday date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'steps', (select count(*) from public.sub_plans s join public.goals g on g.id = s.goal_id
              where g.user_id = p_id and s.is_completed and (s.completed_at at time zone 'UTC')::date between p_monday and p_monday + 6),
    'day', (select count(*) from public.day_plan_marks m join public.day_plans dp on dp.id = m.day_plan_id
            where dp.user_id = p_id and m.state = 'DONE' and m.on_date between p_monday and p_monday + 6),
    'shared', (select count(*) from public.team_plan_marks t
               where t.user_id = p_id and (t.done_at at time zone 'UTC')::date between p_monday and p_monday + 6))
$$;

create or replace function private.challenge_text(p_kind text, p_target integer, p_title text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'EACH_GOALS' then format('each of us completes %s goal%s', p_target, case when p_target = 1 then '' else 's' end)
    when 'EACH_PLANS' then format('each of us ticks off %s plan%s', p_target, case when p_target = 1 then '' else 's' end)
    when 'TOTAL_PLANS' then format('together we tick off %s plan%s', p_target, case when p_target = 1 then '' else 's' end)
    when 'CHAT_DAYS' then format('we both chat on %s day%s', p_target, case when p_target = 1 then '' else 's' end)
    else format('each of us does “%s” on %s day%s', p_title, p_target, case when p_target = 1 then '' else 's' end) end
$$;

create or replace function private.challenge_json(c public.partner_challenges, p_me uuid, p_them uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me integer;
  v_them integer;
  v_won boolean;
  v_days date[] := '{}';
  v_me_days date[] := '{}';
  v_them_days date[] := '{}';
  v_me_parts jsonb;
  v_them_parts jsonb;
begin
  if c.kind = 'EACH_GOALS' then
    v_me := private.goals_done_in_week(p_me, c.week_start);
    v_them := private.goals_done_in_week(p_them, c.week_start);
    v_won := v_me >= c.target and v_them >= c.target;
  elsif c.kind in ('EACH_PLANS', 'TOTAL_PLANS') then
    v_me := private.plans_done_in_week(p_me, c.week_start);
    v_them := private.plans_done_in_week(p_them, c.week_start);
    v_me_parts := private.plans_parts(p_me, c.week_start);
    v_them_parts := private.plans_parts(p_them, c.week_start);
    v_won := (case when c.kind = 'EACH_PLANS' then v_me >= c.target and v_them >= c.target else v_me + v_them >= c.target end);
  elsif c.kind = 'CHAT_DAYS' then
    v_days := private.chat_days_in_week(c.partnership_id, c.week_start);
    v_me := coalesce(array_length(v_days, 1), 0); v_them := v_me;
    v_won := v_me >= c.target;
  else
    select coalesce(array_agg(on_date order by on_date) filter (where user_id = p_me), '{}'),
           coalesce(array_agg(on_date order by on_date) filter (where user_id = p_them), '{}')
      into v_me_days, v_them_days from public.challenge_checkins where challenge_id = c.id;
    v_me := coalesce(array_length(v_me_days, 1), 0); v_them := coalesce(array_length(v_them_days, 1), 0);
    v_won := v_me >= c.target and v_them >= c.target;
  end if;
  return jsonb_build_object('id', c.id, 'kind', c.kind, 'target', c.target, 'title', c.title, 'week_start', c.week_start,
    'text', private.challenge_text(c.kind, c.target, c.title), 'set_by_me', c.set_by = p_me,
    'me', v_me, 'them', v_them, 'won', v_won, 'me_parts', v_me_parts, 'them_parts', v_them_parts,
    'days', to_jsonb(v_days), 'me_days', to_jsonb(v_me_days), 'them_days', to_jsonb(v_them_days));
end $$;

create or replace function public.set_challenge(p_id bigint, p_kind text, p_target integer, p_title text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  p public.partnerships := private.accepted_partnership(p_id);
  v_monday date := private.this_monday();
  v_title text := nullif(btrim(p_title), '');
  v_old public.partner_challenges;
  v_msg bigint;
  v_max integer := (case p_kind when 'EACH_GOALS' then 20 when 'EACH_PLANS' then 100 when 'TOTAL_PLANS' then 200 else 7 end);
begin
  if p_kind not in ('EACH_GOALS', 'EACH_PLANS', 'TOTAL_PLANS', 'CHAT_DAYS', 'HABIT') then raise exception 'Pick a kind of challenge.'; end if;
  if p_target is null or p_target < 1 or p_target > v_max then raise exception 'That target does not fit this challenge.'; end if;
  if p_kind = 'HABIT' and coalesce(char_length(v_title), 0) not between 1 and 120 then raise exception 'Say what you will both do, in up to 120 characters.'; end if;
  if p_kind <> 'HABIT' then v_title := null; end if;
  if (select count(*) from public.partner_messages where partnership_id = p.id and sender_id = v_me and kind = 'TEAM' and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Slow down a little, then try again.';
  end if;
  select * into v_old from public.partner_challenges where partnership_id = p.id and week_start = v_monday for update;
  if found then
    if v_old.kind <> p_kind or v_old.title is distinct from v_title then delete from public.challenge_checkins where challenge_id = v_old.id; end if;
    update public.partner_challenges set kind = p_kind, target = p_target, title = v_title, set_by = v_me where id = v_old.id;
  else
    insert into public.partner_challenges (partnership_id, week_start, kind, target, title, set_by) values (p.id, v_monday, p_kind, p_target, v_title, v_me);
  end if;
  v_msg := private.team_note(p.id, format('%s this week''s challenge: %s', (case when v_old.id is null then 'set' else 'changed' end), private.challenge_text(p_kind, p_target, v_title)));
  return public.together_view(p.id) || jsonb_build_object('message_id', v_msg);
end $$;
