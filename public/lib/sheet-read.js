// Reads the first worksheet of an .xlsx, or a .csv, into an array of rows
// (arrays of strings). No library needed: .xlsx is a zip of XML files, which
// the browser can unzip with DecompressionStream.

export async function readSheet(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4b) return readXlsx(buf);
  return parseCsv(new TextDecoder().decode(buf).replace(/\uFEFF/g, ''));
}

export function parseCsv(text) {
  const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file isn’t a readable Excel workbook.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    files[name] = { method, size, local };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async (name) => {
    const f = files[name]; if (!f) return null;
    const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
    const data = buf.subarray(start, start + f.size);
    if (f.method === 0) return new TextDecoder().decode(data);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
}

const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

async function readXlsx(buf) {
  const get = await unzip(buf);
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const shared = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));

  // Find the first sheet in workbook order.
  let path = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    if (rel) path = `xl/${rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '')}`;
  }
  // Which number formats are dates, so serial numbers can be turned back into dates.
  const dateStyles = new Set();
  const st = await get('xl/styles.xml');
  if (st) {
    const doc = xml(st), custom = {};
    for (const nf of doc.getElementsByTagName('numFmt')) custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode');
    const xfs = doc.getElementsByTagName('cellXfs')[0]?.getElementsByTagName('xf') || [];
    [...xfs].forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmyh]/i.test((custom[id] || '').replace(/\[[^\]]*\]|"[^"]*"/g, ''))) dateStyles.add(String(i));
    });
  }
  const sheet = await get(path);
  if (!sheet) throw new Error('Couldn’t find a worksheet in this file.');
  const rows = [];
  for (const r of xml(sheet).getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val = v;
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (t !== 'str' && t !== 'b' && v !== '' && dateStyles.has(c.getAttribute('s'))) val = serialToIso(Number(v));
      row[colIndex(c.getAttribute('r'))] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

function serialToIso(n) {
  const d = new Date(Math.round((n - 25569) * 86400e3));
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
