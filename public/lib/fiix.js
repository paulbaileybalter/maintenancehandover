// Turns a Fiix list export (work orders or parts) into handover entries.
// Columns are found by their header names, so the column order in the export
// doesn't matter and extra columns are ignored.
// Tuned to Balter's real exports (Nov 2026): "WorkOrdersAdministration.csv"
// and "CurrentStock.csv". Fiix doesn't put quotes around commas inside text,
// so rows with extra cells are repaired before reading.

import { addDays } from './sections.js';

// Fiix is shared with sister sites. Balter's assets and stock locations have
// codes starting "BB" (e.g. "Angelus Seamer (BB610-PCK-CL-SEAM)",
// "Balter Workshop (BBWORK)"). Sister sites use 4PB- and PL-.
export const SITE = { name: 'Balter', prefixes: ['BB'], others: ['4PB', 'PL'] };
const codeOf = (s) => { const m = String(s || '').replace(/[\uFEFF\u200B]/g, '').match(/\(([^()]*)\)\s*$/); return m ? m[1].trim() : ''; };
// 'here' | 'other' | 'unclear' (no code, or a code like "A1027" that doesn't
// follow either pattern). Unclear rows are kept but start unticked.
const siteOf = (s) => {
  const c = codeOf(s).toUpperCase();
  if (c && SITE.prefixes.some((p) => c.startsWith(p))) return 'here';
  if (c && SITE.others.some((p) => c.startsWith(p))) return 'other';
  return 'unclear';
};
let UNCLEAR = new WeakMap();
const unclearNote = (r) => (UNCLEAR.has(r) ? ` · site unclear (${UNCLEAR.get(r) || 'no asset'})` : '');

const COLS = {
  code: [/^(work ?order|wo)\s*(#|no\.?|number|code)?$/, /^code$/, /work order code/, /^wo\b/],
  title: [/^description$/, /summary/, /^(task|work order) description/, /description/, /^name$/, /^title$/],
  status: [/^(work order )?status$/, /status/],
  priority: [/priority/],
  type: [/maintenance type/, /work ?type/, /^type$/],
  asset: [/^assets?$/, /asset/, /equipment/],
  assigned: [/assigned/, /technician/, /^users?$/],
  start: [/suggested start/, /scheduled start/, /start date/, /^start/],
  due: [/suggested completion/, /completion due/, /due/, /target/],
  completed: [/date completed/, /completed (date|on)/, /^completed$/, /closed (date|on)/],
  created: [/date created/, /created/, /requested/, /date submitted/],
  // parts / stock
  part: [/stock item/, /^part( name)?$/, /^(part|stock|item)( name| description)?$/, /^name$/],
  onHand: [/qty on hand/, /quantity on hand/, /on hand/, /^stock( qty| level)?$/, /^(qty|quantity)$/],
  min: [/min(imum)?( qty| quantity| level)?/, /reorder/],
  location: [/location|bin|storeroom|facility/],
  // scheduled maintenance list
  when: [/^when$/, /schedule/, /recurrence/],
  smStatus: [/sm status/, /^active$/],
};

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c).trim().toLowerCase());
    const hits = Object.values(COLS).filter((pats) => cells.some((c) => pats.some((p) => p.test(c)))).length;
    if (hits >= 2 && cells.filter(Boolean).length >= 2) return i;
  }
  return -1;
}

function mapColumns(header) {
  const cells = header.map((c) => String(c).trim().toLowerCase());
  const used = new Set(), map = {};
  for (const [key, pats] of Object.entries(COLS)) {
    for (const p of pats) {
      const i = cells.findIndex((c, j) => !used.has(j) && p.test(c));
      if (i >= 0) { map[key] = i; used.add(i); break; }
    }
  }
  return map;
}

// Dates: ISO, Excel (already converted), or d/m/y (Australian). m/d/y is used
// only when a day above 12 proves it.
function makeDateParser(values) {
  const slashy = values.map((v) => String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)).filter(Boolean);
  const us = slashy.some((m) => Number(m[2]) > 12) && !slashy.some((m) => Number(m[1]) > 12);
  return (v) => {
    const s = String(v || '').trim(); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const [d, mo] = us ? [m[2], m[1]] : [m[1], m[2]];
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t + 10 * 3600e3).toISOString().slice(0, 10);
  };
}

