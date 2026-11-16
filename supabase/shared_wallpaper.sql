-- AuraGoal on Supabase, part 7: one chat wallpaper per partnership, shared by both partners. Run after
-- personal_touches.sql. Whoever changes it changes it for both; the app checks for changes while a chat is open.
-- (partner_prefs.wallpaper, the old per-person choice, is no longer used; each chat started from the most recent one.)
create table public.chat_wallpapers (
  partnership_id bigint primary key references public.partnerships (id) on delete cascade,
  wallpaper      text check (wallpaper is null or wallpaper ~ '^(preset:[a-z]{1,20}|photo:[0-9]{1,18}/[A-Za-z0-9._-]{1,120})$'),
  set_by         uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now()
);
alter table public.chat_wallpapers enable row level security;
revoke all on public.chat_wallpapers from public, anon, authenticated;
grant select on public.chat_wallpapers to authenticated;
grant insert (partnership_id, wallpaper) on public.chat_wallpapers to authenticated;
grant update (wallpaper) on public.chat_wallpapers to authenticated;

create policy "partners read" on public.chat_wallpapers for select to authenticated
  using (public.is_my_partnership(partnership_id));
create policy "partners add" on public.chat_wallpapers for insert to authenticated
  with check (public.is_my_partnership(partnership_id)
    and (wallpaper is null or wallpaper not like 'photo:%' or split_part(substr(wallpaper, 7), '/', 1) = partnership_id::text));
create policy "partners change" on public.chat_wallpapers for update to authenticated
  using (public.is_my_partnership(partnership_id))
  with check (public.is_my_partnership(partnership_id)
    and (wallpaper is null or wallpaper not like 'photo:%' or split_part(substr(wallpaper, 7), '/', 1) = partnership_id::text));

-- Who changed it, and when, are always set here (never taken from the request)
create function private.chat_wallpaper_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.set_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger chat_wallpaper_stamp before insert or update on public.chat_wallpapers
  for each row execute function private.chat_wallpaper_stamp();

-- Start each chat from the most recent wallpaper either partner had picked
insert into public.chat_wallpapers (partnership_id, wallpaper, set_by, updated_at)
select distinct on (partnership_id) partnership_id, wallpaper, owner_id, updated_at
from public.partner_prefs where wallpaper is not null
order by partnership_id, updated_at desc;
