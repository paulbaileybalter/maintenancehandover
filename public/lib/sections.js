// Shared by the browser (rendering + forms) and the Worker (validation).
// Each section lists its fields. `tag` is the coloured status pill; its options
// run from most urgent to least, and that order is used to sort the list.

export const BRAND = {
  teal: '#47D7AC', orange: '#FDAA63', purple: '#7566A0', sky: '#99D6EA',
  ink: '#000000', pale: '#F1EB9C', gold: '#FFD637',
  line: '#E7E5DE', wash: '#FAFAF7', muted: '#6B685D', grey: '#ECEAE3',
};

// Pill colours: [background, text]
const C = {
  orange: [BRAND.orange, '#000'], gold: [BRAND.gold, '#000'], teal: [BRAND.teal, '#000'],
  sky: [BRAND.sky, '#000'], purple: [BRAND.purple, '#fff'], pale: [BRAND.pale, '#000'],
  grey: [BRAND.grey, '#3d3b35'], ink: ['#000', '#fff'],
  // RAG red: the one colour outside the brand palette, because red has to read as red.
  red: ['#E5534B', '#fff'],
};

const f = (key, label, extra = {}) => ({ key, label, ...extra });
const tag = (label, options, def) => ({ key: 'tag', label, type: 'select', options, default: def ?? options[0].value });
const o = (value, colour) => ({ value, colour: C[colour] });

