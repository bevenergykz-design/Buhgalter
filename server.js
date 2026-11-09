'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');

const dbm = require('./src/db');
const { all, get, run, now, settings, texts, DATA_DIR, DB_PATH } = dbm;
const { LANGS, LANG_LABELS, HTML_LANG, strings } = require('./src/i18n');
const U = require('./src/util');
const auth = require('./src/auth');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('view cache', true);

// ---------- базовые заголовки безопасности ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// ---------- статика ----------
const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0, index: false };
app.use(express.static(path.join(ROOT, 'public'), staticOpts));
app.use('/uploads', express.static(require('./src/files').UPLOADS_DIR, staticOpts));

app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '1mb' }));

// ---------- язык: /kk/... — казахская версия, без префикса — русская ----------
app.use((req, res, next) => {
  let lang = 'ru';
  for (const l of LANGS) {
    if (l === 'ru') continue;
    if (req.url === `/${l}` || req.url.startsWith(`/${l}/`) || req.url.startsWith(`/${l}?`)) {
      lang = l;
      req.url = req.url.slice(l.length + 1) || '/';
      if (req.url.startsWith('?')) req.url = '/' + req.url;
      break;
    }
  }
  req.lang = lang;
  next();
});

// ---------- общие переменные для шаблонов ----------
app.use((req, res, next) => {
  const lang = req.lang;
  const st = settings();
  const tx = texts()[lang] || texts().ru;
  const prefix = lang === 'ru' ? '' : `/${lang}`;
  const pathOnly = req.path;
  const base = st.site_url ? st.site_url.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
  req.baseUrl0 = base;
  const L = (p) => (prefix + (p === '/' && prefix ? '' : p)) || '/';
  Object.assign(res.locals, U, {
    lang, LANGS, LANG_LABELS, htmlLang: HTML_LANG[lang], s: strings(lang), st, tx,
    t: (key) => tx[key] ?? '',
    f: (obj, field) => (obj ? (obj[`${field}_${lang}`] || obj[`${field}_ru`] || '') : ''), // поле на текущем языке
    sv: (key) => st[`${key}_${lang}`] || st[`${key}_ru`] || '',
    L, curPath: pathOnly, baseUrl: base,
    langUrl: (l) => (l === 'ru' ? '' : `/${l}`) + (pathOnly === '/' && l !== 'ru' ? '' : pathOnly) || '/',
    absUrl: (l, p = pathOnly) => base + (l === 'ru' ? '' : `/${l}`) + (p === '/' && l !== 'ru' ? '' : p),
    menuPages: all('SELECT slug, title_ru, title_kk FROM pages WHERE published = 1 AND in_menu = 1 ORDER BY sort, id'),
    footerPages: all('SELECT slug, title_ru, title_kk FROM pages WHERE published = 1 AND in_footer = 1 ORDER BY sort, id'),
    meta: {}, noindex: false,
  });
  next();
});

// ---------- маршруты ----------
app.use('/admin', require('./src/routes/admin'));
app.use('/cabinet', require('./src/routes/cabinet'));
app.use('/', require('./src/routes/site'));

// 404
app.use((req, res) => {
  res.status(404);
  if (req.originalUrl.startsWith('/admin')) return res.type('text').send('Не найдено');
  res.render('site/404', { meta: { title: res.locals.s.not_found_title }, noindex: true });
});
// ошибки
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err);
  if (res.headersSent) return;
  res.status(err.status || 500).type('text').send(err.expose ? err.message : 'Внутренняя ошибка сервера. Попробуйте позже.');
});

// ---------- первый администратор ----------
function ensureAdmin() {
  if (get('SELECT 1 FROM staff LIMIT 1')) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@dialog-uchet.local').toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || auth.randomPassword(14);
  run('INSERT INTO staff(name, email, pass_hash, role, created_at) VALUES(?,?,?,?,?)', 'Администратор', email, auth.hashPassword(pass), 'admin', now());
  if (!process.env.ADMIN_PASSWORD) {
    const f = path.join(DATA_DIR, 'FIRST-ADMIN.txt');
    fs.writeFileSync(f, `Вход в панель управления: /admin\nE-mail: ${email}\nПароль: ${pass}\n\nСмените пароль после первого входа и удалите этот файл.\n`);
    console.log(`[setup] Создан администратор ${email}. Пароль записан в ${f}`);
  }
}

// ---------- автоматическое резервное копирование базы (раз в сутки, хранится 14 копий) ----------
function autoBackup() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    const file = path.join(dir, `site-${U.today()}.sqlite`);
    if (!fs.existsSync(file)) {
      dbm.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      const list = fs.readdirSync(dir).filter((f) => /^site-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
      list.slice(0, Math.max(0, list.length - 14)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    }
  } catch (e) { console.error('[backup]', e.message); }
  auth.cleanupSessions();
}

if (require.main === module) {
  ensureAdmin();
  autoBackup();
  setInterval(autoBackup, 6 * 3600 * 1000).unref();
  app.listen(PORT, () => console.log(`Сайт «Диалог Учёт» запущен: http://localhost:${PORT}  (база: ${DB_PATH})`));
}

module.exports = { app, ensureAdmin };
