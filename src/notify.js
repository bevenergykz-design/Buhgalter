'use strict';
// Уведомления: e-mail (SMTP), Telegram, вебхук для CRM. Все необязательные — заявка всегда сохраняется в базе.
const nodemailer = require('nodemailer');
const { settings } = require('./db');
const { esc } = require('./util');

function transport() {
  const s = settings().smtp || {};
  if (!s.host || !s.user) return null;
  return nodemailer.createTransport({
    host: s.host, port: Number(s.port) || 465, secure: !!s.secure,
    auth: { user: s.user, pass: s.pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}

async function sendMail(to, subject, text, html) {
  const tr = transport();
  if (!tr || !to) return { ok: false, skipped: true };
  const s = settings().smtp;
  try {
    await tr.sendMail({ from: s.from || s.user, to, subject, text, html });
    return { ok: true };
  } catch (e) {
    console.error('[mail] ошибка отправки:', e.message);
    return { ok: false, error: e.message };
  }
}

async function telegram(text) {
  const tg = settings().telegram || {};
  if (!tg.token || !tg.chat_id) return;
  try {
    await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tg.chat_id, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error('[telegram]', e.message); }
}

async function webhook(event, payload) {
  const url = settings().webhook_url;
  if (!url || !/^https?:\/\//.test(url)) return;
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }), signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error('[webhook]', e.message); }
}

const TYPE_NAMES = { consult: 'Бесплатная консультация', request: 'Заявка на обслуживание', callback: 'Обратный звонок', calc: 'Расчёт из калькулятора', contact: 'Сообщение со страницы контактов' };

function notifyStaff(subject, rows, link) {
  const st = settings();
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (link ? `\n\n${link}` : '');
  const html = `<h2 style="font-family:Arial,sans-serif;color:#544cab">${esc(subject)}</h2><table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${
    rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#727b8c;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#1d2538">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')
  }</table>${link ? `<p><a href="${esc(link)}" style="color:#544cab">Открыть в панели управления</a></p>` : ''}`;
  sendMail(st.notify_email, subject, text, html);
  telegram(`${subject}\n\n${text}`);
}

function leadNotify(lead, baseUrl) {
  const rows = [
    ['Тип', TYPE_NAMES[lead.type] || lead.type], ['Имя', lead.name], ['Телефон', lead.phone],
  ];
  if (lead.email) rows.push(['E-mail', lead.email]);
  if (lead.company) rows.push(['Компания', lead.company]);
  if (lead.message) rows.push(['Сообщение', lead.message]);
  if (lead.details) rows.push(['Детали', lead.details]);
  rows.push(['Страница', lead.page || '—'], ['Язык', lead.lang === 'kk' ? 'казахский' : 'русский']);
  notifyStaff(`Новая заявка с сайта: ${TYPE_NAMES[lead.type] || lead.type}`, rows, `${baseUrl}/admin/leads/${lead.id}`);
  webhook('lead.created', { lead });
}

module.exports = { sendMail, telegram, webhook, notifyStaff, leadNotify, TYPE_NAMES };
