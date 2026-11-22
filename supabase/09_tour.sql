-- 첫 실행 가이드(코치마크)를 봤는지 계정 단위로 저장해 모든 기기에서 같게 적용합니다.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- (06_single_session.sql 과 08_verse_hide.sql 을 먼저 실행해 두어야 합니다.)

alter table public.user_prefs add column if not exists tour_done boolean not null default false;

create or replace function public.get_tour_done() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select tour_done from public.user_prefs
     where user_id = auth.uid() and public._session_ok()),
    false);
$$;

create or replace function public.set_tour_done(p_done boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public._session_ok() then return; end if;
  insert into public.user_prefs(user_id, tour_done, updated_at)
  values (auth.uid(), coalesce(p_done, false), now())
  on conflict (user_id) do update set tour_done = excluded.tour_done, updated_at = now();
end;
$$;

revoke execute on function public.get_tour_done()          from public, anon;
revoke execute on function public.set_tour_done(boolean)   from public, anon;
grant  execute on function public.get_tour_done()          to authenticated;
grant  execute on function public.set_tour_done(boolean)   to authenticated;
