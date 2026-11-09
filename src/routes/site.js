'use strict';
const express = require('express');
const { all, get, run, now, settings } = require('../db');
const { LANGS, strings } = require('../i18n');
const { str, int, isEmail, stripTags, waHref } = require('../util');
const { rateLimit } = require('../auth');
const { calcPrice } = require('../calc');
const { leadNotify } = require('../notify');

const router = express.Router();

const NEWS_CATS = ['company', 'tax', 'labor', 'tips', 'explain', 'clients'];

function seoMeta(res, key, extra = {}) {
  return { title: res.locals.t(`seo.${key}.title`), description: res.locals.t(`seo.${key}.description`), ...extra };
}

// ---------- Главная ----------
router.get('/', (req, res) => {
  const categories = all('SELECT * FROM service_categories ORDER BY sort, id');
  for (const c of categories) c.services = all('SELECT title_ru, title_kk FROM services WHERE category_id = ? AND active = 1 ORDER BY sort, id LIMIT 4', c.id);
  res.render('site/home', {
    meta: seoMeta(res, 'home'), page: 'home', categories,
    faq: all('SELECT * FROM faq WHERE published = 1 ORDER BY sort, id'),
    reviews: all('SELECT * FROM reviews WHERE published = 1 ORDER BY sort, id DESC'),
    posts: all('SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC LIMIT 3'),
    tariffs: settings().tariffs,
  });
});

// ---------- Услуги ----------
router.get('/uslugi', (req, res) => {
  const categories = all('SELECT * FROM service_categories ORDER BY sort, id');
  for (const c of categories) c.services = all('SELECT * FROM services WHERE category_id = ? AND active = 1 ORDER BY sort, id', c.id);
  const active = categories.find((c) => c.slug === req.query.cat) || categories[0];
  res.render('site/services', { meta: seoMeta(res, 'services'), page: 'services', categories, active });
});
router.get('/uslugi/:slug', (req, res) => res.redirect(301, res.locals.L(`/uslugi?cat=${encodeURIComponent(req.params.slug)}`)));

