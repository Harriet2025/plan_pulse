-- AuraGoal on Supabase, part 4: every goal is private until you share it. Run after weekly_planning.sql.
--   * goal_shares: which partner can see which of your goals, one goal at a time. Nothing is shared until you choose.
--   * partner_shares now only holds "my day plans" (category_id 0); sharing whole categories is gone.
--   * goals.is_private is no longer used: a goal no one was given is private.

create table public.goal_shares (
  goal_id        bigint not null references public.goals (id) on delete cascade,
  partnership_id bigint not null references public.partnerships (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (goal_id, partnership_id)
);
create index idx_goal_shares_partnership on public.goal_shares (partnership_id);
alter table public.goal_shares enable row level security;
-- You can read who each of your own goals is shared with; changes go through share_goal and set_partner_shares
revoke all on public.goal_shares from public, anon, authenticated;
grant select on public.goal_shares to authenticated;
create policy "own goals" on public.goal_shares for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())));

-- Keep what partners could already see: goals in a shared category that were not marked private
insert into public.goal_shares (goal_id, partnership_id)
select g.id, s.partnership_id from public.partner_shares s
join public.goals g on g.user_id = s.owner_id and coalesce(g.category_id, 9) = s.category_id and not g.is_private
where s.category_id <> 0
on conflict do nothing;
delete from public.partner_shares where category_id <> 0;

/** What an owner shares with a partnership: { goals: [goal ids], day_plans: true | false }. */
create or replace function private.shares_of(p_partnership bigint, p_owner uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'goals', (select coalesce(jsonb_agg(s.goal_id order by s.goal_id), '[]'::jsonb)
              from public.goal_shares s join public.goals g on g.id = s.goal_id
              where s.partnership_id = p_partnership and g.user_id = p_owner),
    'day_plans', exists (select 1 from public.partner_shares where partnership_id = p_partnership and owner_id = p_owner and category_id = 0))
$$;

/** Who can see one of your goals: p_partners is the full list of partnership ids. Returns that list. */
create function public.share_goal(p_goal bigint, p_partners bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_partners, '{}')) as x);
begin
  if not exists (select 1 from public.goals where id = p_goal and user_id = v_me) then raise exception 'Goal not found.'; end if;
  if (select count(*) from public.partnerships where id = any (v_ids) and status = 'ACCEPTED' and v_me in (inviter_id, invitee_id))
     <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Partner not found.';
  end if;
  delete from public.goal_shares where goal_id = p_goal and not (partnership_id = any (v_ids));
  insert into public.goal_shares (goal_id, partnership_id) select p_goal, x from unnest(v_ids) as x on conflict do nothing;
  return (select coalesce(jsonb_agg(partnership_id order by partnership_id), '[]'::jsonb) from public.goal_shares where goal_id = p_goal);
end $$;
revoke execute on function public.share_goal(bigint, bigint[]) from public, anon;
grant execute on function public.share_goal(bigint, bigint[]) to authenticated;

/** What this partner may see of yours: the goals you picked, and optionally your day plans. */
drop function public.set_partner_shares(bigint, bigint[], boolean);
create function public.set_partner_shares(p_id bigint, p_goals bigint[], p_day_plans boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  p public.partnerships := private.accepted_partnership(p_id);
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_goals, '{}')) as x);
begin
  if (select count(*) from public.goals where id = any (v_ids) and user_id = v_me) <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Goal not found.';
  end if;
  delete from public.goal_shares s using public.goals g
  where g.id = s.goal_id and g.user_id = v_me and s.partnership_id = p.id and not (s.goal_id = any (v_ids));
  insert into public.goal_shares (goal_id, partnership_id) select x, p.id from unnest(v_ids) as x on conflict do nothing;
  delete from public.partner_shares where partnership_id = p.id and owner_id = v_me;
  if p_day_plans then
    insert into public.partner_shares (partnership_id, owner_id, category_id) values (p.id, v_me, 0);
  end if;
  return public.partners_payload() || jsonb_build_object('message', 'Saved what they can see.');
end $$;
revoke execute on function public.set_partner_shares(bigint, bigint[], boolean) from public, anon;
grant execute on function public.set_partner_shares(bigint, bigint[], boolean) to authenticated;

/**
 * What a partner shares: the goals they gave you (active ones, and ones finished in the last two weeks) with plans, their
 * plans for today on their own clock if they share their day, and this week's scoreboard.
 */