const is = (v, re) => re.test(String(v || '').toLowerCase());
const DONE = /complete|closed|done|finished/;
const HIGH = /high|urgent|critical|emergency|^1\b|highest/;
const BREAKDOWN = /corrective|breakdown|emergency|reactive|unplanned|repair|fault/;
const PLANNED = /preventive|preventative|^pm\b|planned|scheduled|inspection|calibration|service/;
const REQUEST = /request/;
const wo = (c) => (/^wo/i.test(c) ? c : `WO ${c}`);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

export function interpret(rows, date, { siteOnly = true } = {}) {
  const h = findHeader(rows);
  if (h < 0) throw new Error('Couldn’t find the column headings in this file.');
  const col = mapColumns(rows[h]);
  // Fiix leaves trailing empty headers, and doesn't quote commas in text: glue
  // the spare cells back into the description / item name column.
  const width = rows[h].length;
  const textCol = col.part ?? col.title;
  const data = rows.slice(h + 1).map((r) => {
    const extra = r.length - width;
    if (extra <= 0 || textCol === undefined) return r;
    return [...r.slice(0, textCol), r.slice(textCol, textCol + extra + 1).join(','), ...r.slice(textCol + extra + 1)];
  }).filter((r) => r.filter((c) => String(c).trim()).length >= 2);
  // Drop other sites' rows (by asset code, or stock location code for parts).
  const siteCol = col.onHand !== undefined ? col.location : col.asset;
  let otherSite = 0;
  UNCLEAR = new WeakMap();
  if (siteOnly && siteCol !== undefined) {
    const here = data.filter((r) => {
      const s = siteOf(r[siteCol]);
      if (s === 'other') { otherSite++; return false; }
      if (s === 'unclear') UNCLEAR.set(r, codeOf(r[siteCol]));
      return true;
    });
    data.length = 0; data.push(...here);
  }
  const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').replace(/[\uFEFF\u200B]/g, '').trim());
  if (col.when !== undefined) return { kind: 'schedule', columns: col, header: rows[h], missing: [], otherSite, entries: scheduleEntries(data, get, date) };
  const isParts = col.onHand !== undefined && col.min !== undefined;
  if (isParts) return { kind: 'parts', columns: col, header: rows[h], missing: [], otherSite, entries: partsEntries(data, get) };
  if (col.title === undefined && col.code === undefined) throw new Error('This doesn’t look like a Fiix work order or parts export.');
  const dateCols = ['start', 'due', 'completed', 'created'].filter((k) => col[k] !== undefined);
  const parse = makeDateParser(data.flatMap((r) => dateCols.map((k) => get(r, k))));
  const missing = [
    col.created === undefined && 'Date Created (to spot today’s breakdowns)',
    col.completed === undefined && 'Date Completed (to list jobs completed today)',
    col.start === undefined && 'Suggested Start Date (to fill Planned maintenance for the next 48 hours)',
    col.due === undefined && 'Suggested Completion Date (to flag overdue jobs)',
  ].filter(Boolean);
  return { kind: 'workorders', columns: col, header: rows[h], missing, otherSite, entries: workOrderEntries(data, get, parse, date) };
}