export const SECTIONS = [
  {
    key: 'critical', title: 'Critical services', icon: '⚙️', accent: BRAND.teal,
    blurb: 'Plant checks: done, RAG status and comments',
    sort: false,
    layout: 'checks', // one row per service: tick box, RAG, comments, edited in place
    fields: [
      f('title', 'Service', { placeholder: 'e.g. Glycol / refrigeration', required: true }),
      f('checked', 'Checked', { type: 'check' }),
      tag('RAG', [o('Red', 'red'), o('Amber', 'gold'), o('Green', 'teal')], ''),
      f('detail', 'Comments', { placeholder: 'Readings, levels, issues' }),
    ],
  },
  {
    key: 'breakdowns', title: 'Breakdowns', icon: '🛠️', accent: BRAND.orange,
    blurb: 'What went down, root cause and actions taken',
    sort: true,
    fields: [
      f('title', 'Equipment', { placeholder: 'e.g. Canning line seamer', required: true }),
      tag('Status', [o('Still down', 'orange'), o('Temp fix', 'gold'), o('Fixed', 'teal')]),
      f('extra', 'Downtime', { placeholder: 'e.g. 1.5 h', short: true }),
      f('detail', 'What happened', { placeholder: 'Short and specific' }),
      f('cause', 'Root cause', { placeholder: 'If known' }),
      f('action', 'Action taken', { placeholder: 'What was done / what is next' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'outstanding', title: 'Outstanding issues', icon: '⚠️', accent: BRAND.gold,
    blurb: 'Open breakdowns, temporary fixes and equipment at risk',
    sort: true,
    fields: [
      f('title', 'Equipment / issue', { placeholder: 'e.g. FV4 glycol valve', required: true }),
      tag('Type', [o('Open breakdown', 'orange'), o('Temp fix', 'gold'), o('At risk', 'purple')]),
      f('detail', 'Risk / detail', { placeholder: 'Why it matters' }),
      f('action', 'Action', { placeholder: 'Next step and when' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'workorders', title: 'Work orders', icon: '📋', accent: BRAND.purple,
    blurb: 'Completed, outstanding and priority jobs',
    sort: true,
    fields: [
      f('title', 'Job', { placeholder: 'e.g. Replace CIP pump seal', required: true }),
      tag('Status', [o('Priority', 'orange'), o('Outstanding', 'sky'), o('Completed', 'teal')], 'Outstanding'),
      f('extra', 'WO #', { placeholder: 'e.g. 10432', short: true }),
      f('action', 'Next step', { placeholder: 'Leave blank if done' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'planned', title: 'Planned maintenance', icon: '🗓️', accent: BRAND.sky,
    blurb: 'Key jobs for the next 24 to 48 hours',
    sort: true,
    fields: [
      f('title', 'Job', { placeholder: 'e.g. Boiler service', required: true }),
      tag('When', [o('Today', 'gold'), o('Tomorrow', 'sky'), o('Next 48 h', 'pale')], 'Tomorrow'),
      f('extra', 'Time / area', { placeholder: 'e.g. 6 am, Brewhouse', short: true }),
      f('detail', 'Notes', { placeholder: 'Isolations, shutdowns, production impact' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'contractors', title: 'Contractors', icon: '👷', accent: BRAND.purple,
    blurb: 'Who’s onsite and what they’re working on',
    sort: true,
    fields: [
      f('title', 'Company', { placeholder: 'e.g. Cool Air Refrigeration', required: true }),
      tag('Status', [o('On site', 'teal'), o('Expected', 'sky'), o('Finished', 'grey')]),
      f('extra', 'Who', { placeholder: 'Names / headcount', short: true }),
      f('detail', 'Working on', { placeholder: 'Job and area, permits' }),
      f('owner', 'Host', { short: true, owner: true }),
    ],
  },
  {
    key: 'parts', title: 'Parts', icon: '📦', accent: BRAND.sky,
    blurb: 'Critical spares or delays holding up repairs',
    sort: true,
    fields: [
      f('title', 'Part', { placeholder: 'e.g. Seamer chuck', required: true }),
      tag('Status', [o('Critical', 'orange'), o('Low stock', 'gold'), o('Delayed', 'gold'), o('Ordered', 'sky'), o('Arrived', 'teal')], 'Ordered'),
      f('extra', 'ETA', { placeholder: 'e.g. Thu', short: true }),
      f('detail', 'Holding up', { placeholder: 'Which repair / equipment' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'safety', title: 'Safety', icon: '🦺', accent: BRAND.orange,
    blurb: 'Any incidents, hazards or concerns',
    sort: true,
    fields: [
      f('title', 'What', { placeholder: 'e.g. Wet floor at keg wash', required: true }),
      tag('Type', [o('Incident', 'orange'), o('Near miss', 'gold'), o('Hazard', 'gold'), o('Concern', 'sky'), o('Closed', 'teal')], 'Hazard'),
      f('detail', 'Detail', { placeholder: 'Where, who, report number' }),
      f('action', 'Action', { placeholder: 'Control in place / next step' }),
      f('owner', 'Owner', { short: true, owner: true }),
    ],
  },
  {
    key: 'wins', title: 'Wins', icon: '🍻', accent: BRAND.teal,
    blurb: 'Good repairs, proactive work or improvements worth calling out',
    sort: false,
    fields: [
      f('title', 'Win', { placeholder: 'e.g. Found worn bearing before it failed', required: true }),
      tag('Kind', [o('Good repair', 'teal'), o('Proactive', 'sky'), o('Improvement', 'purple')]),
      f('detail', 'Detail', { placeholder: 'Optional' }),
      f('owner', 'Who', { short: true, owner: true }),
    ],
  },
];

// GUESS: a starter list for a brewery. Edit freely; it is only used by the
// "Start today’s plant checks" button.
export const DEFAULT_SERVICES = [
  'Steam / boiler', 'Glycol / refrigeration', 'Compressed air', 'CO₂ supply',
  'Water / RO', 'Wastewater / effluent', 'Power',
];

export const META_FIELDS = [
  { key: 'preparedBy', label: 'Prepared by', max: 80 },
  { key: 'checksAt', label: 'Plant checks done', max: 40 },
  { key: 'headline', label: 'Headline for the next shift', max: 280 },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
export const MAX_FIELD = 400;
export const MAX_ITEMS = 60;

export function tagInfo(section, value) {
  const t = section.fields.find((x) => x.key === 'tag');
  return t?.options.find((x) => x.value === value) || null;
}

export function sortedItems(section, items = []) {
  if (!section.sort) return items.slice();
  const order = section.fields.find((x) => x.key === 'tag')?.options.map((x) => x.value) || [];
  const rank = (v) => { const i = order.indexOf(v); return i < 0 ? 99 : i; };
  return items.map((it, i) => [it, i]).sort((a, b) => rank(a[0].tag) - rank(b[0].tag) || a[1] - b[1]).map(([it]) => it);
}

// Counts used in the summary strip on the site and in the email.
export function summary(h) {
  const s = h?.sections || {};
  const n = (k, pred = () => true) => (s[k] || []).filter(pred).length;
  return [
    { label: 'Services red / amber', value: n('critical', (i) => i.tag === 'Red' || i.tag === 'Amber'), colour: BRAND.teal },
    { label: 'Breakdowns', value: n('breakdowns'), colour: BRAND.orange },
    { label: 'Open issues', value: n('outstanding'), colour: BRAND.gold },
    { label: 'Priority jobs', value: n('workorders', (i) => i.tag === 'Priority'), colour: BRAND.purple },
    { label: 'Safety items', value: n('safety', (i) => i.tag !== 'Closed'), colour: BRAND.orange },
  ];
}

export function emptyHandover(date) {
  return { date, meta: {}, sections: Object.fromEntries(SECTIONS.map((s) => [s.key, []])), updatedAt: null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function longDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export const brisbaneToday = () => new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10); // AEST, no daylight saving
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const bneTime = (iso) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' });
