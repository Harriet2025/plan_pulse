-- AuraGoal on Supabase, part 9: shared goal pages that feel alive. Run after goal_pages.sql.
--   * Live presence: while a shared goal's page is open, the app joins a private Realtime channel named
--     "team-goal:<id>" to show who else is on the page and which block they are editing, and to tell the other
--     partner the moment notes, comments or ticks change. Only the goal's two partners may join that channel.
--   * Reactions on comments: 👍 ❤️ 🎉 😂 🙏 🔥, one of each per person, toggled with a tap.

-- ---- Who may join a shared goal's live channel ----
/** True when the signed-in user is one of the shared goal's two partners. (Public, so a policy can call it.) */
create function public.is_my_team_goal(p_goal bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_goals g join public.partnerships p on p.id = g.partnership_id
    where g.id = p_goal and p.status = 'ACCEPTED' and (select auth.uid()) in (p.inviter_id, p.invitee_id))
$$;
revoke execute on function public.is_my_team_goal(bigint) from public, anon;
grant execute on function public.is_my_team_goal(bigint) to authenticated;

create policy "auragoal: partners read a shared goal channel" on realtime.messages for select to authenticated
  using (realtime.topic() ~ '^team-goal:[0-9]{1,18}$' and public.is_my_team_goal(split_part(realtime.topic(), ':', 2)::bigint));
create policy "auragoal: partners write to a shared goal channel" on realtime.messages for insert to authenticated
  with check (realtime.topic() ~ '^team-goal:[0-9]{1,18}$' and public.is_my_team_goal(split_part(realtime.topic(), ':', 2)::bigint));

-- ---- Reactions ----
create table public.team_comment_reactions (
  comment_id bigint not null references public.team_goal_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null check (emoji in ('👍', '❤️', '🎉', '😂', '🙏', '🔥')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
alter table public.team_comment_reactions enable row level security;
revoke all on public.team_comment_reactions from public, anon, authenticated;

-- The page now includes each comment's reactions: [{ emoji, count, mine }]
create or replace function public.team_goal_page(p_goal bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  g public.team_goals := private.my_team_goal(p_goal);
  pg public.team_goal_pages;
begin
  select * into pg from public.team_goal_pages where team_goal_id = g.id;
  return jsonb_build_object(
    'goal', private.team_goal_json(g, v_me),
    'partnership_id', g.partnership_id,
    'notes', jsonb_build_object('blocks', coalesce(pg.blocks, '[]'::jsonb), 'updated_at', pg.updated_at,
                                'updated_by_me', pg.updated_by = v_me),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'mine', c.author_id = v_me,
                   'plan_id', c.team_plan_id, 'at', c.created_at,
                   'reactions', (select coalesce(jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine) order by r.first), '[]'::jsonb)
                                 from (select emoji, count(*) as n, bool_or(user_id = v_me) as mine, min(created_at) as first
                                       from public.team_comment_reactions where comment_id = c.id group by emoji) r)
                 ) order by c.id), '[]'::jsonb)
                 from public.team_goal_comments c where c.team_goal_id = g.id),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('plan_id', t.id, 'text', t.task, 'mine', m.user_id = v_me,
                   'at', m.done_at) order by m.done_at desc), '[]'::jsonb)
                 from public.team_plan_marks m join public.team_plans t on t.id = m.team_plan_id where t.team_goal_id = g.id));
end $$;

/** Adds your reaction to a comment, or takes it away if you already gave that one. Returns the page. */
create function public.react_to_comment(p_comment bigint, p_emoji text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_goal bigint;
begin
  select team_goal_id into v_goal from public.team_goal_comments where id = p_comment;
  if v_goal is null then raise exception 'Comment not found.'; end if;
  perform private.my_team_goal(v_goal);
  if p_emoji not in ('👍', '❤️', '🎉', '😂', '🙏', '🔥') then raise exception 'Pick one of the reactions.'; end if;
  delete from public.team_comment_reactions where comment_id = p_comment and user_id = auth.uid() and emoji = p_emoji;
  if not found then
    insert into public.team_comment_reactions (comment_id, user_id, emoji) values (p_comment, auth.uid(), p_emoji);
  end if;
  return public.team_goal_page(v_goal);
end $$;
revoke execute on function public.react_to_comment(bigint, text) from public, anon;
grant execute on function public.react_to_comment(bigint, text) to authenticated;
