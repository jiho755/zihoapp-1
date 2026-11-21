// AI 구절 해설 — Supabase Edge Function (Deno)
// 배포: supabase functions deploy ai        (JWT 검증 켜둔 채로)
// 비밀키: supabase secrets set GEMINI_API_KEY=AIza...
// (선택) 모델 바꾸기: supabase secrets set GEMINI_MODEL=gemini-2.5-flash
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_MODEL = "gemini-2.5-flash";   // 무료로 쓸 수 있는 Flash 모델 (AI Studio에서 확인)
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
  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
  if (!key) return json({ error: "server" }, 500);

  // 1) 로그인한 사용자 + 살아 있는 세션인지 확인
  const auth = req.headers.get("Authorization") ?? "";
  const me = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await me.auth.getUser();
  if (ue || !u?.user) return json({ error: "login" }, 401);
  const { data: alive } = await me.rpc("session_alive");
  if (alive !== true) return json({ error: "login" }, 401);
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
  if (qe || !q) return json({ error: "server" }, 500);
  if (!q.ok) return json({ error: "quota", used: q.used, limit: q.limit }, 429);

  // 5) Gemini 호출 (실패하면 차감한 1회 환불)
  try {
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
    if (!r.ok) {
      await db.rpc("ai_refund", { p_user: uid, p_kind: kind });
      return json({ error: r.status === 429 ? "busy" : "upstream" }, r.status === 429 ? 429 : 502);
    }
    const j = await r.json();
    const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((x) => !x.thought && x.text).map((x) => x.text).join("").trim();
    if (!text) throw new Error("empty");
    await db.from("ai_cache").upsert({ hash, kind, lang, body: text });
    return json({ text, used: q.used, limit: q.limit });
  } catch (_e) {
    await db.rpc("ai_refund", { p_user: uid, p_kind: kind });
    return json({ error: "upstream" }, 502);
  }
});
