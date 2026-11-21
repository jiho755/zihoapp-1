// AI 구절 해설 — Supabase Edge Function (Deno)
// 배포: supabase functions deploy ai --no-verify-jwt
//   (새 API 키(sb_publishable_)를 쓰는 프로젝트는 게이트웨이 JWT 검증을 끄고, 아래 코드에서 로그인을 직접 확인합니다)
// 비밀키: supabase secrets set GEMINI_API_KEY=AIza...
// (선택) 모델 바꾸기: GEMINI_MODEL=모델1,모델2  (쉼표로 여러 개 → 앞에서부터 시도, 혼잡하면 다음 모델)
import { createClient } from "npm:@supabase/supabase-js@2";

const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];  // 마지막 대안(별칭)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMITS: Record<string, number> = { explain: 20, summary: 5 };
const MAX_PROMPT = 6000;      // 해설 프롬프트 최대 글자 수
const MAX_TOKENS = 4096;      // 생각(thinking) 토큰이 포함될 수 있어 넉넉하게

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("GEMINI_API_KEY");
  const models = [...new Set([
    ...(Deno.env.get("GEMINI_MODEL") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    ...FALLBACK_MODELS,
  ])];
  if (!key) { console.error("GEMINI_API_KEY 없음"); return json({ error: "server" }, 500); }

  // 1) 로그인한 사용자 + 살아 있는 세션인지 확인
  const auth = req.headers.get("Authorization") ?? "";
  const me = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await me.auth.getUser();
  if (ue || !u?.user) { console.error("로그인 확인 실패", ue?.message); return json({ error: "login" }, 401); }
  const { data: alive } = await me.rpc("session_alive");
  if (alive !== true) { console.error("세션 만료", alive); return json({ error: "login" }, 401); }
  const uid = u.user.id;

  // 2) 입력 검사
  let body: { kind?: string; lang?: string; prompt?: string };
  try { body = await req.json(); } catch { return json({ error: "bad" }, 400); }
  const kind = body.kind ?? "";
  const prompt = String(body.prompt ?? "");
  const lang = ["ko", "en"].includes(body.lang ?? "") ? body.lang! : "ko";
  if (kind !== "explain") return json({ error: "bad" }, 400);   // 요약은 다음 단계
  if (!prompt.trim() || prompt.length > MAX_PROMPT) return json({ error: "bad" }, 400);

  const db = createClient(url, srv, { auth: { persistSession: false } });

  // 3) 같은 구절·주제·언어의 해설이 이미 있으면 한도 차감 없이 반환
  const hash = await sha256(kind + "|" + lang + "|" + prompt);
  const { data: hit } = await db.from("ai_cache").select("body").eq("hash", hash).maybeSingle();
  if (hit?.body) return json({ text: hit.body, cached: true });

  // 4) 월 한도 차감
  const { data: q, error: qe } = await db.rpc("ai_consume", { p_user: uid, p_kind: kind, p_limit: LIMITS[kind] });
  if (qe || !q) { console.error("ai_consume 실패", qe?.message); return json({ error: "server" }, 500); }
  if (!q.ok) return json({ error: "quota", used: q.used, limit: q.limit }, 429);

  // 5) Gemini 호출: 혼잡(429/500/503)이면 잠깐 쉬고 재시도, 모델이 없으면(404) 다음 모델
  try {
    let busy = false, tries = 0;
    for (const model of models) {
      for (let a = 0; a < 2 && tries < 5; a++, tries++) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "content-type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 },
            }),
          },
        );
        if (r.ok) {
          const j = await r.json();
          const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
          const text = parts.filter((x) => !x.thought && x.text).map((x) => x.text).join("").trim();
          if (!text) { console.error("Gemini 빈 응답", model, JSON.stringify(j).slice(0, 500)); break; }
          await db.from("ai_cache").upsert({ hash, kind, lang, body: text });
          return json({ text, used: q.used, limit: q.limit, model });
        }
        console.error("Gemini 오류", model, r.status, (await r.text()).slice(0, 300));
        if (r.status === 429 || r.status === 500 || r.status === 503) { busy = true; await sleep(1200 * (a + 1)); continue; }
        break;   // 404(모델 없음) 등 → 다음 모델
      }
    }
    await db.rpc("ai_refund", { p_user: uid, p_kind: kind });
    return json({ error: busy ? "busy" : "upstream" }, busy ? 429 : 502);
  } catch (e) {
    console.error("호출 실패", String(e));
    await db.rpc("ai_refund", { p_user: uid, p_kind: kind });
    return json({ error: "upstream" }, 502);
  }
});
