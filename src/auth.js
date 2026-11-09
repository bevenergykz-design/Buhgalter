'use strict';
const crypto = require('crypto');
const { get, run, now } = require('./db');

// ---------- пароли (scrypt) ----------
function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pass), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pass, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}
// фиктивная проверка — чтобы время ответа не выдавало, существует ли e-mail
const DUMMY = hashPassword(crypto.randomBytes(8).toString('hex'));
function fakeVerify() { verifyPassword('x', DUMMY); }

// ---------- сессии ----------
const COOKIE = { staff: 'du_staff', client: 'du_client' };
const TTL = { staff: 12 * 3600 * 1000, client: 30 * 24 * 3600 * 1000 };

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(req, res, name, value, maxAgeMs, path = '/') {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeMs !== undefined) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (req.secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(prev || [], parts.join('; ')));
}

function createSession(req, res, kind, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(id, kind, user_id, csrf, expires, created_at) VALUES(?,?,?,?,?,?)', id, kind, userId, csrf, Date.now() + TTL[kind], now());
  setCookie(req, res, COOKIE[kind], id, TTL[kind]);
  return { id, csrf };
}

function loadSession(req, kind) {
  const sid = parseCookies(req)[COOKIE[kind]];
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  const s = get('SELECT * FROM sessions WHERE id = ? AND kind = ?', sid, kind);
  if (!s) return null;
  if (s.expires < Date.now()) { run('DELETE FROM sessions WHERE id = ?', sid); return null; }
  // скользящее продление раз в час
  if (s.expires - Date.now() < TTL[kind] - 3600 * 1000) run('UPDATE sessions SET expires = ? WHERE id = ?', Date.now() + TTL[kind], sid);
  return s;
}

function destroySession(req, res, kind) {
  const sid = parseCookies(req)[COOKIE[kind]];
  if (sid) run('DELETE FROM sessions WHERE id = ?', sid);
  setCookie(req, res, COOKIE[kind], '', 0);
}

function destroyUserSessions(kind, userId, exceptId) {
  run('DELETE FROM sessions WHERE kind = ? AND user_id = ? AND id != ?', kind, userId, exceptId || '');
}

function cleanupSessions() {
  run('DELETE FROM sessions WHERE expires < ?', Date.now());
  run('DELETE FROM password_resets WHERE expires < ?', Date.now());
}

// ---------- CSRF ----------
function checkCsrf(req, session) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (!session || !token || typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(session.csrf);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- ограничение частоты ----------
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < t) { b = { count: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return b.count <= max;
}
function resetRate(key) { buckets.delete(key); }
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 10 * 60 * 1000).unref();

// ---------- сброс пароля ----------
function createResetToken(kind, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const h = crypto.createHash('sha256').update(token).digest('hex');
  run('DELETE FROM password_resets WHERE kind = ? AND user_id = ?', kind, userId);
  run('INSERT INTO password_resets(token_hash, kind, user_id, expires) VALUES(?,?,?,?)', h, kind, userId, Date.now() + 2 * 3600 * 1000);
  return token;
}
function findResetToken(kind, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const h = crypto.createHash('sha256').update(token).digest('hex');
  const r = get('SELECT * FROM password_resets WHERE token_hash = ? AND kind = ? AND expires > ?', h, kind, Date.now());
  return r ? { ...r, token_hash: h } : null;
}
function consumeResetToken(hash) { run('DELETE FROM password_resets WHERE token_hash = ?', hash); }

function randomPassword(len = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (const b of crypto.randomBytes(len)) s += abc[b % abc.length];
  return s;
}

module.exports = {
  hashPassword, verifyPassword, fakeVerify, parseCookies, setCookie, createSession, loadSession, destroySession,
  destroyUserSessions, cleanupSessions, checkCsrf, rateLimit, resetRate, createResetToken, findResetToken, consumeResetToken, randomPassword,
};
