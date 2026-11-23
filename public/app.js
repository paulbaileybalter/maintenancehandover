import { SECTIONS, SECTION_BY_KEY, META_FIELDS, tagInfo, sortedItems, summary, longDate, shortDate, brisbaneToday, addDays, bneTime } from './lib/sections.js';
import { buildEmail, copyHtml, downloadHtml, esc } from './lib/email.js';

const $ = (id) => document.getElementById(id);
const state = { date: null, h: null, editing: null, syncedAt: null, error: '' };

// ---------- server ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Request failed');
  return j;
}
const send = (op) => api('/api/handover', { method: 'POST', body: JSON.stringify({ date: state.date, op }) });

let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

// ---------- rendering ----------
function pill(opt) { return opt ? `<span class="pill" style="background:${opt.colour[0]};color:${opt.colour[1]}">${esc(opt.value)}</span>` : ''; }

function itemHtml(section, it) {
  const label = (k) => section.fields.find((f) => f.key === k)?.label || '';
  const line = (k, bold) => (it[k] ? `<div class="it-line">${bold ? `<b>${esc(label(k))}:</b> ` : ''}${esc(it[k])}</div>` : '');
  return `<button class="item" data-id="${esc(it.id)}" title="Edit">
    <span class="it-tag">${pill(tagInfo(section, it.tag))}</span>
    <span class="it-main"><span class="it-title">${esc(it.title)}${it.extra ? `<span class="it-extra"> · ${esc(label('extra'))}: ${esc(it.extra)}</span>` : ''}</span>
      ${line('detail', section.key === 'breakdowns')}${line('cause', true)}${line('action', true)}</span>
    <span class="it-owner">${it.owner ? `<span class="owner">👤 ${esc(it.owner)}</span>` : ''}</span>
  </button>`;
}

