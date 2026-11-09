'use strict';
// Панель управления: заявки, клиенты, контент сайта, настройки, сотрудники, резервные копии
const fs = require('fs');
const path = require('path');
const express = require('express');
const dbm = require('../db');
const { all, get, run, now, tx, settings, setSetting, resetTextsCache, DATA_DIR } = dbm;
const A = require('../auth');
const U = require('../util');
const { str, int, isEmail, slugify, sanitizeHtml } = U;
const E = require('../admin-entities');
const F = require('../files');
const { sendMail, webhook, TYPE_NAMES } = require('../notify');
const { DEFAULT_SETTINGS } = require('../seed');

const router = express.Router();
const OK = {
  saved: 'Изменения сохранены.', created: 'Запись создана.', deleted: 'Удалено.', uploaded: 'Файлы загружены.', sent: 'Сообщение отправлено.',
  pass: 'Пароль изменён.', mail_ok: 'Тестовое письмо отправлено.', added: 'Добавлено.',
};
const ERR = {
  upload: 'Не удалось загрузить файл: недопустимый тип или размер.', mail: 'Не удалось отправить письмо — проверьте настройки SMTP.',
  required: 'Заполните обязательные поля.', email: 'Укажите корректный e-mail.', exists: 'Такой e-mail уже используется.', slug: 'Такой адрес страницы уже занят.',
  pass: 'Пароль должен быть не короче 8 символов.', current: 'Текущий пароль указан неверно.', self: 'Нельзя отключить собственную учётную запись.',
  bin: 'БИН / ИИН должен состоять из 12 цифр.', smtp: 'SMTP не настроен: заполните сервер и логин.',
};

// ---------- сессия сотрудника ----------
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const sess = A.loadSession(req, 'staff');
  if (sess) {
    const u = get('SELECT * FROM staff WHERE id = ? AND active = 1', sess.user_id);
    if (u) { req.staff = u; req.sess = sess; }
  }
  Object.assign(res.locals, {
    me: req.staff || null, csrf: sess ? sess.csrf : '', E, adminPath: req.path,
    ok: OK[req.query.ok] || '', err: ERR[req.query.err] || '',
    opt: (list, v) => (list.find((x) => x[0] === v) || [, v])[1],
  });
  next();
});

const needStaff = (req, res, next) => (req.staff ? next() : res.redirect('/admin/login'));
const needAdmin = (req, res, next) => (req.staff && req.staff.role === 'admin' ? next() : res.status(403).type('text').send('Раздел доступен только администратору.'));
const csrf = (req, res, next) => (A.checkCsrf(req, req.sess) ? next() : res.status(403).type('text').send('Сессия устарела. Обновите страницу и повторите действие.'));
const back = (res, url, key = 'saved') => res.redirect(url + (url.includes('?') ? '&' : '?') + 'ok=' + key);
const backErr = (res, url, key) => res.redirect(url + (url.includes('?') ? '&' : '?') + 'err=' + key);

function counters() {
  return {
    newLeads: get("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").n,
    pendingClients: get("SELECT COUNT(*) AS n FROM clients WHERE status = 'pending'").n,
    clientAttention: get(`SELECT COUNT(*) AS n FROM clients c WHERE EXISTS (SELECT 1 FROM messages m WHERE m.client_id = c.id AND m.sender = 'client' AND m.is_read = 0)
      OR EXISTS (SELECT 1 FROM client_files f WHERE f.client_id = c.id AND f.direction = 'in' AND f.seen = 0)`).n,
  };
}
function render(res, view, data) {
  res.render(`admin/${view}`, { counters: counters(), ...data });
}

// ---------- вход ----------
router.get('/login', (req, res) => {
  if (req.staff) return res.redirect('/admin');
  res.render('admin/login', { error: '', email: '' });
});
router.post('/login', (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const fail = (error) => res.status(400).render('admin/login', { error, email });
  if (!A.rateLimit(`slogin:${req.ip}`, 8, 15 * 60 * 1000)) return fail('Слишком много попыток входа. Подождите 15 минут.');
  const u = get('SELECT * FROM staff WHERE email = ? AND active = 1', email);
  if (!u) { A.fakeVerify(); return fail('Неверный e-mail или пароль.'); }
  if (!A.verifyPassword(req.body.password || '', u.pass_hash)) return fail('Неверный e-mail или пароль.');
  A.resetRate(`slogin:${req.ip}`);
  A.createSession(req, res, 'staff', u.id);
  run('UPDATE staff SET last_login = ? WHERE id = ?', now(), u.id);
  res.redirect('/admin');
});
router.post('/logout', (req, res) => {
  if (req.sess && A.checkCsrf(req, req.sess)) A.destroySession(req, res, 'staff');
  res.redirect('/admin/login');
});

router.use(needStaff);

