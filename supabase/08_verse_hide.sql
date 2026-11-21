-- '오늘 하루 그만보기'(오늘의 말씀 팝업)를 계정 단위로 저장해 모든 기기에서 같게 적용합니다.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- (06_single_session.sql 을 먼저 실행해 두어야 합니다.)

create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  verse_hide text,                         -- 'YYYY-MM-DD' : 이 날짜에는 팝업을 보이지 않음
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;   -- 정책 없음: 아래 함수로만 읽고 씀
revoke all on table public.user_prefs from public, anon, authenticated;

create or replace function public.get_verse_hide() returns text
language sql stable security definer set search_path = ''
as $$
  select verse_hide from public.user_prefs
  where user_id = auth.uid() and public._session_ok();
$$;

create or replace function public.set_verse_hide(p_day text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public._session_ok() then return; end if;
  if p_day is not null and p_day !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'bad day';
  end if;
  insert into public.user_prefs(user_id, verse_hide, updated_at)
  values (auth.uid(), p_day, now())
  on conflict (user_id) do update set verse_hide = excluded.verse_hide, updated_at = now();
end;
$$;

revoke execute on function public.get_verse_hide()      from public, anon;
revoke execute on function public.set_verse_hide(text)  from public, anon;
grant  execute on function public.get_verse_hide()      to authenticated;
grant  execute on function public.set_verse_hide(text)  to authenticated;
