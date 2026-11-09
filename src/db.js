'use strict';
// База данных SQLite (встроенный модуль node:sqlite, без нативных зависимостей)
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'site.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS texts (
  key TEXT PRIMARY KEY, grp TEXT NOT NULL, label TEXT NOT NULL,
  ru TEXT NOT NULL DEFAULT '', kk TEXT NOT NULL DEFAULT '', multiline INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS service_categories (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title_ru TEXT NOT NULL, title_kk TEXT NOT NULL DEFAULT '',
  intro_ru TEXT NOT NULL DEFAULT '', intro_kk TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'ledger', sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  title_ru TEXT NOT NULL, title_kk TEXT NOT NULL DEFAULT '', desc_ru TEXT NOT NULL DEFAULT '', desc_kk TEXT NOT NULL DEFAULT '',
  price_ru TEXT NOT NULL DEFAULT '', price_kk TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'company',
  title_ru TEXT NOT NULL, title_kk TEXT NOT NULL DEFAULT '', excerpt_ru TEXT NOT NULL DEFAULT '', excerpt_kk TEXT NOT NULL DEFAULT '',
  body_ru TEXT NOT NULL DEFAULT '', body_kk TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1, published_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title_ru TEXT NOT NULL, title_kk TEXT NOT NULL DEFAULT '',
  body_ru TEXT NOT NULL DEFAULT '', body_kk TEXT NOT NULL DEFAULT '', desc_ru TEXT NOT NULL DEFAULT '', desc_kk TEXT NOT NULL DEFAULT '',
  in_menu INTEGER NOT NULL DEFAULT 0, in_footer INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1, system INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, author TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', text_ru TEXT NOT NULL, text_kk TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY, q_ru TEXT NOT NULL, q_kk TEXT NOT NULL DEFAULT '', a_ru TEXT NOT NULL, a_kk TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'accountant', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'ru', status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '',
  assigned_id INTEGER REFERENCES staff(id) ON DELETE SET NULL, ip TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, contact_name TEXT NOT NULL,
  company TEXT NOT NULL, bin TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT 'too', tax_regime TEXT NOT NULL DEFAULT 'simplified',
  status TEXT NOT NULL DEFAULT 'pending', accountant_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  tariff INTEGER, contract_no TEXT NOT NULL DEFAULT '', contract_date TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'ru', created_at TEXT NOT NULL, last_login TEXT
);
CREATE TABLE IF NOT EXISTS client_reports (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL, period TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'planned',
  amount TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS client_files (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, orig_name TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '', uploaded_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_reports_client ON client_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_files_client ON client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_msg_client ON messages(client_id);
`);

// ---------- маленькие обёртки ----------
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const now = () => new Date().toISOString();

// ---------- настройки ----------
let settingsCache = null;
function settings() {
  if (!settingsCache) {
    settingsCache = {};
    for (const r of all('SELECT key, value FROM settings')) {
      try { settingsCache[r.key] = JSON.parse(r.value); } catch { settingsCache[r.key] = r.value; }
    }
  }
  return settingsCache;
}
function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  settingsCache = null;
}

// ---------- тексты ----------
let textsCache = null;
function texts() {
  if (!textsCache) {
    textsCache = { ru: {}, kk: {} };
    for (const r of all('SELECT key, ru, kk FROM texts')) {
      textsCache.ru[r.key] = r.ru;
      textsCache.kk[r.key] = r.kk || r.ru;
    }
  }
  return textsCache;
}
function resetTextsCache() { textsCache = null; }

module.exports = { db, all, get, run, tx, now, settings, setSetting, texts, resetTextsCache, DATA_DIR, DB_PATH };

// Первичное наполнение
require('./seed').seed(module.exports);