// ---------- Новости ----------
router.get('/novosti', (req, res) => {
  const cat = NEWS_CATS.includes(req.query.cat) ? req.query.cat : '';
  const perPage = 9;
  const pageNo = Math.max(1, int(req.query.page, 1));
  const where = `published = 1 AND published_at <= ? ${cat ? 'AND category = ?' : ''}`;
  const params = cat ? [now(), cat] : [now()];
  const total = get(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`, ...params).n;
  const posts = all(`SELECT * FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`, ...params, perPage, (pageNo - 1) * perPage);
  const counts = Object.fromEntries(all('SELECT category, COUNT(*) AS n FROM posts WHERE published = 1 AND published_at <= ? GROUP BY category', now()).map((r) => [r.category, r.n]));
  res.render('site/news', { meta: seoMeta(res, 'news'), page: 'news', posts, cat, cats: NEWS_CATS, counts, pageNo, pages: Math.max(1, Math.ceil(total / perPage)) });
});
router.get('/novosti/:slug', (req, res, next) => {
  const post = get('SELECT * FROM posts WHERE slug = ? AND published = 1', req.params.slug);
  if (!post) return next();
  const f = res.locals.f;
  const related = all('SELECT * FROM posts WHERE published = 1 AND id != ? AND published_at <= ? ORDER BY published_at DESC LIMIT 3', post.id, now());
  res.render('site/post', {
    page: 'news', post, related,
    meta: { title: `${f(post, 'title')} — «Диалог Учёт»`, description: f(post, 'excerpt') || stripTags(f(post, 'body')).slice(0, 160), image: post.image, type: 'article' },
  });
});

// ---------- О компании, Контакты ----------
router.get('/o-kompanii', (req, res) => res.render('site/about', { meta: seoMeta(res, 'about'), page: 'about' }));
router.get('/kontakty', (req, res) => res.render('site/contacts', { meta: seoMeta(res, 'contacts'), page: 'contacts' }));

// ---------- Приём заявок ----------
const TYPES = ['consult', 'request', 'callback', 'calc', 'contact'];
router.post('/api/lead', (req, res) => {
  const s = strings(req.lang);
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const fail = (code, msg) => (wantsJson ? res.status(code).json({ ok: false, error: msg }) : res.status(code).type('text').send(msg));
  const b = req.body || {};

  // защита от спама: скрытое поле, слишком быстрая отправка, частота
  if (b.website) return wantsJson ? res.json({ ok: true }) : res.redirect(res.locals.L('/'));
  const ts = int(b.ts, 0);
  if (ts && Date.now() - ts < 2500) return wantsJson ? res.json({ ok: true }) : res.redirect(res.locals.L('/'));
  if (!rateLimit(`lead:${req.ip}`, 6, 15 * 60 * 1000)) return fail(429, s.f_err_rate);

  const type = TYPES.includes(b.type) ? b.type : 'request';
  const name = str(b.name, 120);
  const phone = str(b.phone, 40);
  const digits = phone.replace(/\D/g, '');
  if (!name || digits.length < 10 || !b.consent) return fail(400, s.f_err_required);
  const email = str(b.email, 160);
  if (email && !isEmail(email)) return fail(400, s.f_err);

  let details = '';
  if (b.service) details = `Услуга: ${str(b.service, 200)}`;
  if (type === 'calc') {
    const p = { entity: b.entity === 'ip' ? 'ip' : 'too', regime: b.regime === 'our' ? 'our' : 'simplified', employees: int(b.employees), docs: int(b.docs), vat: !!b.vat, ved: !!b.ved, bank: !!b.bank };
    const price = calcPrice(settings().tariffs, p);
    const docs = ['до 10', 'до 50', 'до 150', 'свыше 150'][Math.max(0, Math.min(3, p.docs))];
    const opts = [p.vat && 'НДС (ф. 300)', p.ved && 'ВЭД (ф. 328)', p.bank && 'интернет-банкинг'].filter(Boolean).join(', ') || 'нет';
    details = `${p.entity === 'ip' ? 'ИП' : 'ТОО'}, ${p.regime === 'our' ? 'ОУР' : 'упрощёнка'}; сотрудников: ${p.employees}; документов: ${docs}; опции: ${opts}. Расчёт: от ${price.toLocaleString('ru-RU')} ₸/мес.`;
  }

  const page = str(b.page, 300);
  const t = now();
  const r = run(`INSERT INTO leads(created_at, type, name, phone, email, company, message, details, page, lang, ip, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, t, type, name, phone, email, str(b.company, 200), str(b.message, 3000), details, page, req.lang, req.ip || '', t);
  const lead = get('SELECT * FROM leads WHERE id = ?', r.lastInsertRowid);
  leadNotify(lead, req.baseUrl0);

  if (wantsJson) return res.json({ ok: true, title: s.f_ok_title, text: s.f_ok_text });
  res.redirect(res.locals.L('/spasibo'));
});

router.get('/spasibo', (req, res) => res.render('site/thanks', { meta: { title: res.locals.s.f_ok_title }, noindex: true, page: '' }));

// ---------- robots.txt и sitemap.xml ----------
router.get('/robots.txt', (req, res) => {
  if (req.lang !== 'ru') return res.status(404).end();
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /cabinet\nDisallow: /kk/cabinet\nDisallow: /api/\nDisallow: /spasibo\nDisallow: /kk/spasibo\n\nSitemap: ${req.baseUrl0}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  if (req.lang !== 'ru') return res.status(404).end();
  const base = req.baseUrl0;
  const urls = [
    ['/', null, '1.0'], ['/uslugi', null, '0.9'], ['/novosti', null, '0.7'], ['/o-kompanii', null, '0.6'], ['/kontakty', null, '0.6'],
  ];
  for (const p of all('SELECT slug, updated_at FROM pages WHERE published = 1')) urls.push([`/${p.slug}`, p.updated_at, '0.4']);
  for (const p of all('SELECT slug, updated_at FROM posts WHERE published = 1 AND published_at <= ?', now())) urls.push([`/novosti/${p.slug}`, p.updated_at, '0.6']);
  const href = (l, p) => base + (l === 'ru' ? '' : `/${l}`) + (p === '/' && l !== 'ru' ? '' : p);
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  for (const [p, mod, prio] of urls) {
    for (const l of LANGS) {
      xml.push(`<url><loc>${href(l, p)}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}<priority>${prio}</priority>`);
      for (const l2 of LANGS) xml.push(`<xhtml:link rel="alternate" hreflang="${l2}" href="${href(l2, p)}"/>`);
      xml.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${href('ru', p)}"/></url>`);
    }
  }
  xml.push('</urlset>');
  res.type('application/xml').send(xml.join('\n'));
});

// короткая ссылка на WhatsApp (удобно для QR-кодов и визиток)
router.get('/whatsapp', (req, res) => res.redirect(waHref(settings().whatsapp)));

// ---------- Страницы, созданные в панели управления ----------
router.get('/:slug', (req, res, next) => {
  if (!/^[a-z0-9-]+$/.test(req.params.slug)) return next();
  const p = get('SELECT * FROM pages WHERE slug = ? AND published = 1', req.params.slug);
  if (!p) return next();
  const f = res.locals.f;
  res.render('site/page', { page: `p:${p.slug}`, p, meta: { title: `${f(p, 'title')} — «Диалог Учёт»`, description: f(p, 'desc') } });
});

module.exports = router;
