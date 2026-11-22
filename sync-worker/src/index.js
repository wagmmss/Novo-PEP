// ============================================================================
// NOVO-PEP CLOUD SYNC — Cloudflare Worker + KV
// Autenticação simples por senha única (Bearer) + controle de revisão (409)
// + rate limit anti-brute-force por IP. Zero e-mail, zero banco pesado.
// ============================================================================

const STATE_KEY = 'pep_state_v1';
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const RATE_LIMIT_MAX_FAILS = 8;
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutos

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wagmmss.github.io',
  'https://wagmms.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function getAllowedOrigins(env) {
  const extra = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

async function sha256Bytes(text) {
  const data = new TextEncoder().encode(String(text || ''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

async function constantTimeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) {
    diff |= ha[i] ^ hb[i];
  }
  return diff === 0;
}

function extractBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function isRateLimited(env, ip) {
  const raw = await env.PEP_SYNC_KV.get(`rl:${ip}`);
  const count = Number(raw || 0);
  return count >= RATE_LIMIT_MAX_FAILS;
}

async function recordAuthFailure(env, ip) {
  const key = `rl:${ip}`;
  const raw = await env.PEP_SYNC_KV.get(key);
  const next = Number(raw || 0) + 1;
  await env.PEP_SYNC_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
}

async function clearAuthFailures(env, ip) {
  await env.PEP_SYNC_KV.delete(`rl:${ip}`);
}

export default {
  async fetch(request, env) {
    const cors = buildCorsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'novo-pep-sync' }, 200, cors);
    }

    if (url.pathname !== '/sync') {
      return jsonResponse({ error: 'not_found' }, 404, cors);
    }

    if (!env.PEP_SYNC_KV || !env.SYNC_PASSWORD) {
      return jsonResponse(
        { error: 'server_misconfigured', message: 'Configure PEP_SYNC_KV e SYNC_PASSWORD no Worker.' },
        500,
        cors
      );
    }

    const ip = getClientIp(request);
    if (await isRateLimited(env, ip)) {
      return jsonResponse(
        { error: 'rate_limited', message: 'Muitas tentativas incorretas. Aguarde 15 minutos.' },
        429,
        cors
      );
    }

    const token = extractBearer(request);
    const valid = token.length > 0 && (await constantTimeEqual(token, env.SYNC_PASSWORD));
    if (!valid) {
      await recordAuthFailure(env, ip);
      return jsonResponse({ error: 'unauthorized', message: 'Senha incorreta.' }, 401, cors);
    }

    // Limpa contador de falhas após autenticação válida
    await clearAuthFailures(env, ip);

    if (request.method === 'GET') {
      const stored = await env.PEP_SYNC_KV.get(STATE_KEY, { type: 'json' });
      if (!stored) {
        return jsonResponse({ exists: false, revision: 0, updatedAt: null, payload: null }, 200, cors);
      }
      return jsonResponse(
        {
          exists: true,
          revision: Number(stored.revision) || 1,
          updatedAt: stored.updatedAt || null,
          payload: stored.payload || null,
        },
        200,
        cors
      );
    }

    if (request.method === 'PUT') {
      const contentLen = Number(request.headers.get('Content-Length') || 0);
      if (contentLen > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'payload_too_large', message: 'Backup excede 2 MB.' }, 413, cors);
      }

      let rawText;
      try {
        rawText = await request.text();
      } catch {
        return jsonResponse({ error: 'invalid_body', message: 'Falha ao ler corpo da requisição.' }, 400, cors);
      }
      if (rawText.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'payload_too_large', message: 'Backup excede 2 MB.' }, 413, cors);
      }

      let body;
      try {
        body = JSON.parse(rawText);
      } catch {
        return jsonResponse({ error: 'invalid_json', message: 'JSON malformado.' }, 400, cors);
      }

      const payload = body?.payload;
      if (!payload || typeof payload !== 'object' || payload.version !== 2) {
        return jsonResponse(
          { error: 'invalid_payload', message: 'Payload deve ser um Backup v2 válido.' },
          400,
          cors
        );
      }

      const baseRevision = Number.isInteger(body.baseRevision) ? body.baseRevision : 0;
      const force = body.force === true;

      const current = await env.PEP_SYNC_KV.get(STATE_KEY, { type: 'json' });
      const currentRevision = current ? Number(current.revision) || 1 : 0;

      if (!force && current && baseRevision !== currentRevision) {
        return jsonResponse(
          {
            error: 'conflict',
            message: 'A nuvem possui uma revisão diferente da sua base local.',
            revision: currentRevision,
            updatedAt: current.updatedAt || null,
            payload: current.payload || null,
          },
          409,
          cors
        );
      }

      const nextRevision = currentRevision + 1;
      const updatedAt = new Date().toISOString();
      await env.PEP_SYNC_KV.put(
        STATE_KEY,
        JSON.stringify({
          revision: nextRevision,
          updatedAt,
          payload,
        })
      );

      return jsonResponse({ ok: true, revision: nextRevision, updatedAt }, 200, cors);
    }

    return jsonResponse({ error: 'method_not_allowed' }, 405, cors);
  },
};
