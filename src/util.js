'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Текст с переносами строк → безопасный HTML
const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');
const lines = (s) => String(s ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const paragraphs = (s) => String(s ?? '').split(/\r?\n\s*\r?\n/).map((x) => x.trim()).filter(Boolean);

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};
function slugify(s) {
  return String(s || '').toLowerCase().split('').map((c) => (TRANSLIT[c] !== undefined ? TRANSLIT[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

// Очистка HTML из редактора панели: оставляем безопасный набор тегов и атрибутов
const ALLOWED = {
  p: [], br: [], h2: [], h3: [], h4: [], strong: [], b: [], em: [], i: [], u: [], ul: [], ol: [], li: [], blockquote: [],
  a: ['href', 'target'], img: ['src', 'alt'], table: [], thead: [], tbody: [], tr: [], th: [], td: [], hr: [],
};
function safeUrl(u) {
  const v = String(u || '').trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v) && !/^\/\//.test(v)) return v;
  return '';
}
function sanitizeHtml(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!(t in ALLOWED)) return '';
    if (m.startsWith('</')) return `</${t}>`;
    const keep = [];
    const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let a;
    while ((a = re.exec(attrs))) {
      const name = a[1].toLowerCase();
      const val = a[3] ?? a[4] ?? a[5] ?? '';
      if (!ALLOWED[t].includes(name)) continue;
      if (name === 'href' || name === 'src') { const u = safeUrl(val); if (u) keep.push(`${name}="${esc(u)}"`); }
      else if (name === 'target') { if (val === '_blank') keep.push('target="_blank" rel="noopener"'); }
      else keep.push(`${name}="${esc(val)}"`);
    }
    return `<${t}${keep.length ? ' ' + keep.join(' ') : ''}>`;
  });
  return s.trim();
}
const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const MONTHS = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
};
function fmtDate(iso, lang = 'ru') {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  return lang === 'kk' ? `${d.getFullYear()} ж. ${d.getDate()} ${MONTHS.kk[d.getMonth()]}` : `${d.getDate()} ${MONTHS.ru[d.getMonth()]} ${d.getFullYear()} г.`;
}
function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fmtMoney = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('ru-RU').replace(/,/g, ' '));
const fmtSize = (b) => (b < 1024 ? `${b} Б` : b < 1048576 ? `${(b / 1024).toFixed(0)} КБ` : `${(b / 1048576).toFixed(1)} МБ`);
const phoneHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const waHref = (p, text) => 'https://wa.me/' + String(p || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
const icon = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const today = () => new Date().toISOString().slice(0, 10);

const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// ---------- архив tar.gz для резервной копии (без внешних зависимостей) ----------
function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512, 0);
  const nameBuf = Buffer.from(name, 'utf8');
  let prefix = Buffer.alloc(0);
  let base = nameBuf;
  if (nameBuf.length > 100) {
    const idx = name.lastIndexOf('/', 154);
    prefix = Buffer.from(name.slice(0, idx), 'utf8');
    base = Buffer.from(name.slice(idx + 1), 'utf8');
  }
  base.copy(h, 0, 0, Math.min(100, base.length));
  h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
  prefix.copy(h, 345, 0, Math.min(155, prefix.length));
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
function walk(dir, base, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = base + '/' + e.name;
    if (e.isDirectory()) walk(full, rel, out); else out.push([full, rel]);
  }
  return out;
}
// entries: [[absPath, nameInArchive]] ; extra: [[name, Buffer]]
function writeTarGz(stream, entries, extra = []) {
  const gz = zlib.createGzip();
  gz.pipe(stream);
  for (const [name, buf] of extra) {
    gz.write(tarHeader(name, buf.length, Date.now())); gz.write(buf);
    const pad = (512 - (buf.length % 512)) % 512; if (pad) gz.write(Buffer.alloc(pad));
  }
  for (const [abs, name] of entries) {
    const buf = fs.readFileSync(abs);
    const st = fs.statSync(abs);
    gz.write(tarHeader(name, buf.length, st.mtimeMs)); gz.write(buf);
    const pad = (512 - (buf.length % 512)) % 512; if (pad) gz.write(Buffer.alloc(pad));
  }
  gz.end(Buffer.alloc(1024));
}

module.exports = {
  esc, nl2br, lines, paragraphs, slugify, sanitizeHtml, stripTags, fmtDate, fmtDateShort, fmtDateTime, fmtMoney, fmtSize,
  phoneHref, waHref, icon, today, int, str, isEmail, walk, writeTarGz,
};
