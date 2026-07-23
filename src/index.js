/* =========================================================
   mba-trainer Worker
   ---------------------------------------------------------
   - Basic Auth (BASIC_AUTH_USER / BASIC_AUTH_PASS) vor jeder
     Anfrage, inkl. statischer Assets und /sync
   - /sync: Lernstand-Sync in KV (Binding PROGRESS) — durch die
     Basic Auth oben bereits abgesichert, kein separates Token
     nötig, läuft dadurch für jede:n eingeloggte:n automatisch
   - alles andere: Auslieferung der statischen Dateien (assets)
   ========================================================= */

const SYNC_KEY = 'progress';
const MAX_BYTES = 200000;

// Capacitor-Android-App läuft unter diesen Ursprüngen und braucht CORS für /sync,
// da sie die App-Assets lokal lädt statt vom Worker selbst.
const ALLOWED_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost']);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  };
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

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
  if (!env.PROGRESS) {
    return json({ error: 'KV nicht gebunden — Namespace an Variable PROGRESS binden' }, 500);
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
    const url = new URL(request.url);
    const isSync = url.pathname === '/sync';
    const cors = isSync ? corsHeaders(request) : {};

    // Preflight darf laut CORS-Spec keine Auth-Header enthalten — vor dem Basic-Auth-Check beantworten.
    if (isSync && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const authResult = isAuthorized(request, env);
    if (authResult === null) {
      const resp = new Response(
        'Passwortschutz nicht konfiguriert — BASIC_AUTH_USER und BASIC_AUTH_PASS als Secrets setzen.',
        { status: 500 }
      );
      return isSync ? withCors(resp, cors) : resp;
    }
    if (!authResult) return isSync ? withCors(unauthorized(), cors) : unauthorized();

    if (isSync) return withCors(await handleSync(request, env), cors);

    return env.ASSETS.fetch(request);
  },
};
