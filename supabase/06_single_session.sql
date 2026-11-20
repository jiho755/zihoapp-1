-- 한 계정은 한 기기에서만 로그인 상태를 유지: 새 기기에서 로그인하면 이전 기기는 로그아웃됩니다.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.

-- 1) 내 로그인 세션이 아직 살아 있는지 (앱이 주기적으로 확인)
create or replace function public.session_alive() returns boolean
language sql stable security definer set search_path = ''
as $$ select public._session_ok() $$;
revoke execute on function public.session_alive() from public, anon;
grant execute on function public.session_alive() to authenticated;

-- 2) 방금 로그인한 세션만 남기고 같은 계정의 다른 세션을 모두 종료
create or replace function public.revoke_other_sessions() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or v_sid is null then return; end if;
  delete from auth.sessions where user_id = auth.uid() and id <> v_sid;
end;
$$;
revoke execute on function public.revoke_other_sessions() from public, anon;
grant execute on function public.revoke_other_sessions() to authenticated;

-- 3) 종료된 세션(이전 기기)은 토큰이 남아 있어도 기록을 읽거나 쓸 수 없게 함
drop policy if exists "본인 기록 전체" on public.entries;
create policy "본인 기록 전체" on public.entries for all to authenticated
  using (user_id = (select auth.uid()) and (select public.session_alive()))
  with check (user_id = (select auth.uid()) and (select public.session_alive()));
