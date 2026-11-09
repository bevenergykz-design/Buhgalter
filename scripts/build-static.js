'use strict';
// Статический предпросмотр публичной части для Netlify: node scripts/build-static.js → папка dist/
// Полноценный сайт (заявки в базу, личный кабинет, панель) работает только на Node-сервере (см. docs/ЗАЛИВКА-PS-KZ.md).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-static-'));
process.env.STATIC_BUILD = '1';
process.env.ADMIN_PASSWORD = require('crypto').randomBytes(12).toString('hex'); // не пишем FIRST-ADMIN.txt

const { app } = require('../server');
const { all, setSetting, settings } = require('../src/db');
const SITE_URL = (process.env.URL || 'https://buhgalterservices.netlify.app').replace(/\/$/, '');
setSetting('site_url', SITE_URL);

const PUBLIC = ['/', '/uslugi', '/novosti', '/o-kompanii', '/kontakty', '/spasibo'];
for (const p of all('SELECT slug FROM pages WHERE published = 1')) PUBLIC.push(`/${p.slug}`);
for (const p of all('SELECT slug FROM posts WHERE published = 1')) PUBLIC.push(`/novosti/${p.slug}`);
const AUTH = ['/cabinet/login', '/cabinet/register', '/cabinet/forgot'];

// на страницах кабинета/панели формы в предпросмотре не отправляются
const BLOCK = `<div class="preview-bar" style="position:fixed;left:0;right:0;bottom:0;z-index:999">Предварительный просмотр: вход и регистрация заработают после размещения сайта на сервере. · Алдын ала көрініс: кіру және тіркелу сайт серверге орналастырылғаннан кейін жұмыс істейді.</div>
<script>document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();alert(document.documentElement.lang==='kk'?'Бұл — алдын ала көрініс. Кіру және тіркелу сайт серверге орналастырылғаннан кейін жұмыс істейді.':'Это предварительный просмотр. Вход и регистрация заработают после размещения сайта на сервере.');},true);</script>`;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
function write(urlPath, html) {
  const files = urlPath === '/' ? ['index.html'] : [`${urlPath.slice(1)}.html`];
  if (urlPath === '/kk') files.push('kk/index.html');
  for (const f of files) {
    const out = path.join(DIST, f);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
  }
}

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'public'), DIST);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (u) => { const r = await fetch(base + u); return { status: r.status, text: await r.text() }; };
  let n = 0;
  try {
    for (const p of PUBLIC) {
      for (const pre of ['', '/kk']) {
        const url = pre + (p === '/' && pre ? '' : p);
        const r = await get(url);
        if (r.status !== 200) throw new Error(`${url} → ${r.status}`);
        write(url || '/', r.text); n++;
      }
    }
    for (const p of AUTH) {
      for (const pre of ['', '/kk']) {
        const r = await get(pre + p);
        write(pre + p, r.text.replace('</body>', BLOCK + '</body>')); n++;
      }
    }
    const adm = await get('/admin/login');
    write('/admin/login', adm.text.replace('</body>', BLOCK + '</body>')); n++;
    const nf = await get('/stranica-ne-naydena');
    fs.writeFileSync(path.join(DIST, '404.html'), nf.text);
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), (await get('/sitemap.xml')).text);
    // предпросмотр не должен попадать в поиск — основной адрес будет на своём домене
    fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    const wa = String(settings().whatsapp || '').replace(/\D/g, '');
    const cabRoutes = ['', '/documents', '/reports', '/messages', '/profile', '/reset/*'];
    fs.writeFileSync(path.join(DIST, '_redirects'), [
      ...cabRoutes.map((r) => `/cabinet${r}  /cabinet/login  302`),
      ...cabRoutes.map((r) => `/kk/cabinet${r}  /kk/cabinet/login  302`),
      '/admin  /admin/login  302',
      wa ? `/whatsapp  https://wa.me/${wa}  302` : '',
    ].filter(Boolean).join('\n') + '\n');
    console.log(`Готово: ${n} страниц в ${DIST} (адрес: ${SITE_URL})`);
  } catch (e) {
    console.error('Ошибка сборки:', e.message);
    process.exitCode = 1;
  } finally {
    srv.close();
    try { require('../src/db').db.close(); } catch { /* */ }
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
})();
