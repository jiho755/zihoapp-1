-- 이메일 표기를 앞 3글자 + *** 방식으로 변경 (예: komma0205@gmail.com → kom***@gmail.com)
-- 아이디 부분이 3글자 이하면 앞 1글자만 보여 줌 (예: ab@x.com → a***@x.com)
-- Supabase 대시보드 → SQL Editor 에서 한 번 실행하세요. 여러 번 실행해도 안전합니다.
create or replace function public._mask_email(p text) returns text
language sql immutable set search_path = ''
as $$
  select left(split_part(p, '@', 1), case when length(split_part(p, '@', 1)) > 3 then 3 else 1 end)
         || '***@' || split_part(p, '@', 2)
$$;
