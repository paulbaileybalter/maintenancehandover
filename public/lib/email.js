// Builds an email-safe copy of the handover: tables + inline styles only,
// laid out to match the website so it pastes into Outlook / Gmail cleanly.
import { SECTIONS, BRAND, tagInfo, sortedItems, summary, longDate, shortDate } from './sections.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = "'Lexend','Segoe UI',Arial,Helvetica,sans-serif";
const W = 680;

const pill = (opt) => opt
  ? `<span style="display:inline-block;background:${opt.colour[0]};color:${opt.colour[1]};font-family:${FONT};font-size:11px;font-weight:700;line-height:16px;padding:2px 8px;border-radius:10px;white-space:nowrap;mso-line-height-rule:exactly;">${esc(opt.value)}</span>`
  : '';

function itemRow(section, it, last) {
  const label = (k) => section.fields.find((f) => f.key === k)?.label || '';
  const line = (k, bold) => it[k]
    ? `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:#2b2a26;margin-top:2px;">${bold ? `<b style="color:#000;">${esc(label(k))}:</b> ` : ''}${esc(it[k])}</div>` : '';
  const extra = it.extra ? `<span style="color:${BRAND.muted};font-weight:400;"> · ${esc(label('extra'))}: ${esc(it.extra)}</span>` : '';
  const owner = it.owner
    ? `<span style="display:inline-block;font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;color:#000;border:1px solid ${BRAND.line};background:${BRAND.wash};border-radius:10px;padding:2px 8px;white-space:nowrap;">👤 ${esc(it.owner)}</span>` : '';
  const border = last ? '' : `border-bottom:1px solid ${BRAND.line};`;
  return `<tr>
<td valign="top" width="110" style="padding:10px 8px 10px 16px;${border}">${pill(tagInfo(section, it.tag))}</td>
<td valign="top" style="padding:10px 8px;${border}">
<div style="font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:#000;">${esc(it.title)}${extra}</div>
${line('detail', section.key === 'breakdowns')}${line('cause', true)}${line('action', true)}
</td>
<td valign="top" align="right" width="120" style="padding:10px 16px 10px 8px;${border}">${owner}</td>
</tr>`;
}

function sectionBlock(section, items) {
  const list = sortedItems(section, items);
  const body = list.length
    ? list.map((it, i) => itemRow(section, it, i === list.length - 1)).join('')
    : `<tr><td colspan="3" style="padding:10px 16px 12px;font-family:${FONT};font-size:13px;color:${BRAND.muted};">Nothing to report.</td></tr>`;
  return `<tr><td style="padding:0 24px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${BRAND.line};border-left:5px solid ${section.accent};border-radius:10px;background:#ffffff;">
<tr><td colspan="3" style="padding:11px 16px 9px;border-bottom:1px solid ${BRAND.line};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td width="34" valign="middle"><div style="width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${section.accent};font-size:14px;">${section.icon}</div></td>
<td valign="middle" style="font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#000;padding-left:6px;">${esc(section.title)} <span style="font-size:12px;font-weight:400;color:${BRAND.muted};">${esc(section.blurb)}</span></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:12px;font-weight:700;color:${BRAND.muted};white-space:nowrap;">${list.length || ''}</td>
</tr></table>
</td></tr>
${body}
</table>
</td></tr>`;
}

export function buildEmail(h, origin) {
  const m = h.meta || {};
  const metaCell = (label, v) => `<td valign="top" style="padding:0 8px 0 0;">
<div style="font-family:${FONT};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;font-weight:600;color:${BRAND.muted};">${esc(label)}</div>
<div style="font-family:${FONT};font-size:14px;font-weight:600;color:#000;margin-top:2px;">${esc(v || '—')}</div></td>`;
  const tiles = summary(h).map((t) => `<td width="20%" valign="top" style="padding:0 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${BRAND.line};border-top:4px solid ${t.colour};border-radius:10px;background:#fff;">
<tr><td align="center" style="padding:8px 4px 0;font-family:${FONT};font-size:22px;line-height:26px;font-weight:700;color:#000;">${t.value}</td></tr>
<tr><td align="center" valign="top" height="35" style="height:35px;padding:0 4px 9px;font-family:${FONT};font-size:10.5px;line-height:13px;color:${BRAND.muted};">${esc(t.label)}</td></tr>
</table></td>`).join('');
  const stripe = [BRAND.teal, BRAND.orange, BRAND.purple, BRAND.sky].map((c) => `<td width="25%" height="6" style="background:${c};font-size:0;line-height:0;height:6px;">&nbsp;</td>`).join('');

  const html = `<table role="presentation" width="${W}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:${W}px;max-width:100%;border-collapse:separate;background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;font-family:${FONT};color:#000;">
<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${stripe}</tr></table></td></tr>
<tr><td style="padding:20px 24px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="58" valign="middle"><img src="${esc(origin)}/email-logo.png" width="46" height="46" alt="Balter Brewing" style="display:block;width:46px;height:46px;border:0;"></td>
<td valign="middle">
<div style="font-family:${FONT};font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;color:${BRAND.purple};">Balter Brewing · Maintenance</div>
<div style="font-family:${FONT};font-size:21px;line-height:26px;font-weight:700;color:#000;margin-top:2px;">Daily Maintenance Handover</div>
</td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:13px;font-weight:600;color:#000;white-space:nowrap;">${esc(longDate(h.date))}</td>
</tr></table>
</td></tr>
<tr><td style="padding:0 24px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${BRAND.wash};border:1px solid ${BRAND.line};border-radius:10px;"><tr><td style="padding:12px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${metaCell('Prepared by', m.preparedBy)}${metaCell('Plant checks done', m.checksAt)}
</tr></table>
${m.headline ? `<div style="margin-top:10px;padding:9px 12px;background:${BRAND.pale};border-radius:8px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:#000;">📣 ${esc(m.headline)}</div>` : ''}
</td></tr></table>
</td></tr>
<tr><td style="padding:0 20px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tiles}</tr></table></td></tr>
${SECTIONS.map((s) => sectionBlock(s, h.sections?.[s.key] || [])).join('')}
<tr><td style="padding:4px 24px 20px;font-family:${FONT};font-size:11px;color:${BRAND.muted};text-align:center;">Sent after the afternoon plant checks · Brisbane time</td></tr>
</table>`;

  return { html, subject: `Maintenance Handover · ${shortDate(h.date)} · Balter Brewing` };
}

export function fullDocument(html, subject) {
  return `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff;">${html}</body></html>`;
}

// Copy as rich HTML so it pastes with formatting. Falls back to selecting the
// preview and using the old copy command (Safari / older Outlook web).
export async function copyHtml(html, previewEl) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      const text = previewEl.innerText;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const range = document.createRange(); range.selectNode(previewEl);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand('copy'); sel.removeAllRanges();
    return ok;
  } catch { return false; }
}

export function downloadHtml(html, subject) {
  const blob = new Blob([fullDocument(html, subject)], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${subject.replace(/[^\w ·-]+/g, '').replace(/[ ·]+/g, '-')}.html`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