// ---------- обзор ----------
router.get('/', (req, res) => {
  const t = U.today();
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const mine = req.query.mine === '1';
  const scope = mine ? ' AND c.accountant_id = ' + Number(req.staff.id) : '';
  render(res, 'dashboard', {
    title: 'Обзор', mine,
    stats: {
      leadsNew: get("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").n,
      leadsMonth: get('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?', new Date(Date.now() - 30 * 86400000).toISOString()).n,
      clientsActive: get(`SELECT COUNT(*) AS n FROM clients c WHERE status = 'active'${scope}`).n,
      clientsPending: get("SELECT COUNT(*) AS n FROM clients WHERE status = 'pending'").n,
      overdue: get(`SELECT COUNT(*) AS n FROM client_reports r JOIN clients c ON c.id = r.client_id WHERE r.deadline != '' AND r.deadline < ? AND r.status NOT IN ('submitted','accepted')${scope}`, t).n,
    },
    leads: all('SELECT * FROM leads ORDER BY id DESC LIMIT 6'),
    deadlines: all(`SELECT r.*, c.company, c.id AS cid FROM client_reports r JOIN clients c ON c.id = r.client_id
      WHERE r.deadline != '' AND r.deadline <= ? AND r.status NOT IN ('submitted','accepted') AND c.status != 'closed'${scope} ORDER BY r.deadline LIMIT 12`, in14),
    pending: all("SELECT * FROM clients WHERE status = 'pending' ORDER BY id DESC LIMIT 6"),
    activity: all(`SELECT c.id, c.company,
        (SELECT COUNT(*) FROM messages m WHERE m.client_id = c.id AND m.sender = 'client' AND m.is_read = 0) AS msgs,
        (SELECT COUNT(*) FROM client_files f WHERE f.client_id = c.id AND f.direction = 'in' AND f.seen = 0) AS files
      FROM clients c WHERE 1=1${scope}`).filter((r) => r.msgs || r.files).slice(0, 10),
    today: t,
  });
});

// =====================================================================
// ЗАЯВКИ
// =====================================================================
router.get('/leads', (req, res) => {
  const status = E.LEAD_STATUS.some((s) => s[0] === req.query.status) ? req.query.status : '';
  const q = str(req.query.q, 100);
  const where = []; const p = [];
  if (status) { where.push('status = ?'); p.push(status); } else where.push("status != 'spam'");
  if (q) { where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR company LIKE ?)'); p.push(...Array(4).fill(`%${q}%`)); }
  const leads = all(`SELECT l.*, s.name AS staff_name FROM leads l LEFT JOIN staff s ON s.id = l.assigned_id WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT 500`, ...p);
  const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').map((r) => [r.status, r.n]));
  render(res, 'leads', { title: 'Заявки с сайта', leads, status, q, byStatus, TYPE_NAMES });
});

router.get('/leads.csv', (req, res) => {
  const rows = all('SELECT * FROM leads ORDER BY id DESC');
  const cols = ['id', 'created_at', 'type', 'status', 'name', 'phone', 'email', 'company', 'message', 'details', 'page', 'lang', 'notes'];
  const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => escCsv(c === 'type' ? TYPE_NAMES[r[c]] || r[c] : r[c])).join(';'))].join('\r\n');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${U.today()}.csv"`);
  res.type('text/csv; charset=utf-8').send(csv);
});

router.get('/leads/:id', (req, res, next) => {
  const lead = get('SELECT * FROM leads WHERE id = ?', int(req.params.id));
  if (!lead) return next();
  if (lead.status === 'new' && !lead.notes) { /* открыта — остаётся «новой», пока менеджер не сменит статус */ }
  const client = lead.email ? get('SELECT id, company FROM clients WHERE email = ?', lead.email.toLowerCase()) : null;
  render(res, 'lead', { title: `Заявка №${lead.id}`, lead, cl: client, staffList: all('SELECT id, name FROM staff WHERE active = 1 ORDER BY name'), TYPE_NAMES });
});
router.post('/leads/:id', csrf, (req, res) => {
  const id = int(req.params.id);
  const status = E.LEAD_STATUS.some((s) => s[0] === req.body.status) ? req.body.status : 'new';
  const assigned = int(req.body.assigned_id) || null;
  run('UPDATE leads SET status = ?, notes = ?, assigned_id = ?, updated_at = ? WHERE id = ?', status, str(req.body.notes, 5000), assigned, now(), id);
  webhook('lead.updated', { lead: get('SELECT * FROM leads WHERE id = ?', id) });
  back(res, `/admin/leads/${id}`);
});
router.post('/leads/:id/delete', csrf, needAdmin, (req, res) => {
  run('DELETE FROM leads WHERE id = ?', int(req.params.id));
  back(res, '/admin/leads', 'deleted');
});