function workOrderEntries(data, get, parse, D) {
  const out = []; const D2 = addDays(D, 2);
  let skipped = 0;
  for (const r of data) {
    const code = get(r, 'code'), desc = get(r, 'title'), asset = get(r, 'asset');
    if (!code && !desc) continue;
    const status = get(r, 'status'), type = get(r, 'type'), prio = get(r, 'priority');
    const owner = get(r, 'assigned').split(/[,;]/)[0].trim();
    const start = parse(get(r, 'start')), due = parse(get(r, 'due')), completed = parse(get(r, 'completed')), created = parse(get(r, 'created'));
    const done = is(status, DONE) || !!completed;
    const assetShort = asset.replace(/\s*\([^)]*\)\s*$/, '');
    const shortDesc = desc.length > 90 ? `${desc.slice(0, 88).replace(/\s+\S*$/, '')}…` : desc;
    const title = (assetShort && shortDesc ? `${assetShort}: ${shortDesc}` : shortDesc || assetShort || `WO ${code}`).slice(0, 140);
    const id = `fiix-${slug(code || title)}`;
    const base = { id, src: 'fiix', owner };
    const assetNote = assetShort && !title.toLowerCase().includes(assetShort.toLowerCase()) ? assetShort : '';

    if (is(type, BREAKDOWN) && (created === D || completed === D)) {
      out.push({ section: 'breakdowns', reason: 'Breakdown raised or fixed today', item: { ...base, title: assetShort || title, tag: done ? 'Fixed' : 'Still down', detail: assetShort ? shortDesc : '', action: code ? `${wo(code)}${status ? ` · ${status}` : ''}` : status } });
    } else if (done && completed === D) {
      out.push({ section: 'workorders', reason: 'Completed today', item: { ...base, title, tag: 'Completed', extra: code } });
    } else if (done) {
      skipped++;
    } else if (is(type, REQUEST) || is(status, REQUEST)) {
      out.push({ section: 'outstanding', reason: 'Open work request', item: { ...base, title, tag: 'At risk', detail: ['Work request', assetNote].filter(Boolean).join(' · '), action: code ? `Request ${code}` : '' } });
    } else if (is(type, PLANNED) && start && start >= D && start <= D2) {
      out.push({ section: 'planned', reason: 'Planned in the next 48 hours', item: { ...base, title, tag: start === D ? 'Today' : start === addDays(D, 1) ? 'Tomorrow' : 'Next 48 h', extra: assetNote, detail: code ? wo(code) : '' } });
    } else if (is(prio, HIGH)) {
      out.push({ section: 'workorders', reason: `Open, ${prio || 'high priority'}`, item: { ...base, title, tag: 'Priority', extra: code, action: [status, due && due < D ? `Overdue since ${due}` : ''].filter(Boolean).join(' · ') } });
    } else if (is(type, BREAKDOWN)) {
      out.push({ section: 'outstanding', reason: `Open ${type.toLowerCase()} work order`, item: { ...base, title, tag: 'Open breakdown', detail: '', action: [code && wo(code), status].filter(Boolean).join(' · ') } });
    } else if ((due && due < D) || (!due && start && start < D && is(type, PLANNED))) {
      out.push({ section: 'workorders', reason: 'Open, overdue', item: { ...base, title, tag: 'Outstanding', extra: code, action: [assetNote, `Overdue since ${due || start}`].filter(Boolean).join(' · ') } });
    } else {
      // Every other open work order is listed as outstanding.
      out.push({ section: 'workorders', reason: `Open${prio ? `, ${prio}` : ''}`, item: { ...base, title, tag: 'Outstanding', extra: code, action: /^open$/i.test(status) ? '' : status } });
    }
    const last = out[out.length - 1];
    if (last && last.row === undefined) { last.row = r; if (UNCLEAR.has(r)) { last.off = true; last.reason += unclearNote(r); } }
  }
  return { list: out, skipped };
}

function partsEntries(data, get) {
  // The same part can sit in several bins: add the bins up per part code.
  const num = (v) => Number(String(v).replace(/[^\d.-]/g, ''));
  const parts = new Map();
  for (const r of data) {
    const name = get(r, 'part') || get(r, 'title'); if (!name) continue;
    const key = get(r, 'code') || name.toLowerCase();
    const p = parts.get(key) || { name, code: get(r, 'code'), on: 0, min: 0, locs: [] };
    const on = num(get(r, 'onHand')), min = num(get(r, 'min'));
    if (Number.isFinite(on)) p.on += on;
    if (Number.isFinite(min)) p.min += min;
    const loc = get(r, 'location').replace(/\s*\([^)]*\)\s*$/, '');
    if (loc && !p.locs.includes(loc)) p.locs.push(loc);
    parts.set(key, p);
  }
  const out = []; let skipped = 0;
  for (const p of parts.values()) {
    if (!(p.min > 0) || p.on > p.min) { skipped++; continue; }
    const fmt = (n) => String(Math.round(n * 100) / 100);
    out.push({ section: 'parts', reason: 'At or below minimum stock', item: { id: `fiix-part-${slug(p.code || p.name)}`, src: 'fiix', title: p.name.slice(0, 140), tag: p.on <= 0 ? 'Critical' : 'Low stock', extra: '', detail: `${fmt(p.on)} on hand, min ${fmt(p.min)}${p.code ? ` · Code ${p.code}` : ''}${p.locs.length ? ` · ${p.locs.slice(0, 2).join(', ')}` : ''}` } });
  }
  out.sort((a, b) => (a.item.tag === b.item.tag ? 0 : a.item.tag === 'Critical' ? -1 : 1));
  // A long low-stock list would swamp the handover: start with it unticked so
  // the team picks the spares that actually matter.
  if (out.length > 8) for (const e of out) e.off = true;
  return { list: out, skipped };
}

