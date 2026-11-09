'use strict';
// Личный кабинет клиента: регистрация, вход, документы, отчётность, сообщения, профиль
const express = require('express');
const { all, get, run, now, settings } = require('../db');
const { strings } = require('../i18n');
const A = require('../auth');
const { str, isEmail, int } = require('../util');
const { clientDocsUpload, removeClientFile, sendDownload } = require('../files');
const { notifyStaff, sendMail, webhook } = require('../notify');

const router = express.Router();

const ENTITY = ['ip', 'too', 'other'];
const REGIME = ['simplified', 'our', 'other'];

// ---------- сессия клиента ----------
router.use((req, res, next) => {
  res.locals.noindex = true;
  res.locals.bodyClass = 'cab';
  const sess = A.loadSession(req, 'client');
  if (sess) {
    const c = get('SELECT * FROM clients WHERE id = ?', sess.user_id);
    if (c) { req.cu = c; req.sess = sess; res.locals.cu = c; res.locals.csrf = sess.csrf; }
  }
  // флэш-сообщение через query (?ok=… / ?err=…)
  const fl = (k) => { const v = k ? strings(req.lang)[k] : ''; return typeof v === 'string' ? v : ''; };
  res.locals.flash = { ok: fl(req.query.ok), err: fl(req.query.err) };
  next();
});

const need = (req, res, next) => (req.cu ? next() : res.redirect(res.locals.L('/cabinet/login')));
const csrf = (req, res, next) => (A.checkCsrf(req, req.sess) ? next() : res.status(403).type('text').send(strings(req.lang).csrf_error));

function cabRender(res, view, data) {
  const c = res.locals.cu;
  const unread = c ? get("SELECT COUNT(*) AS n FROM messages WHERE client_id = ? AND sender = 'staff' AND is_read = 0", c.id).n : 0;
  const newFiles = c ? get("SELECT COUNT(*) AS n FROM client_files WHERE client_id = ? AND direction = 'out' AND seen = 0", c.id).n : 0;
  res.render(view, { unread, newFiles, meta: { title: `${data.title} — ${res.locals.s.cabinet}` }, ...data });
}

// ---------- вход ----------
router.get('/login', (req, res) => {
  if (req.cu) return res.redirect(res.locals.L('/cabinet'));
  res.render('cabinet/login', { meta: { title: res.locals.s.c_login_title }, error: '', email: '', info: res.locals.flash.ok });
});
router.post('/login', (req, res) => {
  const s = res.locals.s;
  const email = str(req.body.email, 160).toLowerCase();
  const render = (error) => res.status(400).render('cabinet/login', { meta: { title: s.c_login_title }, error, email, info: '' });
  if (!A.rateLimit(`clogin:${req.ip}`, 10, 15 * 60 * 1000)) return render(s.c_err_rate);
  const c = get('SELECT * FROM clients WHERE email = ?', email);
  if (!c) { A.fakeVerify(); return render(s.c_err_login); }
  if (!A.verifyPassword(req.body.password || '', c.pass_hash)) return render(s.c_err_login);
  A.resetRate(`clogin:${req.ip}`);
  A.createSession(req, res, 'client', c.id);
  run('UPDATE clients SET last_login = ?, lang = ? WHERE id = ?', now(), req.lang, c.id);
  res.redirect(res.locals.L('/cabinet'));
});