// =====================================================================
// КЛИЕНТЫ
// =====================================================================
router.get('/clients', (req, res) => {
  const status = E.CLIENT_STATUS.some((s) => s[0] === req.query.status) ? req.query.status : '';
  const acc = req.query.acc === 'me' ? req.staff.id : int(req.query.acc) || 0;
  const q = str(req.query.q, 100);
  const where = ['1=1']; const p = [];
  if (status) { where.push('c.status = ?'); p.push(status); }
  if (acc) { where.push('c.accountant_id = ?'); p.push(acc); }
  if (q) { where.push('(c.company LIKE ? OR c.bin LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)'); p.push(...Array(5).fill(`%${q}%`)); }
  const t = U.today();
  const clients = all(`SELECT c.*, s.name AS acc_name,
      (SELECT COUNT(*) FROM client_reports r WHERE r.client_id = c.id AND r.status NOT IN ('submitted','accepted')) AS open_reports,
      (SELECT COUNT(*) FROM client_reports r WHERE r.client_id = c.id AND r.deadline != '' AND r.deadline < '${t}' AND r.status NOT IN ('submitted','accepted')) AS overdue,
      (SELECT MIN(r.deadline) FROM client_reports r WHERE r.client_id = c.id AND r.deadline >= '${t}' AND r.status NOT IN ('submitted','accepted')) AS next_deadline,
      (SELECT COUNT(*) FROM messages m WHERE m.client_id = c.id AND m.sender = 'client' AND m.is_read = 0) AS unread,
      (SELECT COUNT(*) FROM client_files f WHERE f.client_id = c.id AND f.direction = 'in' AND f.seen = 0) AS new_files
    FROM clients c LEFT JOIN staff s ON s.id = c.accountant_id WHERE ${where.join(' AND ')}
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.company COLLATE NOCASE`, ...p);
  const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM clients GROUP BY status').map((r) => [r.status, r.n]));
  render(res, 'clients', { title: 'Клиенты', clients, status, acc: req.query.acc || '', q, byStatus, staffList: all('SELECT id, name FROM staff WHERE active = 1 ORDER BY name') });
});

