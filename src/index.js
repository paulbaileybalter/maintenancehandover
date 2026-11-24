// Balter Brewing · Daily Maintenance Handover
// Cloudflare Worker: password login, session cookie, handover data in KV.
// Static files in /public are served through env.ASSETS, but only after the
// session check below (run_worker_first in wrangler.jsonc).

import {
  SECTIONS, SECTION_BY_KEY, META_FIELDS, DEFAULT_SERVICES, MAX_FIELD, MAX_ITEMS,
  emptyHandover, addDays,
} from '../public/lib/sections.js';

const COOKIE = 'bh_session';
const SESSION_DAYS = 14;
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/login.js', '/styles.css', '/logo.svg', '/favicon.svg', '/email-logo.png', '/robots.txt']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (err) {
      console.error(err);
      return withSecurityHeaders(json({ error: 'Something went wrong on the server.' }, 500));
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.HANDOVER_PASSWORD) {
    return new Response('Setup needed: add the HANDOVER_PASSWORD secret to this Worker (see README).', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (path === '/api/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/logout' && request.method === 'POST') return logout();

  if (PUBLIC_PATHS.has(path) || path.startsWith('/fonts/')) {
    if ((path === '/login' || path === '/login.html') && (await validSession(request, env))) return Response.redirect(new URL('/', url), 302);
    return env.ASSETS.fetch(request);
  }

  const authed = await validSession(request, env);
  if (!authed) {
    if (path.startsWith('/api/')) return json({ error: 'Signed out' }, 401);
    return Response.redirect(new URL('/login', url), 302);
  }

  if (path.startsWith('/api/')) {
    if (request.method !== 'GET' && !sameOrigin(request, url)) return json({ error: 'Bad origin' }, 403);
    if (path === '/api/handover' && request.method === 'GET') return getHandover(url, env);
    if (path === '/api/handover' && request.method === 'POST') return applyOp(request, env);
    return json({ error: 'Not found' }, 404);
  }

  const res = await env.ASSETS.fetch(request);
  // Signed-in pages should never be cached by a shared cache.
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-cache');
  return out;
}

// ---------------------------------------------------------------- auth

async function login(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = `rl:${ip}`;
  const tries = Number((await env.HANDOVER_KV.get(rlKey)) || 0);
  if (tries >= 10) return json({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);

  let password = '';
  try { ({ password = '' } = await request.json()); } catch { /* empty body */ }

  if (!(await safeEqual(String(password), env.HANDOVER_PASSWORD))) {
    await env.HANDOVER_KV.put(rlKey, String(tries + 1), { expirationTtl: 900 });
    return json({ error: 'That password didn’t work.' }, 401);
  }
  if (tries) await env.HANDOVER_KV.delete(rlKey);

  const exp = Date.now() + SESSION_DAYS * 86400e3;
  const token = `${exp}.${await sign(String(exp), env)}`;
  return json({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`,
  });
}

function logout() {
  return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}

async function validSession(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, await sign(exp, env));
}

// Sessions are signed with SESSION_SECRET if set, otherwise with the password,
// so changing the password signs everyone out.
async function sign(value, env) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET || `pw:${env.HANDOVER_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function safeEqual(a, b) {
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

// ---------------------------------------------------------------- data

const kvKey = (date) => `handover:${date}`;

async function readHandover(env, date) {
  const doc = await env.HANDOVER_KV.get(kvKey(date), 'json');
  if (!doc) return emptyHandover(date);
  for (const s of SECTIONS) doc.sections[s.key] ||= [];
  doc.meta ||= {};
  return doc;
}

async function getHandover(url, env) {
  const date = url.searchParams.get('date');
  if (!DATE_RE.test(date || '')) return json({ error: 'Bad date' }, 400);
  return json({ handover: await readHandover(env, date) });
}

const clean = (v, max = MAX_FIELD) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const newId = () => crypto.randomUUID().slice(0, 12);

function cleanItem(section, raw, existing) {
  const item = { id: existing?.id || (/^[\w-]{4,40}$/.test(raw?.id || '') ? raw.id : newId()) };
  for (const fld of section.fields) {
    let v = clean(raw?.[fld.key]);
    if (fld.type === 'select' && !fld.options.some((o) => o.value === v)) v = fld.default;
    if (fld.type === 'check') v = v && v !== '0' && v !== 'false' ? '1' : '';
    if (v) item[fld.key] = v;
  }
  if (!item.title) return null;
  if (raw?.src === 'fiix' || existing?.src === 'fiix') item.src = 'fiix';
  item.updatedAt = new Date().toISOString();
  return item;
}

// Changes arrive as small operations, not whole documents, so two people
// editing different items at the same time don't overwrite each other.
async function applyOp(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { date, op } = body || {};
  if (!DATE_RE.test(date || '') || !op || typeof op !== 'object') return json({ error: 'Bad request' }, 400);

  const doc = await readHandover(env, date);
  const section = SECTION_BY_KEY[op.section];

  switch (op.type) {
    case 'meta': {
      for (const m of META_FIELDS) if (op.data && m.key in op.data) doc.meta[m.key] = clean(op.data[m.key], m.max);
      break;
    }
    case 'upsert': {
      if (!section) return json({ error: 'Unknown section' }, 400);
      const list = doc.sections[section.key];
      const idx = list.findIndex((i) => i.id === op.item?.id);
      const item = cleanItem(section, op.item, idx >= 0 ? list[idx] : null);
      if (!item) return json({ error: `${section.fields[0].label} is needed.` }, 400);
      if (idx >= 0) list[idx] = item;
      else if (list.length >= MAX_ITEMS) return json({ error: 'That section is full.' }, 400);
      else list.push(item);
      break;
    }
    case 'delete': {
      if (!section) return json({ error: 'Unknown section' }, 400);
      doc.sections[section.key] = doc.sections[section.key].filter((i) => i.id !== op.id);
      break;
    }
    case 'import': {
      // Entries from a Fiix export. Matching ids update in place; anything the
      // team typed (owner, action, notes) is kept when Fiix has nothing for it.
      if (!Array.isArray(op.items) || op.items.length > 300) return json({ error: 'Bad import' }, 400);
      let added = 0, updated = 0;
      for (const { section: key, item: raw } of op.items) {
        const sec = SECTION_BY_KEY[key]; if (!sec || !raw) continue;
        // An entry may move section (e.g. planned job now completed): drop old copies.
        for (const s of SECTIONS) if (s.key !== key) doc.sections[s.key] = doc.sections[s.key].filter((i) => i.id !== raw.id);
        const list = doc.sections[key];
        const idx = list.findIndex((i) => i.id === raw.id);
        const prev = idx >= 0 ? list[idx] : null;
        const merged = prev ? { ...prev, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v != null)) } : { ...raw, src: 'fiix' };
        const item = cleanItem(sec, merged, prev);
        if (!item) continue;
        if (prev) { list[idx] = item; updated++; } else if (list.length < MAX_ITEMS) { list.push(item); added++; }
      }
      doc.meta.fiixAt = new Date().toISOString();
      doc.meta.fiixFile = clean(op.file, 120);
      doc.updatedAt = doc.meta.fiixAt;
      await env.HANDOVER_KV.put(kvKey(date), JSON.stringify(doc));
      return json({ handover: doc, imported: { added, updated } });
    }
    case 'seedChecks': {
      const list = doc.sections.critical;
      const have = new Set(list.map((i) => i.title.toLowerCase()));
      for (const title of DEFAULT_SERVICES) if (!have.has(title.toLowerCase())) list.push(cleanItem(SECTION_BY_KEY.critical, { title }));
      break;
    }
    case 'carry': {
      const prev = await findPrevious(env, date);
      if (!prev) return json({ error: 'No earlier handover found in the last 14 days.' }, 404);
      const added = carryOver(prev, doc);
      doc.updatedAt = new Date().toISOString();
      await env.HANDOVER_KV.put(kvKey(date), JSON.stringify(doc));
      return json({ handover: doc, carried: { from: prev.date, added } });
    }
    default:
      return json({ error: 'Unknown change' }, 400);
  }

  doc.updatedAt = new Date().toISOString();
  await env.HANDOVER_KV.put(kvKey(date), JSON.stringify(doc));
  return json({ handover: doc });
}

async function findPrevious(env, date) {
  for (let i = 1; i <= 14; i++) {
    const doc = await env.HANDOVER_KV.get(kvKey(addDays(date, -i)), 'json');
    if (doc && Object.values(doc.sections || {}).some((l) => l?.length)) return doc;
  }
  return null;
}

// GUESS at what should roll over to the next day. Running it twice does not
// duplicate anything, because carried items keep their id.
function carryOver(prev, doc) {
  let added = 0;
  const push = (key, item) => {
    const list = doc.sections[key];
    if (list.some((i) => i.id === item.id) || list.length >= MAX_ITEMS) return;
    const c = cleanItem(SECTION_BY_KEY[key], item);
    if (c) { list.push(c); added++; }
  };
  const P = prev.sections || {};

  // Same plant checks list, but every service needs checking again.
  const have = new Set(doc.sections.critical.map((i) => i.title.toLowerCase()));
  for (const i of P.critical || []) if (!have.has(i.title.toLowerCase())) push('critical', { id: i.id, title: i.title }); // fresh: unticked, no RAG

  // Breakdowns not fixed become outstanding issues.
  for (const i of P.breakdowns || []) {
    if (i.tag === 'Fixed') continue;
    push('outstanding', { id: `bd-${i.id}`.slice(0, 40), title: i.title, tag: i.tag === 'Temp fix' ? 'Temp fix' : 'Open breakdown', detail: [i.detail, i.cause && `Cause: ${i.cause}`].filter(Boolean).join(' · '), action: i.action, owner: i.owner });
  }
  for (const i of P.outstanding || []) push('outstanding', i);
  for (const i of P.workorders || []) if (i.tag !== 'Completed') push('workorders', i);
  for (const i of P.planned || []) {
    if (i.tag === 'Today') continue; // assume it happened; re-add if it slipped
    push('planned', { ...i, tag: i.tag === 'Tomorrow' ? 'Today' : 'Tomorrow' });
  }
  for (const i of P.contractors || []) if (i.tag !== 'Finished') push('contractors', { ...i, tag: 'Expected' });
  for (const i of P.parts || []) if (i.tag !== 'Arrived') push('parts', i);
  for (const i of P.safety || []) if (i.tag === 'Hazard' || i.tag === 'Concern') push('safety', i);
  return added;
}

// ---------------------------------------------------------------- helpers

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  const h = out.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'same-origin');
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('Strict-Transport-Security', 'max-age=31536000');
  if ((h.get('content-type') || '').includes('text/html')) {
    h.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }
  return out;
}
