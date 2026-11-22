// AI 구절 해설 — Supabase Edge Function (Deno)
// 배포: supabase functions deploy ai --no-verify-jwt
//   (새 API 키(sb_publishable_)를 쓰는 프로젝트는 게이트웨이 JWT 검증을 끄고, 아래 코드에서 로그인을 직접 확인합니다)
// 비밀키: supabase secrets set GEMINI_API_KEY=AIza...
// (선택) 모델 바꾸기: GEMINI_MODEL=모델1,모델2  (쉼표로 여러 개 → 앞에서부터 시도, 혼잡하면 다음 모델)
import { createClient } from "npm:@supabase/supabase-js@2";

const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];  // 마지막 대안(별칭)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMITS: Record<string, number> = { explain: 0, summary: 5 };   // 0 = 무제한 (월 한도 없음)
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

  // 1) 입력 검사
  let body: { kind?: string; lang?: string; prompt?: string; stream?: boolean };
  try { body = await req.json(); } catch { return json({ error: "bad" }, 400); }
  const kind = body.kind ?? "";
  const prompt = String(body.prompt ?? "");
  const lang = ["ko", "en"].includes(body.lang ?? "") ? body.lang! : "ko";
  const wantStream = body.stream === true;
  if (kind !== "explain") return json({ error: "bad" }, 400);   // 요약은 다음 단계
  if (!prompt.trim() || prompt.length > MAX_PROMPT) return json({ error: "bad" }, 400);

  // 2) 로그인 확인·세션 확인·캐시 조회를 동시에 (기다리는 시간 단축)
  const auth = req.headers.get("Authorization") ?? "";
  const me = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const db = createClient(url, srv, { auth: { persistSession: false } });
  const hash = await sha256(kind + "|" + lang + "|" + prompt);
  const [ur, ar, cr] = await Promise.all([
    me.auth.getUser(),
    me.rpc("session_alive"),
    db.from("ai_cache").select("body").eq("hash", hash).maybeSingle(),
  ]);
  if (ur.error || !ur.data?.user) { console.error("로그인 확인 실패", ur.error?.message); return json({ error: "login" }, 401); }
  if (ar.data !== true) { console.error("세션 만료", ar.data); return json({ error: "login" }, 401); }
  const uid = ur.data.user.id;

  // 3) 같은 구절·주제·언어의 해설이 이미 있으면 바로 반환
  if (cr.data?.body) return json({ text: cr.data.body, cached: true });

  // 4) 월 한도 차감 (0이면 무제한)
  const limited = (LIMITS[kind] ?? 0) > 0;
  let q: { ok: boolean; used: number | null; limit: number | null } = { ok: true, used: null, limit: null };
  if (limited) {
    const { data, error: qe } = await db.rpc("ai_consume", { p_user: uid, p_kind: kind, p_limit: LIMITS[kind] });
    if (qe || !data) { console.error("ai_consume 실패", qe?.message); return json({ error: "server" }, 500); }
    q = data;
    if (!q.ok) return json({ error: "quota", used: q.used, limit: q.limit }, 429);
  }
  const refund = async () => { if (limited) await db.rpc("ai_refund", { p_user: uid, p_kind: kind }); };
  const save = (text: string) => db.from("ai_cache").upsert({ hash, kind, lang, body: text });
  const textOf = (j: unknown) => {
    // deno-lint-ignore no-explicit-any
    const parts: { text?: string; thought?: boolean }[] = (j as any)?.candidates?.[0]?.content?.parts ?? [];
    return parts.filter((x) => !x.thought && x.text).map((x) => x.text).join("");
  };

  // 5) Gemini 호출
  //    - 생각(thinking) 단계는 '낮음'으로 줄여 첫 글자가 빨리 나오게 함 (지원하지 않는 모델이면 빼고 다시 시도)
  //    - 혼잡(429/500/503)이면 잠깐 쉬고 재시도, 모델이 없으면(404) 다음 모델
  //    - 스트리밍 요청이면 글자가 만들어지는 대로 앱에 바로 흘려보냄
  try {
    let busy = false, tries = 0;
    for (const model of models) {
      let think = true;
      for (let a = 0; a < 3 && tries < 7; a++, tries++) {
        const gc: Record<string, unknown> = { maxOutputTokens: MAX_TOKENS, temperature: 0.7 };
        if (think) gc.thinkingConfig = { thinkingLevel: "low" };
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:` +
            (wantStream ? "streamGenerateContent?alt=sse" : "generateContent"),
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "content-type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gc }),
          },
        );
        if (!r.ok) {
          const err = (await r.text()).slice(0, 300);
          console.error("Gemini 오류", model, r.status, think ? "(thinking low)" : "", err);
          if (r.status === 400 && think) { think = false; continue; }   // 생각 설정 미지원 → 빼고 다시
          if (r.status === 429 || r.status === 500 || r.status === 503) { busy = true; await sleep(1000 * (a + 1)); continue; }
          break;   // 404(모델 없음) 등 → 다음 모델
        }
        if (!wantStream) {
          const text = textOf(await r.json()).trim();
          if (!text) { console.error("Gemini 빈 응답", model); break; }
          await save(text);
          return json({ text, used: q.used, limit: q.limit, model });
        }
        // 스트리밍: Gemini SSE → 앱에는 해설 글자만 그대로 전달
        const src = r.body!.getReader();
        const dec = new TextDecoder(), enc = new TextEncoder();
        let buf = "", full = "";
        const out = new ReadableStream({
          async pull(ctrl) {
            try {
              while (true) {
                const { done, value } = await src.read();
                if (done) {
                  const last = buf.trim();
                  if (last.startsWith("data:")) {
                    try { const piece = textOf(JSON.parse(last.slice(5))); if (piece) { full += piece; ctrl.enqueue(enc.encode(piece)); } } catch { /* 무시 */ }
                  }
                  const t = full.trim();
                  if (t) await save(t); else { console.error("Gemini 빈 스트림", model); await refund(); }
                  ctrl.close();
                  return;
                }
                buf += dec.decode(value, { stream: true });
                let i: number, sent = false;
                while ((i = buf.indexOf("\n")) >= 0) {
                  const line = buf.slice(0, i).trim();
                  buf = buf.slice(i + 1);
                  if (!line.startsWith("data:")) continue;
                  try {
                    const piece = textOf(JSON.parse(line.slice(5)));
                    if (piece) { full += piece; ctrl.enqueue(enc.encode(piece)); sent = true; }
                  } catch { /* 조각이 덜 온 줄은 무시 */ }
                }
                if (sent) return;
              }
            } catch (e) {
              console.error("스트림 중단", String(e));
              ctrl.close();
            }
          },
          cancel() { src.cancel().catch(() => {}); },
        });
        return new Response(out, {
          headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Model": model },
        });
      }
    }
    await refund();
    return json({ error: busy ? "busy" : "upstream" }, busy ? 429 : 502);
  } catch (e) {
    console.error("호출 실패", String(e));
    await refund();
    return json({ error: "upstream" }, 502);
  }
});