function formHtml(section, it) {
  const isNew = !it.id;
  const fields = section.fields.map((f) => {
    if (f.type === 'select') {
      const cur = it.tag || f.default;
      return `<div class="ff full"><span>${esc(f.label)}</span><div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${f.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === cur}" data-v="${esc(o.value)}" style="--c:${o.colour[0]};--t:${o.colour[1]}">${esc(o.value)}</button>`).join('')}</div></div>`;
    }
    return `<label class="ff ${f.short ? '' : 'full'}"><span>${esc(f.label)}</span><input name="${f.key}" value="${esc(it[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" maxlength="400" ${f.owner ? 'list="owners"' : ''} ${f.required ? 'required' : ''}></label>`;
  }).join('');
  return `<form class="edit" data-section="${section.key}" data-id="${esc(it.id || '')}">
    <div class="ff-grid">${fields}</div>
    <div class="edit-bar">
      ${isNew ? '' : '<button type="button" class="btn small danger" data-act="delete">Delete</button>'}
      <span class="spacer"></span>
      <button type="button" class="btn small ghost" data-act="cancel">Cancel</button>
      <button type="submit" class="btn small teal">${isNew ? 'Add' : 'Save'}</button>
    </div>
  </form>`;
}

function sectionHtml(section) {
  const items = sortedItems(section, state.h.sections[section.key] || []);
  const ed = state.editing?.section === section.key ? state.editing : null;
  const rows = items.map((it) => (ed?.id === it.id ? formHtml(section, it) : itemHtml(section, it))).join('');
  const empty = !items.length && !(ed && !ed.id)
    ? `<div class="empty">Nothing to report.${section.key === 'critical' ? ' <button class="linkbtn" data-act="seed">Start today’s plant checks</button>' : ''}</div>` : '';
  return `<section class="card" id="sec-${section.key}" style="--accent:${section.accent}">
    <div class="card-head">
      <span class="ico">${section.icon}</span>
      <h3>${esc(section.title)} <small>${esc(section.blurb)}</small></h3>
      <span class="count">${items.length || ''}</span>
      <button class="btn small add" data-act="add" aria-label="Add to ${esc(section.title)}">＋ Add</button>
    </div>
    ${ed && !ed.id ? formHtml(section, { tag: undefined }) : ''}
    ${rows}${empty}
  </section>`;
}

function renderSection(key) {
  const el = $(`sec-${key}`);
  const tmp = document.createElement('div'); tmp.innerHTML = sectionHtml(SECTION_BY_KEY[key]);
  el.replaceWith(tmp.firstElementChild);
}

function renderSummary() {
  $('summary').innerHTML = summary(state.h).map((t) => `<div class="tile" style="--c:${t.colour}"><b>${t.value}</b><span>${esc(t.label)}</span></div>`).join('');
}

function renderOwners() {
  const names = new Set();
  for (const list of Object.values(state.h.sections)) for (const i of list) if (i.owner) names.add(i.owner);
  for (const k of ['preparedBy', 'handoverTo']) if (state.h.meta[k]) names.add(state.h.meta[k]);
  try { for (const n of JSON.parse(localStorage.getItem('owners') || '[]')) names.add(n); } catch { /* storage blocked */ }
  try { localStorage.setItem('owners', JSON.stringify([...names].slice(-40))); } catch { /* storage blocked */ }
  $('owners').innerHTML = [...names].sort().map((n) => `<option value="${esc(n)}">`).join('');
}

function renderMeta() {
  for (const f of META_FIELDS) {
    const el = $(`m_${f.key}`);
    if (document.activeElement !== el && !metaDirty.has(f.key)) el.value = state.h.meta[f.key] || '';
  }
  growHeadline();
}
function growHeadline() { const t = $('m_headline'); t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; }

function renderChips() {
  const today = brisbaneToday();
  const when = state.date === today ? 'Today' : state.date === addDays(today, -1) ? 'Yesterday' : shortDate(state.date);
  const chips = [`<span class="chip"><i style="background:var(--purple)"></i><b>${when}</b> ${esc(longDate(state.date))}</span>`];
  chips.push(state.error
    ? `<span class="chip warn"><i></i><b>Offline</b> ${esc(state.error)}</span>`
    : `<span class="chip"><i></i><b>In sync</b> ${state.h.updatedAt ? `last change ${bneTime(state.h.updatedAt)}` : 'nothing saved for this day yet'}</span>`);
  if (state.date === today) chips.push('<span class="chip off"><i style="background:var(--gold)"></i>Send after the afternoon plant checks</span>');
  $('chips').innerHTML = chips.join('');
}

function render({ keepEditing = false } = {}) {
  if (!state.h) return;
  $('dateInput').value = state.date;
  $('sheetDate').textContent = longDate(state.date);
  renderMeta(); renderSummary(); renderChips(); renderOwners();
  if (!keepEditing || !document.querySelector('#sections .card')) {
    $('sections').innerHTML = SECTIONS.map(sectionHtml).join('');
  } else {
    for (const s of SECTIONS) if (state.editing?.section !== s.key) renderSection(s.key);
  }
  document.title = `Maintenance Handover ${shortDate(state.date)} · Balter Brewing`;
}

// ---------- loading + sync between devices ----------
async function load({ quiet = false } = {}) {
  const date = state.date;
  try {
    const { handover } = await api(`/api/handover?date=${date}`);
    if (date !== state.date) return;
    const changed = handover.updatedAt !== state.h?.updatedAt;
    state.h = handover; state.error = '';
    if (!quiet || changed) render({ keepEditing: quiet });
    else renderChips();
  } catch (e) {
    state.error = e.message; if (state.h) renderChips();
    if (!quiet) throw e;
  }
}

function accept(handover) {
  state.h = handover; state.error = '';
}

async function setDate(d) {
  state.date = d; state.editing = null; metaDirty.clear();
  history.replaceState(null, '', `#${d}`);
  state.h = null;
  $('sections').innerHTML = '<div class="loading">Loading…</div>';
  try { await load(); } catch (e) { $('sections').innerHTML = `<div class="loading">Couldn’t load: ${esc(e.message)}</div>`; }
}

// ---------- meta fields (autosave) ----------
const metaDirty = new Set();
let metaTimer;
function queueMeta(key) {
  metaDirty.add(key); $('metaSaved').textContent = 'Saving…';
  clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    const data = {}; for (const k of metaDirty) data[k] = $(`m_${k}`).value;
    const sent = { ...data };
    try {
      const { handover } = await send({ type: 'meta', data });
      for (const k of Object.keys(sent)) if ($(`m_${k}`).value === sent[k]) metaDirty.delete(k);
      accept(handover); render({ keepEditing: true });
      $('metaSaved').textContent = `Saved ${bneTime(handover.updatedAt)}`;
    } catch (e) { $('metaSaved').textContent = `Not saved: ${e.message}`; }
  }, 700);
}

