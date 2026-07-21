/* =========================================================
   mba-trainer Worker
   ---------------------------------------------------------
   - Basic Auth (BASIC_AUTH_USER / BASIC_AUTH_PASS) vor jeder
     Anfrage, inkl. statischer Assets und /sync
   - /sync: Lernstand-Sync in KV (Binding PROGRESS), geschützt
     zusätzlich per SYNC_TOKEN (>= 12 Zeichen)
   - alles andere: Auslieferung der statischen Dateien (assets)
   ========================================================= */

const SYNC_KEY = 'progress';
const MAX_BYTES = 200000;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="mba-trainer", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

function isAuthorized(request, env) {
  const expectedUser = env.BASIC_AUTH_USER || '';
  const expectedPass = env.BASIC_AUTH_PASS || '';
  if (!expectedUser || !expectedPass) return null;

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;

  let decoded;
  try {
    decoded = atob(auth.slice(6));
  } catch (e) {
    return false;
  }

  const idx = decoded.indexOf(':');
  if (idx === -1) return false;

  const givenUser = decoded.slice(0, idx);
  const givenPass = decoded.slice(idx + 1);
  return safeEqual(givenUser, expectedUser) && safeEqual(givenPass, expectedPass);
}

async function handleSync(request, env) {
  const configured = env.SYNC_TOKEN || '';
  if (configured.length < 12) {
    return json({ error: 'token not configured — SYNC_TOKEN als Secret setzen (>= 12 Zeichen)' }, 500);
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
    const val = await env.PROGRESS.get(SYNC_KEY);
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
    await env.PROGRESS.put(SYNC_KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt: payload.updatedAt ?? null });
  }

  return json({ error: 'method not allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const authResult = isAuthorized(request, env);
    if (authResult === null) {
      return new Response(
        'Passwortschutz nicht konfiguriert — BASIC_AUTH_USER und BASIC_AUTH_PASS als Secrets setzen.',
        { status: 500 }
      );
    }
    if (!authResult) return unauthorized();

    const url = new URL(request.url);
    if (url.pathname === '/sync') return handleSync(request, env);

    return env.ASSETS.fetch(request);
  },
};