// ---------- регистрация ----------
router.get('/register', (req, res) => {
  if (req.cu) return res.redirect(res.locals.L('/cabinet'));
  res.render('cabinet/register', { meta: { title: res.locals.s.c_register_title }, error: '', v: {} });
});
router.post('/register', (req, res) => {
  const s = res.locals.s;
  const b = req.body;
  const v = {
    contact_name: str(b.contact_name, 120), company: str(b.company, 200), bin: str(b.bin, 20).replace(/\s/g, ''),
    phone: str(b.phone, 40), email: str(b.email, 160).toLowerCase(),
    entity_type: ENTITY.includes(b.entity_type) ? b.entity_type : 'too', tax_regime: REGIME.includes(b.tax_regime) ? b.tax_regime : 'other',
  };
  const render = (error) => res.status(400).render('cabinet/register', { meta: { title: s.c_register_title }, error, v });
  if (b.website) return res.redirect(res.locals.L('/cabinet/login'));
  if (!A.rateLimit(`creg:${req.ip}`, 5, 60 * 60 * 1000)) return render(s.c_err_rate);
  if (!v.contact_name || !v.company || !v.phone || !v.email || !b.password) return render(s.c_err_required);
  if (!isEmail(v.email)) return render(s.c_err_email);
  if (v.bin && !/^\d{12}$/.test(v.bin)) return render(s.c_err_bin);
  if (String(b.password).length < 8) return render(s.c_err_pass_short);
  if (b.password !== b.password2) return render(s.c_err_pass_match);
  if (!b.consent) return render(s.c_err_consent);
  if (get('SELECT 1 FROM clients WHERE email = ?', v.email)) return render(s.c_err_exists);

  const r = run(`INSERT INTO clients(email, pass_hash, contact_name, company, bin, phone, entity_type, tax_regime, status, lang, created_at, last_login)
    VALUES(?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`, v.email, A.hashPassword(b.password), v.contact_name, v.company, v.bin, v.phone, v.entity_type, v.tax_regime, req.lang, now(), now());
  A.createSession(req, res, 'client', r.lastInsertRowid);
  notifyStaff('Новая регистрация в личном кабинете', [
    ['Компания', v.company], ['БИН/ИИН', v.bin || '—'], ['Контакт', v.contact_name], ['Телефон', v.phone], ['E-mail', v.email],
  ], `${req.baseUrl0}/admin/clients/${r.lastInsertRowid}`);
  webhook('client.registered', { client: { id: r.lastInsertRowid, ...v } });
  res.redirect(res.locals.L('/cabinet'));
});

// ---------- восстановление пароля ----------
router.get('/forgot', (req, res) => res.render('cabinet/forgot', { meta: { title: res.locals.s.c_forgot_title }, sent: false }));
router.post('/forgot', async (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  if (A.rateLimit(`cforgot:${req.ip}`, 5, 60 * 60 * 1000)) {
    const c = get('SELECT id, contact_name, lang FROM clients WHERE email = ?', email);
    if (c) {
      const token = A.createResetToken('client', c.id);
      const link = `${req.baseUrl0}${res.locals.L('/cabinet/reset/' + token)}`;
      sendMail(email, 'Восстановление пароля — личный кабинет «Диалог Учёт»',
        `Здравствуйте, ${c.contact_name}!\n\nДля смены пароля перейдите по ссылке (действует 2 часа):\n${link}\n\nЕсли вы не запрашивали смену пароля, просто проигнорируйте это письмо.`);
    }
  }
  res.render('cabinet/forgot', { meta: { title: res.locals.s.c_forgot_title }, sent: true });
});
router.get('/reset/:token', (req, res) => {
  const ok = !!A.findResetToken('client', req.params.token);
  res.render('cabinet/reset', { meta: { title: res.locals.s.c_reset_title }, ok, token: req.params.token, error: '' });
});
router.post('/reset/:token', (req, res) => {
  const s = res.locals.s;
  const t = A.findResetToken('client', req.params.token);
  const render = (error) => res.status(400).render('cabinet/reset', { meta: { title: s.c_reset_title }, ok: !!t, token: req.params.token, error });
  if (!t) return render('');
  if (String(req.body.password || '').length < 8) return render(s.c_err_pass_short);
  if (req.body.password !== req.body.password2) return render(s.c_err_pass_match);
  run('UPDATE clients SET pass_hash = ? WHERE id = ?', A.hashPassword(req.body.password), t.user_id);
  A.consumeResetToken(t.token_hash);
  A.destroyUserSessions('client', t.user_id);
  res.redirect(res.locals.L('/cabinet/login?ok=c_reset_ok'));
});