// ---------- item editing ----------
function startEdit(section, id = null) {
  if (state.editing) { const prev = state.editing.section; state.editing = null; renderSection(prev); }
  state.editing = { section, id };
  renderSection(section);
  const form = document.querySelector(`#sec-${section} form.edit`);
  form?.querySelector('input')?.focus();
  form?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function stopEdit() {
  const s = state.editing?.section; state.editing = null;
  if (s) render({ keepEditing: false });
}

async function saveForm(form) {
  const section = SECTION_BY_KEY[form.dataset.section];
  const item = { id: form.dataset.id || undefined };
  for (const inp of form.querySelectorAll('input[name]')) item[inp.name] = inp.value.trim();
  const sel = form.querySelector('.seg [aria-checked="true"]');
  if (sel) item.tag = sel.dataset.v;
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const { handover } = await send({ type: 'upsert', section: section.key, item });
    accept(handover); stopEdit();
  } catch (e) { toast(e.message); btn.disabled = false; }
}

async function deleteItem(form) {
  const btn = form.querySelector('[data-act=delete]');
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tap again to delete'; return; }
  try {
    const { handover } = await send({ type: 'delete', section: form.dataset.section, id: form.dataset.id });
    accept(handover); stopEdit(); toast('Deleted');
  } catch (e) { toast(e.message); }
}

// ---------- email ----------
let email = null;
function openEmail() {
  if (!state.h) return;
  email = buildEmail(state.h, location.origin);
  $('emailPreview').innerHTML = email.html;
  $('subject').value = email.subject;
  $('overlay').hidden = false;
}

// ---------- wire up ----------
function init() {
  let b = '';
  for (let i = 0; i < 18; i++) { const s = 8 + Math.random() * 28; b += `<span style="left:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-duration:${9 + Math.random() * 11}s;animation-delay:-${Math.random() * 14}s"></span>`; }
  $('bubbles').innerHTML = b;

  $('dateInput').addEventListener('change', (e) => e.target.value && setDate(e.target.value));
  $('prevDay').onclick = () => setDate(addDays(state.date, -1));
  $('nextDay').onclick = () => setDate(addDays(state.date, 1));
  $('logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; };
  $('refreshBtn').onclick = async (e) => { e.target.disabled = true; await load().catch((x) => toast(x.message)); e.target.disabled = false; toast('Up to date'); };
  $('carryBtn').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const { handover, carried } = await send({ type: 'carry' });
      accept(handover); render();
      toast(carried.added ? `Brought across ${carried.added} open item${carried.added === 1 ? '' : 's'} from ${shortDate(carried.from)}` : `Nothing new to bring across from ${shortDate(carried.from)}`);
    } catch (x) { toast(x.message); }
    e.target.disabled = false;
  };
  for (const f of META_FIELDS) $(`m_${f.key}`).addEventListener('input', () => queueMeta(f.key));
  $('m_headline').addEventListener('input', growHeadline);

  const secs = $('sections');
  secs.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const card = t.closest('.card'); const key = card?.id.slice(4);
    if (t.classList.contains('item')) return startEdit(key, t.dataset.id);
    const act = t.dataset.act;
    if (act === 'add') return startEdit(key);
    if (act === 'cancel') return stopEdit();
    if (act === 'delete') return deleteItem(t.closest('form'));
    if (act === 'seed') {
      try { const { handover } = await send({ type: 'seedChecks' }); accept(handover); render(); } catch (x) { toast(x.message); }
      return;
    }
    if (t.parentElement.classList.contains('seg')) {
      for (const s of t.parentElement.children) s.setAttribute('aria-checked', String(s === t));
    }
  });
  secs.addEventListener('submit', (e) => { e.preventDefault(); saveForm(e.target); });
  secs.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.editing) { e.stopPropagation(); stopEdit(); } });

  $('emailBtn').onclick = openEmail;
  const close = () => { $('overlay').hidden = true; };
  $('mClose').onclick = close;
  $('overlay').addEventListener('click', (e) => e.target === $('overlay') && close());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('overlay').hidden && close());
  $('copyEmail').onclick = async () => {
    if (!email) return;
    toast((await copyHtml(email.html, $('emailPreview'))) ? 'Email copied. Paste it into a new message.' : 'Copy was blocked. Use Download .html instead.');
  };
  $('copySubject').onclick = async () => {
    try { await navigator.clipboard.writeText($('subject').value); } catch { $('subject').select(); document.execCommand('copy'); }
    toast('Subject copied');
  };
  $('dlEmail').onclick = () => email && downloadHtml(email.html, email.subject);

  const hash = location.hash.slice(1);
  setDate(/^\d{4}-\d{2}-\d{2}$/.test(hash) ? hash : brisbaneToday());
  setInterval(() => !document.hidden && state.h && load({ quiet: true }), 15000);
  document.addEventListener('visibilitychange', () => !document.hidden && state.h && load({ quiet: true }));
}
init();
