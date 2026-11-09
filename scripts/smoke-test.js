'use strict';
// Сквозная проверка сайта на временной базе: node scripts/smoke-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-test-'));
process.env.DATA_DIR = TMP;
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin-test-pass-1';

const { app, ensureAdmin } = require('../server');

ensureAdmin();

let passed = 0, failed = 0;
const ok = (cond, name, extra = '') => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name, extra); } };

function agent(base) {
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, url, { form, json, multipart, headers = {} } = {}) {
    const h = { cookie: cookie(), ...headers };
    let body;
    if (form) { body = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    if (json) { body = JSON.stringify(json); h['content-type'] = 'application/json'; }
    if (multipart) body = multipart;
    const r = await fetch(base + url, { method, headers: h, body, redirect: 'manual' });
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const v = kv.slice(i + 1);
      if (v) jar[kv.slice(0, i)] = v; else delete jar[kv.slice(0, i)];
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, location: r.headers.get('location') || '', text: buf.toString('utf8'), buf, headers: r.headers };
  }
  return { get: (u, o) => req('GET', u, o), post: (u, o) => req('POST', u, o), jar };
}
const csrfOf = (html) => (html.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];

(async () => {
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    console.log('Публичная часть');
    const pub = agent(base);
    for (const u of ['/', '/uslugi', '/uslugi?cat=kadrovyy-uchet', '/novosti', '/o-kompanii', '/kontakty', '/politika-konfidencialnosti',
      '/kk', '/kk/uslugi', '/kk/novosti', '/kk/o-kompanii', '/kk/kontakty', '/cabinet/login', '/kk/cabinet/register', '/admin/login']) {
      const r = await pub.get(u);
      ok(r.status === 200, `GET ${u} → 200`, r.status);
    }
    ok((await pub.get('/net-takoy')).status === 404, '404 для несуществующей страницы');
    const home = await pub.get('/');
    ok(home.text.includes('Профессиональное бухгалтерское обслуживание'), 'H1 главной из ТЗ');
    ok(home.text.includes('181040019474') && home.text.includes('Кузьменко'), 'реквизиты компании на главной');
    ok(home.text.includes('hreflang="kk"'), 'hreflang для казахской версии');
    ok(home.text.includes('/admin') && home.text.includes('Вход для сотрудников'), 'вход для сотрудников в подвале');
    ok(home.text.includes('href="/cabinet"') && home.text.includes('Личный кабинет'), 'кнопка «Личный кабинет» в шапке');
    const kk = await pub.get('/kk');
    ok(kk.text.includes('lang="kk"') && kk.text.includes('Қазақстандағы'), 'казахская главная');
    const sm = await pub.get('/sitemap.xml');
    ok(sm.text.includes('<urlset') && sm.text.includes('/kk/uslugi'), 'sitemap.xml с обеими языковыми версиями');
    ok((await pub.get('/robots.txt')).text.includes('Disallow: /admin'), 'robots.txt закрывает панель');

    console.log('Заявки');
    const ts = String(Date.now() - 10000);
    let r = await pub.post('/api/lead', { form: { type: 'consult', name: 'Тест Тестов', phone: '+7 701 111 2233', consent: '1', ts, page: '/' }, headers: { accept: 'application/json' } });
    ok(r.status === 200 && JSON.parse(r.text).ok, 'заявка «консультация» принята');
    r = await pub.post('/api/lead', { form: { type: 'calc', name: 'Калькулятор', phone: '+7 701 111 2234', consent: '1', ts, entity: 'too', regime: 'our', employees: '5', docs: '2', vat: '1' }, headers: { accept: 'application/json' } });
    ok(r.status === 200, 'заявка из калькулятора принята');
    r = await pub.post('/kk/api/lead', { form: { type: 'callback', name: 'Айгүл', phone: '+7 702 000 0000', consent: '1', ts }, headers: { accept: 'application/json' } });
    ok(r.status === 200, 'заявка с казахской версии');
    r = await pub.post('/api/lead', { form: { type: 'consult', name: '', phone: '1', ts }, headers: { accept: 'application/json' } });
    ok(r.status === 400, 'пустая заявка отклоняется');
    r = await pub.post('/api/lead', { form: { type: 'consult', name: 'Бот', phone: '+7 701 111 2233', consent: '1', website: 'spam', ts } , headers: { accept: 'application/json' } });
    ok(r.status === 200, 'ловушка для ботов отвечает «ок», но не сохраняет');
    r = await pub.post('/api/lead', { form: { type: 'request', name: 'Без JS', phone: '+7 701 111 2235', consent: '1' } });
    ok(r.status === 302 && r.location === '/spasibo', 'отправка формы без JavaScript → страница «спасибо»');

    console.log('Регистрация и кабинет клиента');
    const cl = agent(base);
    r = await cl.post('/cabinet/register', { form: { company: 'ТОО «Тест»', entity_type: 'too', bin: '123', tax_regime: 'simplified', contact_name: 'Иван Петров', phone: '+7 701 555 4433', email: 'client@test.kz', password: 'secret123', password2: 'secret123', consent: '1' } });
    ok(r.status === 400 && r.text.includes('12 цифр'), 'проверка БИН при регистрации');
    r = await cl.post('/cabinet/register', { form: { company: 'ТОО «Тест»', entity_type: 'too', bin: '123456789012', tax_regime: 'simplified', contact_name: 'Иван Петров', phone: '+7 701 555 4433', email: 'client@test.kz', password: 'secret123', password2: 'secret123', consent: '1' } });
    ok(r.status === 302 && r.location === '/cabinet', 'регистрация клиента');
    r = await cl.get('/cabinet');
    ok(r.status === 200 && r.text.includes('Заявка на подключение'), 'кабинет: статус «Заявка на подключение»');
    let ccsrf = csrfOf(r.text);
    ok(!!ccsrf, 'CSRF-токен в кабинете');
    const fd = new FormData();
    fd.append('_csrf', ccsrf); fd.append('comment', 'Выписка за октябрь');
    fd.append('files', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'Выписка октябрь.pdf');
    r = await cl.post('/cabinet/documents', { multipart: fd });
    ok(r.status === 302 && r.location.includes('ok=c_uploaded'), 'клиент загрузил документ');
    const fd2 = new FormData(); fd2.append('_csrf', ccsrf); fd2.append('files', new Blob(['MZ']), 'virus.exe');
    r = await cl.post('/cabinet/documents', { multipart: fd2 });
    ok(r.location.includes('err=c_upload_err'), 'запрещённый тип файла отклонён');
    r = await cl.get('/cabinet/documents');
    ok(r.text.includes('Выписка октябрь.pdf'), 'загруженный файл в списке');
    r = await cl.post('/cabinet/messages', { form: { _csrf: ccsrf, body: 'Добрый день! Когда сдаём 910?' } });
    ok(r.status === 302, 'клиент отправил сообщение');
    r = await cl.post('/cabinet/messages', { form: { body: 'без токена' } });
    ok(r.status === 403, 'запрос без CSRF-токена отклонён');
    r = await cl.get('/kk/cabinet');
    ok(r.text.includes('Қосылуға өтінім'), 'кабинет на казахском');

    console.log('Панель управления');
    const ad = agent(base);
    ok((await ad.get('/admin')).location === '/admin/login', 'панель закрыта без входа');
    r = await ad.post('/admin/login', { form: { email: 'admin@test.local', password: 'wrong' } });
    ok(r.status === 400, 'неверный пароль не пускает');
    r = await ad.post('/admin/login', { form: { email: 'admin@test.local', password: 'Admin-test-pass-1' } });
    ok(r.status === 302 && r.location === '/admin', 'вход администратора');
    r = await ad.get('/admin');
    const acsrf = csrfOf(r.text);
    ok(r.status === 200 && r.text.includes('Новых заявок'), 'обзор панели');
    r = await ad.get('/admin/leads');
    ok(r.text.includes('Тест Тестов') && r.text.includes('Калькулятор') && !r.text.includes('>Бот<'), 'заявки видны, бот не сохранён');
    const lr = await ad.get('/admin/leads/2');
    ok(lr.text.includes('ТОО, ОУР; сотрудников: 5') && lr.text.includes('₸/мес'), 'расчёт калькулятора пересчитан сервером');
    r = await ad.post('/admin/leads/1', { form: { _csrf: acsrf, status: 'in_progress', notes: 'Перезвонить в 15:00', assigned_id: '1' } });
    ok(r.status === 302, 'смена статуса заявки');
    r = await ad.get('/admin/leads.csv');
    ok(r.text.includes('Тест Тестов'), 'выгрузка заявок в CSV');

    r = await ad.get('/admin/clients');
    ok(r.text.includes('ТОО «Тест»'), 'новый клиент в списке');
    const cid = (r.text.match(/\/admin\/clients\/(\d+)/) || [])[1];
    r = await ad.get(`/admin/clients/${cid}?tab=files`);
    ok(r.text.includes('Выписка октябрь.pdf') && r.text.includes('новый'), 'документ клиента виден сотруднику');
    const fid = (r.text.match(/\/admin\/files\/(\d+)"/) || [])[1];
    r = await ad.get(`/admin/files/${fid}`);
    ok(r.status === 200 && r.text.startsWith('%PDF') && (r.headers.get('content-disposition') || '').includes('UTF-8'), 'сотрудник скачал документ');
    r = await ad.post(`/admin/clients/${cid}`, { form: { _csrf: acsrf, status: 'active', accountant_id: '1', tariff: '45000', contract_no: '15/26', contract_date: '2026-11-01', company: 'ТОО «Тест»', contact_name: 'Иван Петров', phone: '+7 701 555 4433', email: 'client@test.kz', bin: '123456789012', entity_type: 'too', tax_regime: 'simplified', internal_notes: 'VIP' } });
    ok(r.status === 302, 'клиент подключён (статус, бухгалтер, тариф)');
    r = await ad.post(`/admin/clients/${cid}/reports`, { form: { _csrf: acsrf, title: 'ФНО 910.00 — упрощённая декларация', period: '2 полугодие 2026', deadline: '2027-02-15', status: 'in_progress' } });
    ok(r.status === 302, 'добавлен отчёт');
    r = await ad.post(`/admin/clients/${cid}/reports`, { form: { _csrf: acsrf, title: 'ФНО 200.00', period: '3 квартал 2026', deadline: '2020-01-01', status: 'planned' } });
    r = await ad.get('/admin');
    ok(r.text.includes('просрочен'), 'просроченный отчёт виден на обзоре');
    const fd3 = new FormData(); fd3.append('_csrf', acsrf); fd3.append('comment', 'Акт сверки');
    fd3.append('files', new Blob(['xlsx']), 'Акт сверки.xlsx');
    r = await ad.post(`/admin/clients/${cid}/files`, { multipart: fd3 });
    ok(r.location.includes('ok=uploaded'), 'сотрудник отправил документ клиенту');
    r = await ad.post(`/admin/clients/${cid}/messages`, { form: { _csrf: acsrf, body: 'Сдадим до 15 февраля.' } });
    ok(r.status === 302, 'сотрудник ответил клиенту');

    r = await cl.get('/cabinet');
    ok(r.text.includes('Обслуживание активно') && /45\s000/.test(r.text) && r.text.includes('15/26'), 'клиент видит активный статус, тариф и договор');
    ok(r.text.includes('ФНО 910.00'), 'клиент видит отчёт в ближайших сроках');
    r = await cl.get('/cabinet/messages');
    ok(r.text.includes('Сдадим до 15 февраля.'), 'клиент видит ответ бухгалтера');
    r = await cl.get('/cabinet/documents');
    ok(r.text.includes('Акт сверки.xlsx'), 'клиент видит документ от бухгалтера');

    console.log('Управление контентом');
    r = await ad.post('/admin/texts', { form: { _csrf: acsrf, grp: 'Главная: первый экран', key: 'home.hero.title', 'ru__home.hero.title': 'Новый заголовок для проверки', 'kk__home.hero.title': 'Жаңа тақырып' } });
    ok(r.status === 302, 'сохранение текстов');
    ok((await pub.get('/')).text.includes('Новый заголовок для проверки'), 'новый текст на главной');
    ok((await pub.get('/kk')).text.includes('Жаңа тақырып'), 'новый текст на казахской главной');
    const pf = new FormData();
    for (const [k, v] of Object.entries({ _csrf: acsrf, title_ru: 'Изменения по НДС с 2027 года', title_kk: 'ҚҚС өзгерістері', category: 'tax', published_at: '2026-11-09', slug: '', excerpt_ru: 'Кратко', excerpt_kk: 'Қысқаша', body_ru: '<h2>Что изменилось</h2><p>Текст <script>alert(1)</script><a href="javascript:alert(1)">ссылка</a></p>', body_kk: '<p>Мәтін</p>', published: '1' })) pf.append(k, v);
    pf.append('image', new Blob([fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'hero.jpg'))], { type: 'image/jpeg' }), 'cover.jpg');
    r = await ad.post('/admin/content/posts/new', { multipart: pf });
    ok(r.status === 302 && r.location.includes('ok=created'), 'создана новость с обложкой');
    r = await pub.get('/novosti/izmeneniya-po-nds-s-2027-goda');
    ok(r.status === 200 && r.text.includes('Что изменилось') && r.text.includes('/uploads/'), 'новость опубликована на сайте');
    ok(!r.text.includes('alert(1)'), 'опасный HTML вырезан');
    ok((await pub.get('/kk/novosti/izmeneniya-po-nds-s-2027-goda')).text.includes('ҚҚС өзгерістері'), 'новость на казахском');
    ok((await pub.get('/sitemap.xml')).text.includes('izmeneniya-po-nds-s-2027-goda'), 'новость попала в sitemap');
    const pg = new FormData();
    for (const [k, v] of Object.entries({ _csrf: acsrf, title_ru: 'Регистрация ТОО', title_kk: 'ЖШС тіркеу', slug: '', body_ru: '<p>Описание услуги</p>', body_kk: '<p>Сипаттама</p>', in_menu: '1', sort: '10', published: '1' })) pg.append(k, v);
    r = await ad.post('/admin/content/pages/new', { multipart: pg });
    ok(r.status === 302, 'добавлена новая страница');
    r = await pub.get('/registraciya-too');
    ok(r.status === 200 && r.text.includes('Описание услуги'), 'новая страница открывается');
    ok((await pub.get('/')).text.includes('href="/registraciya-too"'), 'новая страница появилась в меню');
    const rv = new FormData();
    for (const [k, v] of Object.entries({ _csrf: acsrf, author: 'Алия С.', company: 'ИП «Алия»', text_ru: 'Отличный сервис', text_kk: 'Тамаша қызмет', published: '1' })) rv.append(k, v);
    await ad.post('/admin/content/reviews/new', { multipart: rv });
    ok((await pub.get('/')).text.includes('Отличный сервис'), 'отзыв появился на главной');
    r = await ad.post('/admin/tariffs', { form: { _csrf: acsrf, base_ip: '30000', base_too: '50000', regime_our: '20000', per_employee: '3000', docs_10: '0', docs_50: '10000', docs_150: '25000', docs_more: '50000', opt_vat: '20000', opt_ved: '25000', opt_bank: '10000' } });
    ok(r.status === 302 && (await pub.get('/')).text.includes('&#34;base_too&#34;:50000'), 'цены калькулятора обновлены');
    r = await ad.post('/admin/contacts', { form: { _csrf: acsrf, company_name_ru: 'ТОО «Образцовая бухгалтерия „Диалог Учёт“»', company_name_kk: 'ЖШС', brand_ru: 'Диалог Учёт', brand_kk: 'Диалог Учёт', brand_sub_ru: 'Образцовая бухгалтерия', brand_sub_kk: 'Үлгілі бухгалтерия', director_ru: 'Кузьменко Наталья Вячеславовна', director_kk: 'Кузьменко Наталья Вячеславовна', legal_address_ru: 'Павлодар', legal_address_kk: 'Павлодар', hours_ru: 'Пн–Пт 9–16', hours_kk: 'Дс–Жм 9–16', bin: '181040019474', reg_date: '2018-10-16', phones: '+7 771 037 7827\n+7 708 466 6708', whatsapp: '+7 771 037 7827', email: 'info@test.kz', o0_city_ru: 'Алматы', o0_address_ru: 'ул. Мынбаева, 46', soc_instagram: 'https://instagram.com/test' } });
    ok(r.status === 302 && (await pub.get('/kontakty')).text.includes('info@test.kz'), 'контакты обновлены на сайте');
    r = await ad.post('/admin/staff', { form: { _csrf: acsrf, name: 'Бухгалтер Тест', email: 'acc@test.local', role: 'accountant' } });
    const accPass = (r.text.match(/<span>Пароль<\/span><code>([^<]+)</) || [])[1];
    ok(!!accPass, 'добавлен сотрудник-бухгалтер, показан пароль');
    r = await ad.get('/admin/backup/full');
    let tarOk = false; try { const t = zlib.gunzipSync(r.buf); tarOk = t.includes(Buffer.from('data/site.sqlite')) && t.includes(Buffer.from('data/files/')); } catch (e) { /* */ }
    ok(r.status === 200 && tarOk, 'полная резервная копия скачивается (tar.gz с базой и файлами)');

    console.log('Права доступа');
    const acc = agent(base);
    await acc.post('/admin/login', { form: { email: 'acc@test.local', password: accPass } });
    ok((await acc.get('/admin/clients')).status === 200, 'бухгалтер видит клиентов');
    ok((await acc.get('/admin/texts')).status === 403, 'бухгалтеру закрыт контент сайта');
    ok((await acc.get('/admin/settings')).status === 403, 'бухгалтеру закрыты настройки');
    ok((await cl.get('/admin')).location === '/admin/login', 'клиент не попадает в панель');
    ok((await pub.get(`/cabinet/files/${fid}`)).location === '/cabinet/login', 'документы клиента не доступны без входа');
    const other = agent(base);
    await other.post('/cabinet/register', { form: { company: 'ИП Другой', entity_type: 'ip', bin: '', tax_regime: 'other', contact_name: 'Другой', phone: '+7 700 000 0001', email: 'other@test.kz', password: 'secret123', password2: 'secret123', consent: '1' } });
    ok((await other.get(`/cabinet/files/${fid}`)).status === 404, 'чужие документы недоступны другому клиенту');
    r = await cl.post('/cabinet/logout', { form: { _csrf: ccsrf } });
    ok((await cl.get('/cabinet')).location === '/cabinet/login', 'выход из кабинета');
  } catch (e) {
    failed++; console.error(e);
  } finally {
    srv.close();
    console.log(`\nИтог: ${passed} проверок пройдено, ${failed} не пройдено`);
    try { require('../src/db').db.close(); } catch { /* */ }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
    process.exitCode = failed ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 200);
  }
})();