create or replace function public.partner_view(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  p public.partnerships := private.accepted_partnership(p_id);
  v_partner uuid := case when p.inviter_id = v_me then p.invitee_id else p.inviter_id end;
  v_shares jsonb := private.shares_of(p.id, v_partner);
  v_today date := private.today_in((select timezone from public.profiles where id = v_partner));
begin
  return jsonb_build_object(
    'partner', private.partner_profile(v_partner), 'shares', v_shares, 'date', v_today,
    'goals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'category_id', g.category_id, 'priority', g.priority,
        'category', case when c.id is not null then jsonb_build_object('name', c.name, 'color', c.color_code) end,
        'timeframe', g.timeframe, 'due_date', g.due_date, 'status', g.status, 'completed_at', g.completed_at,
        'plans', (select coalesce(jsonb_agg(jsonb_build_object('text', s.task_description, 'done', s.is_completed) order by s.id), '[]'::jsonb) from public.sub_plans s where s.goal_id = g.id)
      ) order by g.created_at desc, g.id desc), '[]'::jsonb)
      from public.goals g join public.goal_shares gs on gs.goal_id = g.id and gs.partnership_id = p.id
      left join public.categories c on c.id = g.category_id
      where g.user_id = v_partner
        and g.status <> 'ARCHIVED' and (g.status <> 'COMPLETED' or g.completed_at >= now() - interval '14 days')),
    'today', (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'start', to_char(d.start_time, 'HH24:MI'), 'minutes', d.duration_min, 'repeat', d.repeat_rule, 'done', m.state = 'DONE')
        order by d.start_time nulls last, d.id), '[]'::jsonb)
      from public.day_plans d left join public.day_plan_marks m on m.day_plan_id = d.id and m.on_date = v_today
      where d.user_id = v_partner and (v_shares->>'day_plans')::boolean and not d.is_private and m.state is distinct from 'SKIPPED'
        and private.day_plan_occurs(d.plan_date, d.repeat_rule, d.repeat_days, d.repeat_until, v_today)),
    'scoreboard', jsonb_build_object('me', private.plans_done_this_week(v_me), 'them', private.plans_done_this_week(v_partner)));
end $$;

/**
 * Sends to a partner. p_action: text { body } | cheer { emoji, goal_id } | nudge | media { path, mime, w, h, caption },
 * where a media file is first uploaded to the chat-media bucket under "<partnership id>/". A cheer is only for a goal
 * they shared with you. Returns the new messages after p_after, the chat streak and message_id (for the push).
 */
create or replace function public.send_message(p_id bigint, p_action text, p_fields jsonb default '{}', p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  p public.partnerships := private.accepted_partnership(p_id);
  v_partner uuid := case when p.inviter_id = v_me then p.invitee_id else p.inviter_id end;
  v_body text;
  v_goal public.goals;
  v_path text;
  v_mime text;
  v_msg bigint;
  v_rows jsonb;
begin
  if (select count(*) from public.partner_messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Slow down a little, then try again.';
  end if;
  if p_action = 'text' then
    v_body := btrim(p_fields->>'body');
    if coalesce(char_length(v_body), 0) not between 1 and 1000 then raise exception 'A message is 1 to 1000 characters.'; end if;
    insert into public.partner_messages (partnership_id, sender_id, kind, body) values (p.id, v_me, 'TEXT', v_body) returning id into v_msg;
  elsif p_action = 'cheer' then
    v_body := p_fields->>'emoji';
    if v_body is null or not (v_body = any (array['🔥', '👏', '💪', '❤️', '🎉', '⭐'])) then raise exception 'Pick one of the cheers.'; end if;
    select g.* into v_goal from public.goals g join public.goal_shares s on s.goal_id = g.id and s.partnership_id = p.id
    where g.id = (p_fields->>'goal_id')::bigint and g.user_id = v_partner;
    if not found then raise exception 'That goal is not shared with you.'; end if;
    insert into public.partner_messages (partnership_id, sender_id, kind, body, ref_goal_id) values (p.id, v_me, 'CHEER', v_body, v_goal.id) returning id into v_msg;
  elsif p_action = 'media' then
    v_body := coalesce(btrim(p_fields->>'caption'), '');
    v_path := p_fields->>'path';
    v_mime := p_fields->>'mime';
    if char_length(v_body) > 1000 then raise exception 'A caption is 1000 characters or fewer.'; end if;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime') then raise exception 'Send a photo or a video.'; end if;
    -- At most 40 photos and videos a day from one person
    if (select count(*) from public.partner_messages where sender_id = v_me and kind in ('IMAGE', 'VIDEO') and created_at > now() - interval '1 day') >= 40 then
      raise exception 'That is a lot of photos and videos today. Try again tomorrow.';
    end if;
    if v_path is null or split_part(v_path, '/', 1) <> p.id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = v_path and o.owner_id = v_me::text) then
      raise exception 'That file was not uploaded.';
    end if;
    insert into public.partner_messages (partnership_id, sender_id, kind, body, media_file, media_mime, media_w, media_h)
    values (p.id, v_me, case when v_mime like 'video/%' then 'VIDEO' else 'IMAGE' end, v_body, v_path, v_mime, (p_fields->>'w')::integer, (p_fields->>'h')::integer)
    returning id into v_msg;
  elsif p_action = 'nudge' then
    if exists (select 1 from public.partner_messages where partnership_id = p.id and sender_id = v_me and kind = 'NUDGE' and created_at > now() - interval '4 hours') then
      raise exception 'You nudged them already. You can nudge again in a few hours.';
    end if;
    insert into public.partner_messages (partnership_id, sender_id, kind, body) values (p.id, v_me, 'NUDGE', 'Nudge! Time to plan your day and get going.') returning id into v_msg;
  else
    raise exception 'Unknown action. Use text, cheer, media or nudge.';
  end if;
  v_rows := private.message_rows(p.id, greatest(p_after, 0));
  perform private.mark_read(p, v_rows);
  return jsonb_build_object('messages', v_rows, 'chat_streak', private.chat_streak(p.id, v_me), 'message_id', v_msg);
end $$;