router.post('/logout', (req, res) => {
  if (req.sess && A.checkCsrf(req, req.sess)) A.destroySession(req, res, 'client');
  res.redirect(res.locals.L('/cabinet/login'));
});

// ---------- обзор ----------
router.get('/', need, (req, res) => {
  const c = req.cu;
  const accountant = c.accountant_id ? get('SELECT name, email FROM staff WHERE id = ?', c.accountant_id) : null;
  const upcoming = all(`SELECT * FROM client_reports WHERE client_id = ? AND status NOT IN ('submitted','accepted')
    ORDER BY CASE WHEN deadline = '' THEN 1 ELSE 0 END, deadline LIMIT 5`, c.id);
  const lastFiles = all("SELECT * FROM client_files WHERE client_id = ? ORDER BY id DESC LIMIT 5", c.id);
  const lastMsg = get("SELECT * FROM messages WHERE client_id = ? ORDER BY id DESC LIMIT 1", c.id);
  cabRender(res, 'cabinet/dashboard', { title: res.locals.s.c_overview, tab: 'overview', accountant, upcoming, lastFiles, lastMsg });
});

// ---------- документы ----------
router.get('/documents', need, (req, res) => {
  const c = req.cu;
  const inbox = all("SELECT * FROM client_files WHERE client_id = ? AND direction = 'out' ORDER BY id DESC", c.id);
  const sent = all("SELECT * FROM client_files WHERE client_id = ? AND direction = 'in' ORDER BY id DESC", c.id);
  cabRender(res, 'cabinet/documents', { title: res.locals.s.c_documents, tab: 'documents', inbox, sent, maxMb: settings().max_upload_mb || 20 });
  // отмечаем входящие как просмотренные после отрисовки
  run("UPDATE client_files SET seen = 1 WHERE client_id = ? AND direction = 'out' AND seen = 0", c.id);
});

router.post('/documents', need, (req, res, next) => {
  req.uploadClientId = req.cu.id;
  clientDocsUpload()(req, res, (err) => {
    const L = res.locals.L;
    if (!A.checkCsrf(req, req.sess)) { (req.files || []).forEach((f) => require('fs').unlink(f.path, () => {})); return res.status(403).type('text').send(res.locals.s.csrf_error); }
    if (err || !req.files || !req.files.length) return res.redirect(L('/cabinet/documents?err=c_upload_err'));
    const comment = str(req.body.comment, 500);
    for (const f of req.files) {
      run(`INSERT INTO client_files(client_id, direction, orig_name, stored_name, size, mime, comment, uploaded_by, created_at)
        VALUES(?, 'in', ?, ?, ?, ?, ?, ?, ?)`, req.cu.id, f.originalname, f.filename, f.size, f.mimetype || '', comment, req.cu.contact_name, now());
    }
    notifyStaff(`Клиент загрузил документы: ${req.cu.company}`, [
      ['Компания', req.cu.company], ['Файлов', String(req.files.length)], ['Файлы', req.files.map((f) => f.originalname).join('\n')], ['Комментарий', comment || '—'],
    ], `${req.baseUrl0}/admin/clients/${req.cu.id}?tab=files`);
    res.redirect(L('/cabinet/documents?ok=c_uploaded'));
  });
});

router.get('/files/:id', need, (req, res) => {
  const f = get('SELECT * FROM client_files WHERE id = ? AND client_id = ?', int(req.params.id), req.cu.id);
  if (!f) return res.status(404).type('text').send('Файл не найден');
  if (f.direction === 'out' && !f.seen) run('UPDATE client_files SET seen = 1 WHERE id = ?', f.id);
  sendDownload(res, f);
});

