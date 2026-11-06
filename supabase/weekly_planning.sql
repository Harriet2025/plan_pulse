-- AuraGoal on Supabase, part 3: the weekly planning ritual. Run after schema.sql and jobs.sql.
--   * profiles.planning_day: the weekday the "Plan your week" card shows up (1 = Monday ... 7 = Sunday)
--   * profiles.week_planned: the Monday of the last week the user planned
--   * goals.focus_week: the Monday of the week a goal is one of the (up to 3) focus goals
--   * day_plans.sub_plan_id: a day plan scheduled for one of a goal's plans. Ticking either one ticks the other.

alter table public.profiles
  add column planning_day smallint not null default 7 check (planning_day between 1 and 7),
  add column week_planned date;
grant update (planning_day, week_planned) on public.profiles to authenticated;

alter table public.goals add column focus_week date;
grant update (focus_week) on public.goals to authenticated;

alter table public.day_plans add column sub_plan_id bigint references public.sub_plans (id) on delete set null;
create index idx_day_plans_sub_plan on public.day_plans (sub_plan_id);
grant insert (sub_plan_id) on public.day_plans to authenticated;
grant update (sub_plan_id) on public.day_plans to authenticated;

-- A day plan can only be linked to a plan of one of your own goals
drop policy "own" on public.day_plans;
create policy "own" on public.day_plans for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (sub_plan_id is null or exists (
    select 1 from public.sub_plans s join public.goals g on g.id = s.goal_id where s.id = sub_plan_id and g.user_id = (select auth.uid()))));

/** Everything the app knows about the signed-in user. A streak that can no longer be saved shows as 0. */
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
    'id', u.id, 'email', v_email, 'display_name', u.display_name,
    'avatar_v', extract(epoch from u.avatar_updated_at)::bigint,
    'streak_count', v_count, 'best_streak', greatest(u.best_streak, v_count), 'streak_freezes', u.streak_freezes,
    'rest_days', (select coalesce(jsonb_agg(d order by d), '[]'::jsonb) from generate_series(1, 7) as d where ((u.rest_days::integer >> (d - 1)) & 1) = 1),
    'last_active', u.last_active_date, 'streak_active_today', u.last_active_date = v_today,
    'streak_protected', v_alive and v_missed > 0, 'rest_today', private.is_rest_day(u.rest_days, v_today),
    'daily_capacity_min', u.daily_capacity_min, 'digest_enabled', u.digest_enabled, 'digest_time', u.digest_time, 'timezone', u.timezone,
    'planning_day', u.planning_day, 'week_planned', u.week_planned
  );
end $$;

/** Ticks or unticks a goal's plan, and the day it was scheduled for. Finishing one counts as an active day. */
create or replace function public.set_task_done(p_task bigint, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_goal bigint;
  v_streak jsonb;
begin
  select s.goal_id into v_goal from public.sub_plans s join public.goals g on g.id = s.goal_id where s.id = p_task and g.user_id = auth.uid();
  if v_goal is null then raise exception 'Task not found.'; end if;
  update public.sub_plans set is_completed = p_done where id = p_task;
  if p_done then
    insert into public.day_plan_marks (day_plan_id, on_date, state)
    select id, plan_date, 'DONE' from public.day_plans where sub_plan_id = p_task and repeat_rule = 'NONE' and user_id = auth.uid()
    on conflict (day_plan_id, on_date) do update set state = 'DONE', marked_at = now();
    v_streak := private.touch_streak(auth.uid());
  else
    delete from public.day_plan_marks m using public.day_plans d
    where m.day_plan_id = d.id and d.sub_plan_id = p_task and d.repeat_rule = 'NONE' and d.user_id = auth.uid() and m.on_date = d.plan_date and m.state = 'DONE';
  end if;
  return jsonb_build_object('goal_id', v_goal, 'goal_status', (select status from public.goals where id = v_goal),
    'streak_count', v_streak->'count', 'streak', v_streak, 'progress', private.goal_progress(v_goal));
end $$;

/** Marks one day of a plan DONE or SKIPPED, or null to undo it. A plan scheduled for a goal's plan ticks that too. */
create or replace function public.mark_day_plan(p_id bigint, p_date date, p_state text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.day_plans;
  v_streak jsonb;
begin
  select * into r from public.day_plans where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Plan not found.'; end if;
  if not private.day_plan_occurs(r.plan_date, r.repeat_rule, r.repeat_days, r.repeat_until, p_date) then
    raise exception 'This plan does not happen on that day.';
  end if;
  if p_state is null then
    delete from public.day_plan_marks where day_plan_id = p_id and on_date = p_date;
  elsif p_state in ('DONE', 'SKIPPED') then
    insert into public.day_plan_marks (day_plan_id, on_date, state) values (p_id, p_date, p_state)
    on conflict (day_plan_id, on_date) do update set state = excluded.state, marked_at = now();
  else
    raise exception 'state must be DONE, SKIPPED or null.';
  end if;
  if r.sub_plan_id is not null and r.repeat_rule = 'NONE' and (p_state is null or p_state = 'DONE') then
    update public.sub_plans set is_completed = (p_state is not distinct from 'DONE')
    where id = r.sub_plan_id and is_completed is distinct from (p_state is not distinct from 'DONE');
  end if;
  if p_state = 'DONE' then v_streak := private.touch_streak(auth.uid()); end if;
  return jsonb_build_object('streak', v_streak);
end $$;

/**
 * Saves a planned week, all together: up to 3 focus goals, and day plans for goals' plans
 * (p_plans: [{ title, date, minutes, sub_plan_id }]). Runs as the user, so the access rules apply to every write.
 */
create function public.plan_week(p_week date, p_focus bigint[], p_plans jsonb) returns integer
language plpgsql set search_path = '' as $$
declare
  x jsonb;
  v_count integer := 0;
begin
  if extract(isodow from p_week) <> 1 then raise exception 'A week starts on a Monday.'; end if;
  if coalesce(array_length(p_focus, 1), 0) > 3 then raise exception 'Pick up to 3 focus goals.'; end if;
  if jsonb_array_length(coalesce(p_plans, '[]'::jsonb)) > 50 then raise exception 'That is a lot for one week. Schedule up to 50 plans.'; end if;
  update public.goals set focus_week = null where focus_week = p_week and not (id = any (coalesce(p_focus, '{}')));
  update public.goals set focus_week = p_week where id = any (coalesce(p_focus, '{}'));
  for x in select * from jsonb_array_elements(coalesce(p_plans, '[]'::jsonb)) loop
    if (x->>'date')::date not between p_week and p_week + 6 then raise exception 'Each plan has to be in that week.'; end if;
    insert into public.day_plans (title, plan_date, duration_min, sub_plan_id)
    values (x->>'title', (x->>'date')::date, (x->>'minutes')::smallint, (x->>'sub_plan_id')::bigint);
    v_count := v_count + 1;
  end loop;
  update public.profiles set week_planned = p_week where id = auth.uid();
  return v_count;
end $$;
revoke execute on function public.plan_week(date, bigint[], jsonb) from public, anon;
grant execute on function public.plan_week(date, bigint[], jsonb) to authenticated;
