-- 5단계: 복구코드로 비밀번호 재설정 + 복구코드 재발급
-- Supabase 대시보드 > SQL Editor에 전체를 붙여 넣고 Run (여러 번 실행해도 안전)

create extension if not exists pgcrypto with schema extensions;

-- 잘못된 코드 입력 횟수 / 잠금 시각 (앱에서는 읽을 수 없는 테이블)
alter table public.recovery_codes
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until timestamptz;

-- 1) 로그인 전에 호출: 닉네임 + 복구코드가 맞으면 비밀번호를 바꾼다
--    결과: 'ok' | 'invalid'(닉네임 또는 코드 불일치) | 'locked'(잠김) | 'weak'(비밀번호 규칙 위반)
create or replace function public.reset_password_with_code(
  p_nickname text, p_code text, p_new_password text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_row public.recovery_codes%rowtype;
  v_hash text;
begin
  if p_new_password is null or length(p_new_password) < 8 or octet_length(p_new_password) > 72 then
    return 'weak';
  end if;

  select p.id into v_uid
    from public.profiles p
   where lower(p.nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_uid is null then
    return 'invalid';
  end if;

  select * into v_row from public.recovery_codes where user_id = v_uid for update;
  if not found then
    return 'invalid';
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return 'locked';
  end if;

  v_hash := encode(
    sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')),
    'hex'
  );

  if v_hash <> v_row.code_hash then
    update public.recovery_codes set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where user_id = v_uid;
    return 'invalid';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_uid;

  -- 이미 로그인된 모든 기기를 로그아웃시킨다
  delete from auth.sessions where user_id = v_uid;

  -- 사용한 코드는 바로 무효화 (64자리 해시와 절대 일치하지 않는 값)
  update public.recovery_codes set code_hash = 'used', failed_attempts = 0, locked_until = null where user_id = v_uid;
  return 'ok';
end;
$$;

revoke execute on function public.reset_password_with_code(text, text, text) from public;
grant execute on function public.reset_password_with_code(text, text, text) to anon, authenticated;

-- 2) 로그인 후 호출: 내 복구코드를 새 값(SHA-256 해시)으로 교체
create or replace function public.set_recovery_code(p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from auth.sessions where id = nullif(auth.jwt() ->> 'session_id', '')::uuid) then
    raise exception 'session revoked';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad hash';
  end if;
  insert into public.recovery_codes (user_id, code_hash, created_at, failed_attempts, locked_until)
  values (auth.uid(), p_hash, now(), 0, null)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash,
        created_at = now(),
        failed_attempts = 0,
        locked_until = null;
end;
$$;

revoke execute on function public.set_recovery_code(text) from public, anon;
grant execute on function public.set_recovery_code(text) to authenticated;

-- 3) 계정 삭제도 같은 방식으로 폐기된 세션을 거부하도록 보강
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
  if not exists (select 1 from auth.sessions where id = nullif(auth.jwt() ->> 'session_id', '')::uuid) then
    raise exception 'session revoked';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 4) 닉네임: 대소문자만 다른 중복 가입 방지 + 프로필 직접 수정 차단 (재설정이 엉뚱한 계정을 찾지 못하게)
create unique index if not exists profiles_nickname_lower_key on public.profiles (lower(nickname));
drop policy if exists "본인 프로필 수정" on public.profiles;
