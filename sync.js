/* =========================================================
   Lernstand-Sync als Cloudflare Pages Function
   ---------------------------------------------------------
   Route:  /sync   (Datei liegt unter functions/sync.js)
   Braucht im Pages-Projekt:
     - KV-Namespace, gebunden an die Variable  PROGRESS
     - Umgebungsvariable / Secret               SYNC_TOKEN  (>= 12 Zeichen)
   ========================================================= */

const KEY = 'progress';
const MAX_BYTES = 200000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// zeitkonstanter Vergleich (klein, aber sauber)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env } = context;

  const configured = env.SYNC_TOKEN || '';
  if (configured.length < 12) {
    return json({ error: 'token not configured — SYNC_TOKEN im Pages-Projekt setzen (>= 12 Zeichen)' }, 500);
  }
  if (!env.PROGRESS) {
    return json({ error: 'KV nicht gebunden — Namespace an Variable PROGRESS binden' }, 500);
  }

  const given =
    request.headers.get('X-Sync-Token') ||
    new URL(request.url).searchParams.get('token') ||
    '';
  if (!safeEqual(given, configured)) {
    return json({ error: 'forbidden' }, 403);
  }

  if (request.method === 'GET') {
    const val = await env.PROGRESS.get(KEY);
    return json({ data: val ? JSON.parse(val) : null });
  }

  if (request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ error: 'too large' }, 413);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return json({ error: 'invalid json' }, 400);
    }
    if (typeof payload !== 'object' || payload === null) {
      return json({ error: 'invalid json' }, 400);
    }
    await env.PROGRESS.put(KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt: payload.updatedAt ?? null });
  }

  return json({ error: 'method not allowed' }, 405);
}
