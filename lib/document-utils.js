import {TYPE_LABELS} from './model.js';

export const ANSWER_TYPE_ORDER = ['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay'];

/** Only replace unambiguous, common plaintext math shorthand; do not try to interpret arbitrary LaTeX. */
export function readableText(value) {
  return String(value ?? '')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\times\b/g, '×').replace(/\\div\b/g, '÷')
    .replace(/\^\{2\}|\^2/g, '²').replace(/\^\{3\}|\^3/g, '³');
}

export function resolveDocumentText(value, settings, now = new Date()) {
  const map = {
    title: settings.title || '', school: settings.school || '',
    subject: settings.subject || '', subtitle: settings.subtitle || '',
    date: new Intl.DateTimeFormat('en-US', { year:'numeric', month:'short', day:'numeric' }).format(now),
  };
  return String(value ?? '').replace(/\{(title|school|subject|subtitle|date)\}/gi,
    (_whole,key) => String(map[key.toLowerCase()] ?? ''));
}

export function cleanLogo(settings) {
  const logo = settings.brandLogo;
  if (!logo || !['image/png','image/jpeg'].includes(logo.mime)) return null;
  const match = /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/.exec(logo.data || '');
  if (!match || match[1] !== logo.mime.split('/')[1] || match[2].length > 1_500_000) return null;
  return {...logo, width: Math.max(1,Number(logo.width)||1), height:Math.max(1,Number(logo.height)||1), base64:match[2]};
}

export function answerGroups(questions) {
  return ANSWER_TYPE_ORDER.map(type => ({type, label:TYPE_LABELS[type], rows:questions.map((q,i)=>({q,number:i+1})).filter(item=>item.q.type===type)}))
    .filter(group=>group.rows.length);
}

export function answerItems(value, type) {
  const input = readableText(value).trim();
  if (!input) return [];
  if (type === 'enumeration') return input.split(/\r?\n/).map(t=>t.trim().replace(/^(?:[-•*]|\d+[.)])\s*/, '')).filter(Boolean);
  return input.split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
}

export function displayAnswer(question) {
  const answer = readableText(question.answer).trim();
  return answer || 'No answer supplied';
}

/** Physical bounding box for all logo placements. 72px at 96dpi = 0.75in. Tiny preset starts at 16px. */
export function logoSizePx(settings) {
  const value = Number(settings.logoSizePx);
  return Number.isFinite(value) ? Math.max(16, Math.min(72, Math.round(value))) : 44;
}