// ---------------------------------------------------------------- schedules
// Reads the plain-English "When" rule on Fiix's Scheduled Maintenance list and
// works out whether the job falls today, tomorrow or the day after. Rules
// whose start point isn't in the export ("every 2 weeks", "every 3 months")
// can't be placed on a date, so they're counted as skipped.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function ruleMatches(rule, iso) {
  const r = rule.toLowerCase().replace(/\s+/g, ' ').trim();
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate(), month = d.getUTCMonth(), wd = d.getUTCDay();
  let m;
  // "The 23rd day of every month" (the 31st falls on the last day of short months)
  if ((m = r.match(/^the (\d{1,2})(?:st|nd|rd|th) day of every month$/)) || (m = r.match(/^every month on the (\d{1,2})(?:st|nd|rd|th)$/))) {
    return Math.min(Number(m[1]), lastDay(d.getUTCFullYear(), month)) === day;
  }
  // "Every year, on January 10th"
  if ((m = r.match(/^every year,? on (\w+) (\d{1,2})(?:st|nd|rd|th)?$/))) return MONTHS.indexOf(m[1]) === month && Number(m[2]) === day;
  // "Every Monday and Thursday", "Every week on Friday"
  if ((m = r.match(/^every (?:week on )?((?:\w+day)(?:(?:, | and )\w+day)*)$/))) return m[1].split(/, | and /).some((x) => WEEKDAYS.indexOf(x) === wd);
  return null; // unknown or not placeable
}

function scheduleEntries(data, get, D) {
  const out = []; let skipped = 0, unplaceable = 0;
  const days = [[D, 'Today'], [addDays(D, 1), 'Tomorrow'], [addDays(D, 2), 'Next 48 h']];
  for (const r of data) {
    const when = get(r, 'when'), code = get(r, 'code');
    const desc = get(r, 'title').replace(/\s+/g, ' ').trim(), asset = get(r, 'asset').replace(/\s*\([^)]*\)\s*$/, '');
    if (!when || (!desc && !code)) continue;
    if (get(r, 'smStatus') === '0' || /^every day$|^daily$/i.test(when)) { skipped++; continue; }
    const hit = days.find(([iso]) => ruleMatches(when, iso));
    if (hit === undefined && days.every(([iso]) => ruleMatches(when, iso) === null)) { unplaceable++; skipped++; continue; }
    if (!hit) { skipped++; continue; }
    const owner = get(r, 'assigned').split(/[,;]/)[0].trim();
    const title = (asset && desc && !desc.toLowerCase().includes(asset.toLowerCase()) ? `${asset}: ${desc}` : desc || asset).slice(0, 140);
    out.push({ off: UNCLEAR.has(r), section: 'planned', reason: `Scheduled: ${when}${unclearNote(r)}`, item: { id: `fiix-sm-${slug(code || title)}-${hit[0]}`, src: 'fiix', title, tag: hit[1], extra: asset && !title.toLowerCase().includes(asset.toLowerCase()) ? asset : '', detail: [code && `SM ${code}`, get(r, 'type'), get(r, 'priority')].filter(Boolean).join(' · '), owner } });
  }
  if (out.length > 10) for (const e of out) e.off = true;
  return { list: out, skipped, unplaceable };
}
