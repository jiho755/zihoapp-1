-- AI 해설: 월별 사용 한도(해설 20회 / 요약 5회)와 해설 캐시.
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.
-- 두 테이블과 함수는 서버(Edge Function, service_role)만 사용합니다. 앱(anon/authenticated)은 직접 접근할 수 없습니다.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month   text not null,                 -- 'YYYY-MM' (한국 시간 기준)
  kind    text not null check (kind in ('explain','summary')),
  n       int  not null default 0,
  primary key (user_id, month, kind)
);
alter table public.ai_usage enable row level security;      -- 정책 없음 = 앱에서 접근 불가

create table if not exists public.ai_cache (
  hash       text primary key,           -- 프롬프트 SHA-256
  kind       text not null,
  lang       text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;      -- 정책 없음 = 앱에서 접근 불가

-- 한도 안이면 1회 차감하고 {ok:true,used,limit}, 초과면 {ok:false,used,limit}
create or replace function public.ai_consume(p_user uuid, p_kind text, p_limit int)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_m text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'); v_n int;
begin
  insert into public.ai_usage(user_id, month, kind, n) values (p_user, v_m, p_kind, 0)
    on conflict (user_id, month, kind) do nothing;
  update public.ai_usage set n = n + 1
    where user_id = p_user and month = v_m and kind = p_kind and n < p_limit
    returning n into v_n;
  if v_n is null then
    select n into v_n from public.ai_usage where user_id = p_user and month = v_m and kind = p_kind;
    return jsonb_build_object('ok', false, 'used', v_n, 'limit', p_limit);
  end if;
  return jsonb_build_object('ok', true, 'used', v_n, 'limit', p_limit);
end;
$$;

-- AI 호출이 실패했을 때 차감한 1회를 되돌림
create or replace function public.ai_refund(p_user uuid, p_kind text)
returns void language sql security definer set search_path = ''
as $$
  update public.ai_usage set n = greatest(n - 1, 0)
  where user_id = p_user and kind = p_kind and month = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
$$;

revoke all on table public.ai_usage, public.ai_cache from public, anon, authenticated;
revoke execute on function public.ai_consume(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.ai_refund(uuid, text)       from public, anon, authenticated;
grant  execute on function public.ai_consume(uuid, text, int) to service_role;
grant  execute on function public.ai_refund(uuid, text)       to service_role;
grant  select, insert, update on table public.ai_usage, public.ai_cache to service_role;