router.get('/clients/new', (req, res) => {
  const lead = req.query.lead ? get('SELECT * FROM leads WHERE id = ?', int(req.query.lead)) : null;
  const v = lead ? { company: lead.company, contact_name: lead.name, phone: lead.phone, email: lead.email, lead_id: lead.id } : {};
  render(res, 'client-new', { title: 'Новый клиент', v, error: '', staffList: all('SELECT id, name FROM staff WHERE active = 1 ORDER BY name') });
});
router.post('/clients', csrf, (req, res) => {
  const b = req.body;
  const v = {
    company: str(b.company, 200), contact_name: str(b.contact_name, 120), phone: str(b.phone, 40), email: str(b.email, 160).toLowerCase(),
    bin: str(b.bin, 20).replace(/\s/g, ''), entity_type: E.ENTITY_TYPES.some((x) => x[0] === b.entity_type) ? b.entity_type : 'too',
    tax_regime: E.TAX_REGIMES.some((x) => x[0] === b.tax_regime) ? b.tax_regime : 'simplified',
    accountant_id: int(b.accountant_id) || null, tariff: int(b.tariff) || null, status: E.CLIENT_STATUS.some((x) => x[0] === b.status) ? b.status : 'active',
    lead_id: int(b.lead_id) || null,
  };
  const fail = (error) => render(res.status(400), 'client-new', { title: 'Новый клиент', v, error, staffList: all('SELECT id, name FROM staff WHERE active = 1 ORDER BY name') });
  if (!v.company || !v.contact_name || !v.email) return fail(ERR.required);
  if (!isEmail(v.email)) return fail(ERR.email);
  if (v.bin && !/^\d{12}$/.test(v.bin)) return fail(ERR.bin);
  if (get('SELECT 1 FROM clients WHERE email = ?', v.email)) return fail(ERR.exists);
  const pass = A.randomPassword(10);
  const r = run(`INSERT INTO clients(email, pass_hash, contact_name, company, bin, phone, entity_type, tax_regime, status, accountant_id, tariff, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, v.email, A.hashPassword(pass), v.contact_name, v.company, v.bin, v.phone, v.entity_type, v.tax_regime, v.status, v.accountant_id, v.tariff, now());
  if (v.lead_id) run("UPDATE leads SET status = 'won', updated_at = ? WHERE id = ?", now(), v.lead_id);
  if (b.send_invite) {
    sendMail(v.email, 'Доступ в личный кабинет «Диалог Учёт»',
      `Здравствуйте, ${v.contact_name}!\n\nДля вас создан личный кабинет клиента «Диалог Учёт».\n\nАдрес: ${req.baseUrl0}/cabinet/login\nE-mail: ${v.email}\nПароль: ${pass}\n\nРекомендуем сменить пароль в разделе «Профиль» после первого входа.`);
  }
  render(res, 'client-created', { title: 'Клиент создан', cl: get('SELECT * FROM clients WHERE id = ?', r.lastInsertRowid), pass, invited: !!b.send_invite });
});

function loadClient(req, res, next) {
  const c = get('SELECT * FROM clients WHERE id = ?', int(req.params.id));
  if (!c) return res.status(404).type('text').send('Клиент не найден');
  req.cl = c; next();
}

router.get('/clients/:id', loadClient, (req, res) => {
  const c = req.cl;
  const tab = ['overview', 'reports', 'files', 'messages'].includes(req.query.tab) ? req.query.tab : 'overview';
  const data = {
    title: c.company, c, tab, today: U.today(), staffList: all('SELECT id, name FROM staff WHERE active = 1 ORDER BY name'),
    reports: all(`SELECT * FROM client_reports WHERE client_id = ? ORDER BY CASE WHEN status IN ('submitted','accepted') THEN 1 ELSE 0 END,
      CASE WHEN deadline = '' THEN 1 ELSE 0 END, deadline`, c.id),
    files: all('SELECT * FROM client_files WHERE client_id = ? ORDER BY id DESC', c.id),
    msgs: all('SELECT m.*, s.name AS staff_name FROM messages m LEFT JOIN staff s ON s.id = m.staff_id WHERE m.client_id = ? ORDER BY m.id', c.id),
    unread: get("SELECT COUNT(*) AS n FROM messages WHERE client_id = ? AND sender = 'client' AND is_read = 0", c.id).n,
    newFiles: get("SELECT COUNT(*) AS n FROM client_files WHERE client_id = ? AND direction = 'in' AND seen = 0", c.id).n,
    maxMb: settings().max_upload_mb || 20,
  };
  render(res, 'client', data);
  if (tab === 'messages') run("UPDATE messages SET is_read = 1 WHERE client_id = ? AND sender = 'client' AND is_read = 0", c.id);
});

router.post('/clients/:id', csrf, loadClient, (req, res) => {
  const b = req.body; const c = req.cl;
  const bin = str(b.bin, 20).replace(/\s/g, '');
  if (bin && !/^\d{12}$/.test(bin)) return backErr(res, `/admin/clients/${c.id}`, 'bin');
  const email = str(b.email, 160).toLowerCase();
  if (!isEmail(email)) return backErr(res, `/admin/clients/${c.id}`, 'email');
  if (email !== c.email && get('SELECT 1 FROM clients WHERE email = ?', email)) return backErr(res, `/admin/clients/${c.id}`, 'exists');
  const status = E.CLIENT_STATUS.some((x) => x[0] === b.status) ? b.status : c.status;
  run(`UPDATE clients SET company = ?, contact_name = ?, phone = ?, email = ?, bin = ?, entity_type = ?, tax_regime = ?, status = ?,
       accountant_id = ?, tariff = ?, contract_no = ?, contract_date = ?, internal_notes = ? WHERE id = ?`,
  str(b.company, 200) || c.company, str(b.contact_name, 120) || c.contact_name, str(b.phone, 40), email, bin,
  E.ENTITY_TYPES.some((x) => x[0] === b.entity_type) ? b.entity_type : c.entity_type,
  E.TAX_REGIMES.some((x) => x[0] === b.tax_regime) ? b.tax_regime : c.tax_regime,
  status, int(b.accountant_id) || null, int(b.tariff) || null, str(b.contract_no, 60), str(b.contract_date, 10), str(b.internal_notes, 10000), c.id);
  if (status !== c.status) webhook('client.status', { client_id: c.id, company: c.company, from: c.status, to: status });
  back(res, `/admin/clients/${c.id}`);
});

router.post('/clients/:id/password', csrf, loadClient, (req, res) => {
  const pass = A.randomPassword(10);
  run('UPDATE clients SET pass_hash = ? WHERE id = ?', A.hashPassword(pass), req.cl.id);
  A.destroyUserSessions('client', req.cl.id);
  render(res, 'client-created', { title: 'Новый пароль клиента', cl: req.cl, pass, reset: true, invited: false });
});

router.post('/clients/:id/delete', csrf, needAdmin, loadClient, (req, res) => {
  for (const f of all('SELECT * FROM client_files WHERE client_id = ?', req.cl.id)) F.removeClientFile(f);
  run('DELETE FROM clients WHERE id = ?', req.cl.id);
  back(res, '/admin/clients', 'deleted');
});

// ---- отчётность клиента ----
function reportFields(b) {
  return {
    title: str(b.title, 200), period: str(b.period, 100), deadline: /^\d{4}-\d{2}-\d{2}$/.test(b.deadline || '') ? b.deadline : '',
    status: E.REPORT_STATUS.some((x) => x[0] === b.status) ? b.status : 'planned', amount: str(b.amount, 60), note: str(b.note, 1000),
  };
}
router.post('/clients/:id/reports', csrf, loadClient, (req, res) => {
  const r = reportFields(req.body);
  if (!r.title) return backErr(res, `/admin/clients/${req.cl.id}?tab=reports`, 'required');
  run('INSERT INTO client_reports(client_id, title, period, deadline, status, amount, note, updated_at) VALUES(?,?,?,?,?,?,?,?)',
    req.cl.id, r.title, r.period, r.deadline, r.status, r.amount, r.note, now());
  back(res, `/admin/clients/${req.cl.id}?tab=reports`, 'added');
});
router.post('/reports/:rid', csrf, (req, res) => {
  const old = get('SELECT * FROM client_reports WHERE id = ?', int(req.params.rid));
  if (!old) return res.status(404).end();
  const r = reportFields({ ...old, ...req.body });
  run('UPDATE client_reports SET title = ?, period = ?, deadline = ?, status = ?, amount = ?, note = ?, updated_at = ? WHERE id = ?',
    r.title || old.title, r.period, r.deadline, r.status, r.amount, r.note, now(), old.id);
  if (r.status !== old.status && ['submitted', 'accepted'].includes(r.status)) {
    const c = get('SELECT email, contact_name, company FROM clients WHERE id = ?', old.client_id);
    sendMail(c.email, `Отчёт сдан: ${old.title}`, `Здравствуйте, ${c.contact_name}!\n\nОтчёт «${old.title}»${r.period ? ' за ' + r.period : ''} — статус: ${E.REPORT_STATUS.find((x) => x[0] === r.status)[1].toLowerCase()}.\n\nПодробности — в личном кабинете: ${req.baseUrl0}/cabinet/reports`);
  }
  back(res, `/admin/clients/${old.client_id}?tab=reports`);
});
router.post('/reports/:rid/delete', csrf, (req, res) => {
  const old = get('SELECT * FROM client_reports WHERE id = ?', int(req.params.rid));
  if (old) run('DELETE FROM client_reports WHERE id = ?', old.id);
  back(res, `/admin/clients/${old ? old.client_id : ''}?tab=reports`, 'deleted');
});

// ---- файлы клиента ----
router.post('/clients/:id/files', loadClient, (req, res) => {
  req.uploadClientId = req.cl.id;
  F.clientDocsUpload()(req, res, (err) => {
    if (!A.checkCsrf(req, req.sess)) { (req.files || []).forEach((f) => fs.unlink(f.path, () => {})); return res.status(403).type('text').send('Сессия устарела.'); }
    const url = `/admin/clients/${req.cl.id}?tab=files`;
    if (err || !req.files || !req.files.length) return backErr(res, url, 'upload');
    const comment = str(req.body.comment, 500);
    for (const f of req.files) {
      run(`INSERT INTO client_files(client_id, direction, orig_name, stored_name, size, mime, comment, uploaded_by, created_at, seen)
        VALUES(?, 'out', ?, ?, ?, ?, ?, ?, ?, 0)`, req.cl.id, f.originalname, f.filename, f.size, f.mimetype || '', comment, req.staff.name, now());
    }
    sendMail(req.cl.email, 'Новые документы в личном кабинете «Диалог Учёт»',
      `Здравствуйте, ${req.cl.contact_name}!\n\nБухгалтер отправил вам документы (${req.files.length} шт.)${comment ? ': ' + comment : ''}.\n\nСкачать: ${req.baseUrl0}/cabinet/documents`);
    back(res, url, 'uploaded');
  });
});
router.get('/files/:fid', (req, res) => {
  const f = get('SELECT * FROM client_files WHERE id = ?', int(req.params.fid));
  if (!f) return res.status(404).type('text').send('Файл не найден');
  if (f.direction === 'in' && !f.seen) run('UPDATE client_files SET seen = 1 WHERE id = ?', f.id);
  F.sendDownload(res, f);
});
router.post('/files/:fid/seen', csrf, (req, res) => {
  const f = get('SELECT * FROM client_files WHERE id = ?', int(req.params.fid));
  if (f) run('UPDATE client_files SET seen = 1 WHERE id = ?', f.id);
  back(res, `/admin/clients/${f ? f.client_id : ''}?tab=files`);
});
router.post('/files/:fid/delete', csrf, (req, res) => {
  const f = get('SELECT * FROM client_files WHERE id = ?', int(req.params.fid));
  if (f) { F.removeClientFile(f); run('DELETE FROM client_files WHERE id = ?', f.id); }
  back(res, `/admin/clients/${f ? f.client_id : ''}?tab=files`, 'deleted');
});

// ---- сообщения ----
router.post('/clients/:id/messages', csrf, loadClient, (req, res) => {
  const body = str(req.body.body, 4000);
  if (body) {
    run("INSERT INTO messages(client_id, sender, staff_id, body, created_at) VALUES(?, 'staff', ?, ?, ?)", req.cl.id, req.staff.id, body, now());
    run("UPDATE messages SET is_read = 1 WHERE client_id = ? AND sender = 'client'", req.cl.id);
    sendMail(req.cl.email, 'Новое сообщение от бухгалтера «Диалог Учёт»',
      `Здравствуйте, ${req.cl.contact_name}!\n\n${req.staff.name} написал(а) вам сообщение:\n\n${body}\n\nОтветить: ${req.baseUrl0}/cabinet/messages`);
  }
  res.redirect(`/admin/clients/${req.cl.id}?tab=messages#bottom`);
});

// =====================================================================
// КОНТЕНТ САЙТА (только администратор)
// =====================================================================
router.use(['/texts', '/content', '/settings', '/staff', '/backup', '/contacts', '/tariffs', '/images'], needAdmin);

// ---- тексты ----
router.get('/texts', (req, res) => {
  const groups = all('SELECT grp, MIN(sort) AS s FROM texts GROUP BY grp ORDER BY s').map((r) => r.grp);
  const grp = groups.includes(req.query.grp) ? req.query.grp : groups[0];
  render(res, 'texts', { title: 'Тексты сайта', groups, grp, items: all('SELECT * FROM texts WHERE grp = ? ORDER BY sort', grp) });
});
router.post('/texts', csrf, (req, res) => {
  const keys = [].concat(req.body.key || []);
  tx(() => {
    for (const k of keys) {
      if (!get('SELECT 1 FROM texts WHERE key = ?', k)) continue;
      run('UPDATE texts SET ru = ?, kk = ? WHERE key = ?', str(req.body[`ru__${k}`], 20000), str(req.body[`kk__${k}`], 20000), k);
    }
  });
  resetTextsCache();
  back(res, `/admin/texts?grp=${encodeURIComponent(req.body.grp || '')}`);
});

// ---- изображения сайта ----
router.get('/images', (req, res) => render(res, 'images', { title: 'Изображения сайта', images: settings().images || {} }));
router.post('/images', F.imageUpload.any(), csrf, (req, res) => {
  const images = { ...(settings().images || {}) };
  for (const k of ['hero', 'team', 'about']) {
    const file = (req.files || []).find((f) => f.fieldname === k);
    if (file) images[k] = `/uploads/${file.filename}`;
    else if (req.body[`remove_${k}`]) images[k] = k === 'hero' ? '/img/hero.webp' : '';
  }
  setSetting('images', images);
  back(res, '/admin/images');
});

// ---- универсальный редактор разделов ----
function entityOr404(req, res, next) {
  const ent = E.ENTITIES[req.params.ent];
  if (!ent) return res.status(404).type('text').send('Раздел не найден');
  req.ent = ent; req.entKey = req.params.ent; next();
}
const catOptions = () => all('SELECT id, title_ru FROM service_categories ORDER BY sort, id').map((c) => [String(c.id), c.title_ru]);

router.get('/content/:ent', entityOr404, (req, res) => {
  const filterCat = req.entKey === 'services' ? int(req.query.cat) : 0;
  const rows = all(`SELECT * FROM ${req.ent.table} ${filterCat ? 'WHERE category_id = ' + filterCat : ''} ORDER BY ${req.ent.order}`);
  render(res, 'entity-list', { title: req.ent.title, ent: req.ent, entKey: req.entKey, rows, cats: catOptions(), filterCat });
});
router.get('/content/:ent/new', entityOr404, (req, res) => {
  const row = {};
  for (const f of req.ent.fields) if (f.default !== undefined) row[f.name] = f.default;
  if (req.entKey === 'posts') row.published_at = U.today();
  if (req.entKey === 'services' && req.query.cat) row.category_id = req.query.cat;
  render(res, 'entity-form', { title: `Добавить ${req.ent.one}`, ent: req.ent, entKey: req.entKey, row, isNew: true, cats: catOptions() });
});
router.get('/content/:ent/:id', entityOr404, (req, res) => {
  const row = get(`SELECT * FROM ${req.ent.table} WHERE id = ?`, int(req.params.id));
  if (!row) return res.status(404).type('text').send('Запись не найдена');
  render(res, 'entity-form', { title: `Редактирование: ${row.title_ru || row.q_ru || row.author || ''}`, ent: req.ent, entKey: req.entKey, row, isNew: false, cats: catOptions() });
});

function collectEntity(ent, body, files, old) {
  const vals = {};
  for (const f of ent.fields) {
    const names = f.bi ? [`${f.name}_ru`, `${f.name}_kk`] : [f.name];
    for (const n of names) {
      let v = body[n];
      if (f.type === 'check') v = v ? 1 : 0;
      else if (f.type === 'number') v = int(v, 0);
      else if (f.type === 'html') v = sanitizeHtml(v);
      else if (f.type === 'image') {
        const file = (files || []).find((x) => x.fieldname === n);
        v = file ? `/uploads/${file.filename}` : body[`remove_${n}`] ? '' : (old ? old[n] : '') || '';
      } else if (f.type === 'date') v = /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v : '';
      else if (f.type === 'select' && f.options === 'categories') v = int(v) || null;
      else v = str(v, f.type === 'textarea' ? 10000 : 500);
      vals[n] = v;
    }
  }
  return vals;
}

router.post('/content/:ent/:id', entityOr404, F.imageUpload.any(), csrf, (req, res) => {
  const ent = req.ent; const isNew = req.params.id === 'new';
  const old = isNew ? null : get(`SELECT * FROM ${ent.table} WHERE id = ?`, int(req.params.id));
  if (!isNew && !old) return res.status(404).type('text').send('Запись не найдена');
  const v = collectEntity(ent, req.body, req.files, old);
  const listUrl = `/admin/content/${req.entKey}`;
  const formUrl = isNew ? `${listUrl}/new` : `${listUrl}/${old.id}`;
  for (const f of ent.fields) {
    if (!f.required) continue;
    const n = f.bi ? `${f.name}_ru` : f.name;
    if (!v[n]) return backErr(res, formUrl, 'required');
  }
  if ('slug' in v) {
    if (old && old.system) v.slug = old.slug;
    else v.slug = slugify(v.slug || v[ent.slugFrom] || '');
    const reserved = ['admin', 'cabinet', 'api', 'kk', 'uslugi', 'novosti', 'o-kompanii', 'kontakty', 'spasibo', 'sitemap', 'robots', 'whatsapp', 'css', 'js', 'img', 'uploads'];
    if (req.entKey === 'pages' && reserved.includes(v.slug)) v.slug += '-1';
    const dupe = get(`SELECT id FROM ${ent.table} WHERE slug = ? AND id != ?`, v.slug, old ? old.id : 0);
    if (dupe) return backErr(res, formUrl, 'slug');
  }
  if (req.entKey === 'posts') { v.published_at = v.published_at ? new Date(v.published_at + 'T09:00:00').toISOString() : now(); v.updated_at = now(); }
  if (req.entKey === 'pages') v.updated_at = now();
  if (req.entKey === 'reviews' && isNew) v.created_at = now();
  const cols = Object.keys(v);
  if (isNew) {
    const r = run(`INSERT INTO ${ent.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...cols.map((c) => v[c]));
    return back(res, `${listUrl}/${r.lastInsertRowid}`, 'created');
  }
  run(`UPDATE ${ent.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => v[c]), old.id);
  back(res, formUrl);
});

router.post('/content/:ent/:id/delete', entityOr404, csrf, (req, res) => {
  const row = get(`SELECT * FROM ${req.ent.table} WHERE id = ?`, int(req.params.id));
  if (row && !row.system) run(`DELETE FROM ${req.ent.table} WHERE id = ?`, row.id);
  back(res, `/admin/content/${req.entKey}`, 'deleted');
});

// ---- калькулятор ----
const TARIFF_FIELDS = [
  ['base_ip', 'Базовая стоимость для ИП'], ['base_too', 'Базовая стоимость для ТОО'], ['regime_our', 'Надбавка за общеустановленный режим (ОУР)'],
  ['per_employee', 'За каждого сотрудника'], ['docs_10', 'Документов до 10 в месяц'], ['docs_50', 'Документов до 50'], ['docs_150', 'Документов до 150'],
  ['docs_more', 'Документов свыше 150'], ['opt_vat', 'Опция: плательщик НДС (ф. 300.00)'], ['opt_ved', 'Опция: ВЭД / ЕАЭС (ф. 328.00)'], ['opt_bank', 'Опция: интернет-банкинг и платёжки'],
];
router.get('/tariffs', (req, res) => render(res, 'tariffs', { title: 'Калькулятор стоимости', t: settings().tariffs || {}, TARIFF_FIELDS }));
router.post('/tariffs', csrf, (req, res) => {
  const t = {};
  for (const [k] of TARIFF_FIELDS) t[k] = Math.max(0, int(String(req.body[k] || '').replace(/\s/g, ''), 0));
  setSetting('tariffs', t);
  back(res, '/admin/tariffs');
});

// ---- контакты и реквизиты ----
router.get('/contacts', (req, res) => render(res, 'contacts', { title: 'Контакты и реквизиты', st: settings() }));
router.post('/contacts', csrf, (req, res) => {
  const b = req.body;
  for (const k of ['company_name_ru', 'company_name_kk', 'brand_ru', 'brand_kk', 'brand_sub_ru', 'brand_sub_kk', 'director_ru', 'director_kk',
    'legal_address_ru', 'legal_address_kk', 'hours_ru', 'hours_kk']) setSetting(k, str(b[k], 500));
  setSetting('bin', str(b.bin, 20).replace(/\s/g, ''));
  setSetting('reg_date', /^\d{4}-\d{2}-\d{2}$/.test(b.reg_date || '') ? b.reg_date : settings().reg_date);
  setSetting('phones', String(b.phones || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 6));
  setSetting('whatsapp', str(b.whatsapp, 40));
  setSetting('email', str(b.email, 160));
  const offices = [];
  for (let i = 0; i < 6; i++) {
    const o = { city_ru: str(b[`o${i}_city_ru`], 80), city_kk: str(b[`o${i}_city_kk`], 80), address_ru: str(b[`o${i}_address_ru`], 300), address_kk: str(b[`o${i}_address_kk`], 300) };
    if (o.city_ru || o.address_ru) offices.push(o);
  }
  setSetting('offices', offices);
  const socials = {};
  for (const k of Object.keys(DEFAULT_SETTINGS.socials)) { const u = str(b[`soc_${k}`], 300); socials[k] = /^https?:\/\//.test(u) ? u : ''; }
  setSetting('socials', socials);
  back(res, '/admin/contacts');
});

// ---- настройки и интеграции ----
router.get('/settings', (req, res) => render(res, 'settings', { title: 'Настройки и интеграции', st: settings() }));
router.post('/settings', csrf, (req, res) => {
  const b = req.body; const cur = settings();
  setSetting('notify_email', str(b.notify_email, 300));
  setSetting('site_url', str(b.site_url, 200).replace(/\/$/, ''));
  setSetting('max_upload_mb', Math.min(100, Math.max(1, int(b.max_upload_mb, 20))));
  setSetting('smtp', {
    host: str(b.smtp_host, 200), port: int(b.smtp_port, 465), secure: !!b.smtp_secure, user: str(b.smtp_user, 200),
    pass: b.smtp_pass ? String(b.smtp_pass) : (cur.smtp || {}).pass || '', from: str(b.smtp_from, 200),
  });
  setSetting('telegram', { token: b.tg_token ? str(b.tg_token, 200) : (cur.telegram || {}).token || '', chat_id: str(b.tg_chat, 100) });
  if (b.tg_clear) setSetting('telegram', { token: '', chat_id: '' });
  setSetting('webhook_url', /^https?:\/\//.test(b.webhook_url || '') ? str(b.webhook_url, 500) : '');
  setSetting('analytics', { ga4: str(b.ga4, 40).replace(/[^\w-]/g, ''), gtm: str(b.gtm, 40).replace(/[^\w-]/g, ''), gsc: str(b.gsc, 200).replace(/[^\w-]/g, '') });
  back(res, '/admin/settings');
});
router.post('/settings/test-mail', csrf, async (req, res) => {
  const s = settings();
  if (!s.smtp || !s.smtp.host || !s.smtp.user) return backErr(res, '/admin/settings', 'smtp');
  const r = await sendMail(s.notify_email || req.staff.email, 'Проверка почты — сайт «Диалог Учёт»', 'Если вы получили это письмо, уведомления о заявках настроены правильно.');
  r.ok ? back(res, '/admin/settings', 'mail_ok') : backErr(res, '/admin/settings', 'mail');
});

// ---- сотрудники ----
router.get('/staff', (req, res) => render(res, 'staff', { title: 'Сотрудники', list: all('SELECT s.*, (SELECT COUNT(*) FROM clients c WHERE c.accountant_id = s.id) AS clients FROM staff s ORDER BY active DESC, name'), created: null }));
router.post('/staff', csrf, (req, res) => {
  const name = str(req.body.name, 120), email = str(req.body.email, 160).toLowerCase(), role = req.body.role === 'admin' ? 'admin' : 'accountant';
  if (!name || !email) return backErr(res, '/admin/staff', 'required');
  if (!isEmail(email)) return backErr(res, '/admin/staff', 'email');
  if (get('SELECT 1 FROM staff WHERE email = ?', email)) return backErr(res, '/admin/staff', 'exists');
  const pass = A.randomPassword(12);
  run('INSERT INTO staff(name, email, pass_hash, role, created_at) VALUES(?,?,?,?,?)', name, email, A.hashPassword(pass), role, now());
  render(res, 'staff', { title: 'Сотрудники', list: all('SELECT s.*, (SELECT COUNT(*) FROM clients c WHERE c.accountant_id = s.id) AS clients FROM staff s ORDER BY active DESC, name'), created: { name, email, pass } });
});
router.post('/staff/:id', csrf, (req, res) => {
  const u = get('SELECT * FROM staff WHERE id = ?', int(req.params.id));
  if (!u) return res.status(404).end();
  const active = req.body.active ? 1 : 0;
  const role = req.body.role === 'admin' ? 'admin' : 'accountant';
  if (u.id === req.staff.id && (!active || role !== 'admin')) return backErr(res, '/admin/staff', 'self');
  run('UPDATE staff SET name = ?, role = ?, active = ? WHERE id = ?', str(req.body.name, 120) || u.name, role, active, u.id);
  if (!active) A.destroyUserSessions('staff', u.id);
  back(res, '/admin/staff');
});
router.post('/staff/:id/password', csrf, (req, res) => {
  const u = get('SELECT * FROM staff WHERE id = ?', int(req.params.id));
  if (!u) return res.status(404).end();
  const pass = A.randomPassword(12);
  run('UPDATE staff SET pass_hash = ? WHERE id = ?', A.hashPassword(pass), u.id);
  A.destroyUserSessions('staff', u.id, u.id === req.staff.id ? req.sess.id : '');
  render(res, 'staff', { title: 'Сотрудники', list: all('SELECT s.*, (SELECT COUNT(*) FROM clients c WHERE c.accountant_id = s.id) AS clients FROM staff s ORDER BY active DESC, name'), created: { name: u.name, email: u.email, pass, reset: true } });
});

// ---- мой профиль (любой сотрудник) ----
router.get('/profile', (req, res) => render(res, 'profile', { title: 'Мой профиль' }));
router.post('/profile', csrf, (req, res) => {
  if (!A.verifyPassword(req.body.current || '', req.staff.pass_hash)) return backErr(res, '/admin/profile', 'current');
  if (String(req.body.password || '').length < 8) return backErr(res, '/admin/profile', 'pass');
  run('UPDATE staff SET pass_hash = ? WHERE id = ?', A.hashPassword(req.body.password), req.staff.id);
  A.destroyUserSessions('staff', req.staff.id, req.sess.id);
  back(res, '/admin/profile', 'pass');
});

// ---- резервные копии ----
router.get('/backup', (req, res) => {
  const dir = path.join(DATA_DIR, 'backups');
  const list = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort().reverse().map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  render(res, 'backup', { title: 'Резервные копии', list });
});
router.get('/backup/full', (req, res) => {
  const tmp = path.join(DATA_DIR, 'backups', `.snapshot-${Date.now()}.sqlite`);
  dbm.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const entries = [[tmp, 'data/site.sqlite'], ...U.walk(F.FILES_DIR, 'data/files'), ...U.walk(F.UPLOADS_DIR, 'data/uploads')];
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="dialog-uchet-backup-${U.today()}.tar.gz"`);
  res.on('finish', () => fs.unlink(tmp, () => {}));
  res.on('close', () => fs.unlink(tmp, () => {}));
  U.writeTarGz(res, entries, [['README.txt', Buffer.from('Резервная копия сайта «Диалог Учёт».\nВосстановление: распакуйте архив в папку сайта с заменой папки data/ (или в папку, указанную в DATA_DIR) и перезапустите приложение.\n')]]);
});
router.get('/backup/file/:name', (req, res) => {
  if (!/^site-\d{4}-\d{2}-\d{2}\.sqlite$/.test(req.params.name)) return res.status(404).end();
  res.download(path.join(DATA_DIR, 'backups', req.params.name));
});

module.exports = router;
