-- 생명나무(말씀 묵상 노트) Supabase 테이블 설정
-- Supabase 대시보드 > SQL Editor에 붙여 넣고 Run

-- 1) 프로필: 닉네임
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique,
  created_at timestamptz not null default now()
);

-- 2) 기록: 묵상·예배 기록 (앱의 기록 1개 = 1행, 내용은 JSON 그대로)
create table public.entries (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 3) 복구코드: 암호화한 값만 저장, 앱에서는 읽을 수 없음
create table public.recovery_codes (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now()
);

-- 행 단위 보안(RLS): 본인 데이터만 접근
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.recovery_codes enable row level security;

create policy "본인 프로필 조회" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "본인 프로필 생성" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "본인 프로필 수정" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "본인 기록 전체" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "본인 복구코드 등록" on public.recovery_codes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "본인 복구코드 재발급" on public.recovery_codes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 4) 계정 삭제 (구글 플레이 필수): 로그인한 본인 계정과 모든 기록 삭제
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
