-- 생명나무 / 말씀 묵상 노트 — 관리자 도움 절차 (복구코드와 이메일을 모두 잃어버린 사용자용)
--
-- 이 파일은 "실행해서 설정"하는 파일이 아니라, 필요할 때 한 블록씩 Supabase SQL Editor에 붙여넣어 쓰는 메모예요.
-- 반드시 본인 확인을 한 뒤에만 사용하세요. (예: 사용자가 기억하는 가입 시기·닉네임·남긴 기록 내용 등)
-- 이 절차는 사용자의 기록(entries)은 건드리지 않고, 비밀번호·복구코드·이메일 등록만 바꿔요.
-- 아래 '닉네임' 부분을 실제 값으로 바꾸세요. 바꾼 쿼리는 저장하지 마세요.
--
-- ★ 권장 순서 (관리자가 사용자의 비밀번호를 몰라도 되는 방법)
--   ① 사용자 찾기 → ③ 새 복구코드 만들기 → 사용자에게 코드를 전달
--   → 사용자가 앱의 "비밀번호를 잊으셨나요?"에서 닉네임 + 새 복구코드로 직접 새 비밀번호를 정함
--   (앱에 비밀번호 변경 메뉴가 따로 없어서, 복구코드로 재설정하는 길이 유일한 변경 방법이에요)
--   이메일에도 접근할 수 없는 사용자라면 ④도 실행해요. 다음 로그인 때 새 이메일을 등록하게 돼요.
--   ②(임시 비밀번호)는 사용자가 앱을 아예 열 수 없는 등 예외 상황에서만 쓰세요.

-- ① 사용자 찾기 (닉네임은 대소문자 구분 없이 찾아요)
select p.id, p.nickname, ae.email is not null as has_email, ae.verified_at
from public.profiles p
left join public.account_emails ae on ae.user_id = p.id
where lower(p.nickname) = lower('닉네임');

-- ② 비밀번호를 임시 비밀번호로 바꾸고, 기존 로그인(세션)을 모두 끊기
--    (예외용) 임시 비밀번호는 8~72바이트예요. 사용자에게 안전한 방법으로 전달하고, 로그인한 뒤
--    ③의 새 복구코드로 "비밀번호를 잊으셨나요?"에서 본인 비밀번호로 다시 정하게 하세요.
--    쓰지 않을 거라면 이 블록은 건너뛰어도 돼요. (③ 실행 시 사용자 로그인 상태는 유지돼요)
with u as (select id from public.profiles where lower(nickname) = lower('닉네임'))
update auth.users
   set encrypted_password = extensions.crypt('임시비밀번호', extensions.gen_salt('bf')),
       updated_at = now()
 where id = (select id from u);

delete from auth.sessions
 where user_id = (select id from public.profiles where lower(nickname) = lower('닉네임'));

-- ③ 새 복구코드 만들어서 저장하기 — 실행하면 결과에 새 복구코드가 한 번 표시돼요. 그대로 사용자에게 전달하세요.
--    (앱에는 XXXX-XXXX-XXXX 모양으로 보이지만, 여기서는 12자로 나와요. 그대로 입력해도 돼요.)
with p as (select id from public.profiles where lower(nickname) = lower('닉네임')),
     c as (
       select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1), '') as code
       from generate_series(1, 12)
     ),
     up as (
       insert into public.recovery_codes (user_id, code_hash, created_at, failed_attempts, locked_until)
       select p.id, encode(extensions.digest(c.code, 'sha256'), 'hex'), now(), 0, null from p, c
       on conflict (user_id) do update
         set code_hash = excluded.code_hash, created_at = now(), failed_attempts = 0, locked_until = null
       returning user_id
     )
select c.code as new_recovery_code from c, up;

-- ④ (이메일도 접근할 수 없을 때) 등록된 이메일 지우기
--    다음 로그인 때 새 이메일 등록 창이 떠서, 새 이메일로 다시 인증해요.
delete from public.account_emails
 where user_id = (select id from public.profiles where lower(nickname) = lower('닉네임'));
