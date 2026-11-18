-- 6단계: 이메일 인증 (가입 시 이메일 등록 + 이메일 인증번호로 복구코드 재발급)
-- Supabase 대시보드 > SQL Editor에 전체를 붙여 넣고 Run (여러 번 실행해도 안전)
--
-- ⚠ 이 파일만으로는 메일이 나가지 않아요. 아래 "메일 발송 설정"의 두 줄을 따로 실행해야 해요.
--   (API 키는 절대 채팅이나 GitHub에 올리지 말고, SQL Editor에 직접 붙여 넣으세요.)

create extension if not exists pg_net;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── 테이블 ─────────────────────────
-- 인증이 끝난 이메일 (앱에서 직접 읽거나 쓸 수 없고, 아래 함수로만 접근)
create table if not exists public.account_emails (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  verified_at timestamptz not null default now()
);

-- 인증번호 발급 기록 (인증번호 자체는 저장하지 않고 해시만 저장)
create table if not exists public.email_codes (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('register', 'reissue')),
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_codes_user_idx on public.email_codes (user_id, created_at desc);
create index if not exists email_codes_email_idx on public.email_codes (email, created_at desc);

alter table public.account_emails enable row level security;
alter table public.email_codes enable row level security;
revoke all on public.account_emails from anon, authenticated;
revoke all on public.email_codes from anon, authenticated;

-- ───────────────────────── 내부 함수 (앱에서 호출 불가) ─────────────────────────
create or replace function public._mask_email(p text) returns text
language sql immutable set search_path = ''
as $$ select left(split_part(p, '@', 1), 1) || '***@' || split_part(p, '@', 2) $$;

create or replace function public._new_code() returns text
language sql volatile set search_path = ''
as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

create or replace function public._code_hash(p_id uuid, p_code text) returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_id::text || ':' || p_code, 'UTF8')), 'hex') $$;

-- Resend로 메일 보내기 (키와 보내는 주소는 Vault에 저장된 값을 사용)
create or replace function public._send_code_mail(p_email text, p_code text, p_purpose text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_from text;
  v_what text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into v_from from vault.decrypted_secrets where name = 'mail_from';
  if v_key is null or v_from is null then
    raise exception 'mail not configured';
  end if;
  v_what := case p_purpose
    when 'register' then '이메일 등록'
    else '복구코드 재발급'
  end;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', v_from,
      'to', jsonb_build_array(p_email),
      'subject', '[생명나무] 인증번호 ' || p_code,
      'text', '생명나무 ' || v_what || ' 인증번호: ' || p_code || E'\n\n10분 안에 앱에 입력해 주세요.\n본인이 요청하지 않았다면 이 메일은 무시하셔도 돼요.'
    )
  );
end;
$$;

-- 로그인 세션이 아직 살아 있는지 (비밀번호 재설정으로 세션이 지워졌다면 false)
create or replace function public._session_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from auth.sessions where id = nullif(auth.jwt() ->> 'session_id', '')::uuid);
$$;
revoke execute on function public._session_ok() from public, anon, authenticated;