router.post('/files/:id/delete', need, csrf, (req, res) => {
  // клиент может удалить только свой файл, который бухгалтер ещё не открыл
  const f = get("SELECT * FROM client_files WHERE id = ? AND client_id = ? AND direction = 'in' AND seen = 0", int(req.params.id), req.cu.id);
  if (f) { removeClientFile(f); run('DELETE FROM client_files WHERE id = ?', f.id); }
  res.redirect(res.locals.L('/cabinet/documents'));
});

// ---------- отчётность ----------
router.get('/reports', need, (req, res) => {
  const reports = all(`SELECT * FROM client_reports WHERE client_id = ?
    ORDER BY CASE WHEN status IN ('submitted','accepted') THEN 1 ELSE 0 END, CASE WHEN deadline = '' THEN 1 ELSE 0 END, deadline DESC`, req.cu.id);
  cabRender(res, 'cabinet/reports', { title: res.locals.s.c_reports, tab: 'reports', reports });
});

// ---------- сообщения ----------
router.get('/messages', need, (req, res) => {
  const msgs = all(`SELECT m.*, s.name AS staff_name FROM messages m LEFT JOIN staff s ON s.id = m.staff_id WHERE m.client_id = ? ORDER BY m.id`, req.cu.id);
  cabRender(res, 'cabinet/messages', { title: res.locals.s.c_messages, tab: 'messages', msgs });
  run("UPDATE messages SET is_read = 1 WHERE client_id = ? AND sender = 'staff' AND is_read = 0", req.cu.id);
});
router.post('/messages', need, csrf, (req, res) => {
  const body = str(req.body.body, 4000);
  if (body && A.rateLimit(`cmsg:${req.cu.id}`, 30, 60 * 60 * 1000)) {
    run("INSERT INTO messages(client_id, sender, body, created_at) VALUES(?, 'client', ?, ?)", req.cu.id, body, now());
    notifyStaff(`Сообщение от клиента: ${req.cu.company}`, [['Компания', req.cu.company], ['Сообщение', body]], `${req.baseUrl0}/admin/clients/${req.cu.id}?tab=messages`);
  }
  res.redirect(res.locals.L('/cabinet/messages') + '#bottom');
});

// ---------- профиль ----------
router.get('/profile', need, (req, res) => cabRender(res, 'cabinet/profile', { title: res.locals.s.c_profile, tab: 'profile', error: '' }));
router.post('/profile', need, csrf, (req, res) => {
  const b = req.body;
  const name = str(b.contact_name, 120), phone = str(b.phone, 40), bin = str(b.bin, 20).replace(/\s/g, '');
  if (!name || !phone) return cabRender(res.status(400), 'cabinet/profile', { title: res.locals.s.c_profile, tab: 'profile', error: res.locals.s.c_err_required });
  if (bin && !/^\d{12}$/.test(bin)) return cabRender(res.status(400), 'cabinet/profile', { title: res.locals.s.c_profile, tab: 'profile', error: res.locals.s.c_err_bin });
  run('UPDATE clients SET contact_name = ?, phone = ?, bin = ? WHERE id = ?', name, phone, bin, req.cu.id);
  res.redirect(res.locals.L('/cabinet/profile?ok=c_profile_saved'));
});
router.post('/password', need, csrf, (req, res) => {
  const s = res.locals.s;
  const fail = (e) => cabRender(res.status(400), 'cabinet/profile', { title: s.c_profile, tab: 'profile', error: e });
  if (!A.verifyPassword(req.body.current || '', req.cu.pass_hash)) return fail(s.c_err_current);
  if (String(req.body.password || '').length < 8) return fail(s.c_err_pass_short);
  if (req.body.password !== req.body.password2) return fail(s.c_err_pass_match);
  run('UPDATE clients SET pass_hash = ? WHERE id = ?', A.hashPassword(req.body.password), req.cu.id);
  A.destroyUserSessions('client', req.cu.id, req.sess.id);
  res.redirect(res.locals.L('/cabinet/profile?ok=c_password_changed'));
});

module.exports = router;