-- 인증번호 발급: 'sent' | 'cooldown'(방금 보냄) | 'rate'(너무 자주)
create or replace function public._issue_code(p_user uuid, p_email text, p_purpose text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  -- 같은 계정/같은 이메일로 동시에 여러 번 요청해도 한 번에 하나씩만 처리
  perform pg_advisory_xact_lock(hashtext('code:' || p_user::text));
  perform pg_advisory_xact_lock(hashtext('mail:' || p_email));
  delete from public.email_codes where created_at < now() - interval '2 days';
  if exists (select 1 from public.email_codes where user_id = p_user and created_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  if (select count(*) from public.email_codes where user_id = p_user and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.email_codes where user_id = p_user and created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.email_codes where email = p_email and created_at > now() - interval '1 hour') >= 5 then
    return 'rate';
  end if;

  -- 이전에 보낸 같은 용도의 인증번호는 무효화
  update public.email_codes set used_at = now()
   where user_id = p_user and purpose = p_purpose and used_at is null;

  v_code := public._new_code();
  insert into public.email_codes (id, purpose, user_id, email, code_hash, expires_at)
  values (v_id, p_purpose, p_user, p_email, public._code_hash(v_id, v_code), now() + interval '10 minutes');

  perform public._send_code_mail(p_email, v_code, p_purpose);   -- 실패하면 위 기록도 함께 취소됨
  return 'sent';
end;
$$;

-- 인증번호 확인: 'ok' | 'invalid' | 'locked'(24시간 안에 10번 이상 틀림)
create or replace function public._check_code(p_user uuid, p_purpose text, p_email text, p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.email_codes%rowtype;
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
begin
  select * into v_row from public.email_codes
   where user_id = p_user and purpose = p_purpose and used_at is null and expires_at > now()
     and (p_email is null or email = p_email)
   order by created_at desc limit 1
   for update;
  if not found then
    return 'invalid';
  end if;

  if (select coalesce(sum(attempts), 0) from public.email_codes
       where user_id = p_user and created_at > now() - interval '1 day') >= 10 then
    return 'locked';
  end if;

  if length(v_code) <> 6 or v_row.code_hash <> public._code_hash(v_row.id, v_code) then
    update public.email_codes
       set attempts = attempts + 1,
           used_at = case when attempts + 1 >= 5 then now() else used_at end
     where id = v_row.id;
    return 'invalid';
  end if;

  update public.email_codes set used_at = now() where id = v_row.id;
  return 'ok';
end;
$$;

revoke execute on function public._mask_email(text) from public, anon, authenticated;
revoke execute on function public._new_code() from public, anon, authenticated;
revoke execute on function public._code_hash(uuid, text) from public, anon, authenticated;
revoke execute on function public._send_code_mail(text, text, text) from public, anon, authenticated;
revoke execute on function public._issue_code(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._check_code(uuid, text, text, text) from public, anon, authenticated;

-- ───────────────────────── 앱에서 호출하는 함수 ─────────────────────────
-- (로그인 후) 내 이메일을 가려서 보여 줌. 등록 전이면 null
create or replace function public.my_email() returns text
language plpgsql security definer set search_path = ''
as $$
declare v_mail text;
begin
  if not public._session_ok() then raise exception 'not signed in'; end if;
  select email into v_mail from public.account_emails where user_id = auth.uid();
  return case when v_mail is null then null else public._mask_email(v_mail) end;
end;
$$;

-- (로그인 후) 이메일 등록 1단계: 인증번호 보내기 → 'sent' | 'cooldown' | 'rate' | 'bad_email' | 'already'
create or replace function public.request_email_registration(p_email text) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_mail text := lower(trim(coalesce(p_email, '')));
begin
  if not public._session_ok() then raise exception 'not signed in'; end if;
  if length(v_mail) > 254 or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 'bad_email';
  end if;
  if exists (select 1 from public.account_emails where user_id = auth.uid()) then
    return 'already';
  end if;
  return public._issue_code(auth.uid(), v_mail, 'register');
end;
$$;

-- (로그인 후) 이메일 등록 2단계: 인증번호 확인 → 'ok' | 'invalid' | 'locked'
create or replace function public.confirm_email_registration(p_email text, p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_mail text := lower(trim(coalesce(p_email, '')));
  v_res text;
begin
  if not public._session_ok() then raise exception 'not signed in'; end if;
  v_res := public._check_code(auth.uid(), 'register', v_mail, p_code);
  if v_res = 'ok' then
    insert into public.account_emails (user_id, email, verified_at)
    values (auth.uid(), v_mail, now())
    on conflict (user_id) do update set email = excluded.email, verified_at = now();
  end if;
  return v_res;
end;
$$;

-- (로그인 전/후) 복구코드 재발급 1단계: 닉네임의 이메일로 인증번호 보내기
-- 계정이 있든 없든 항상 'sent'를 돌려줘서 계정 존재 여부가 드러나지 않게 함
create or replace function public.request_code_reissue(p_nickname text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_mail text;
begin
  select p.id, e.email into v_uid, v_mail
    from public.profiles p
    join public.account_emails e on e.user_id = p.id
   where lower(p.nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_uid is not null then
    begin
      perform public._issue_code(v_uid, v_mail, 'reissue');
    exception when others then
      null;
    end;
  end if;
  return 'sent';
end;
$$;

-- (로그인 전/후) 복구코드 재발급 2단계: 인증번호가 맞으면 새 복구코드(해시)로 교체 → 'ok' | 'invalid'
create or replace function public.reissue_code_with_email(p_nickname text, p_otp text, p_new_hash text) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;
begin
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  select id into v_uid from public.profiles where lower(nickname) = lower(trim(coalesce(p_nickname, '')));
  if v_uid is null then
    return 'invalid';
  end if;
  if public._check_code(v_uid, 'reissue', null, p_otp) <> 'ok' then
    return 'invalid';
  end if;
  insert into public.recovery_codes (user_id, code_hash, created_at, failed_attempts, locked_until)
  values (v_uid, p_new_hash, now(), 0, null)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, created_at = now(), failed_attempts = 0, locked_until = null;
  return 'ok';
end;
$$;

revoke execute on function public.my_email() from public, anon;
revoke execute on function public.request_email_registration(text) from public, anon;
revoke execute on function public.confirm_email_registration(text, text) from public, anon;
revoke execute on function public.request_code_reissue(text) from public;
revoke execute on function public.reissue_code_with_email(text, text, text) from public;
grant execute on function public.my_email() to authenticated;
grant execute on function public.request_email_registration(text) to authenticated;
grant execute on function public.confirm_email_registration(text, text) to authenticated;
grant execute on function public.request_code_reissue(text) to anon, authenticated;
grant execute on function public.reissue_code_with_email(text, text, text) to anon, authenticated;

-- ───────────────────────── 복구코드 변경 경로 정리 ─────────────────────────
-- 로그인만으로 복구코드를 바꿀 수 있으면 이메일 인증이 의미가 없으므로,
--  · 직접 수정(UPDATE) 권한을 없애고
--  · set_recovery_code 는 "코드가 아직 없거나, 방금 비밀번호 재설정으로 사용 처리된('used') 경우"에만 허용
--    (가입 직후 / 재설정 직후의 새 코드 저장용). 그 밖의 재발급은 이메일 인증(reissue_code_with_email)으로만 가능.
drop policy if exists "본인 복구코드 재발급" on public.recovery_codes;

create or replace function public.set_recovery_code(p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_cur text;
begin
  if not public._session_ok() then
    raise exception 'session revoked';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad hash';
  end if;
  select code_hash into v_cur from public.recovery_codes where user_id = auth.uid() for update;
  if found and v_cur <> 'used' then
    raise exception 'not allowed';
  end if;
  insert into public.recovery_codes (user_id, code_hash, created_at, failed_attempts, locked_until)
  values (auth.uid(), p_hash, now(), 0, null)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, created_at = now(), failed_attempts = 0, locked_until = null;
end;
$$;
revoke execute on function public.set_recovery_code(text) from public, anon;
grant execute on function public.set_recovery_code(text) to authenticated;

-- ───────────────────────── 메일 발송 설정 (직접 값을 바꿔서 한 번만 실행) ─────────────────────────
-- 아래 두 줄의 주석(--)을 지우고, 값을 본인 것으로 바꿔서 실행하세요. (이미 만들었다면 Vault 화면에서 수정)
--   Resend API 키:  Resend 대시보드 > API Keys
--   보내는 주소:    Resend에서 인증한 도메인의 주소. 예) 생명나무 <noreply@내도메인.com>
--                   (도메인 인증 전 테스트용: 생명나무 <onboarding@resend.dev> — 이때는 Resend 가입 이메일로만 발송돼요)
--
-- select vault.create_secret('re_여기에_API키', 'resend_api_key');
-- select vault.create_secret('생명나무 <noreply@내도메인.com>', 'mail_from');
