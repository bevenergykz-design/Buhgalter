'use strict';
// Секретный адрес панели управления.
// Панель не открывается по очевидному /admin. По решению заказчика адрес — /admin-<БИН компании>
// (/admin-181040019474), чтобы сотрудникам было легко запомнить. Адрес фиксируется в базе при первом
// запуске и не меняется вместе с БИН. Можно задать свой через переменную окружения ADMIN_PATH.
const crypto = require('crypto');
const { settings, setSetting } = require('./db');

const VALID = /^\/[a-z0-9][a-z0-9-]{5,62}$/;
let cached = null;

function adminPath() {
  if (cached) return cached;
  const env = String(process.env.ADMIN_PATH || '').trim().toLowerCase();
  if (env) {
    if (!VALID.test(env)) throw new Error('ADMIN_PATH должен начинаться с / и содержать только латиницу, цифры и дефис (6–63 символа)');
    cached = env;
    return cached;
  }
  let p = settings().admin_path;
  if (!p || !VALID.test(p)) {
    const bin = String(settings().bin || '').replace(/\D/g, '');
    if (bin.length === 12) p = `/admin-${bin}`;
    else {
      // запасной вариант, если БИН не задан: случайный адрес
      const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
      let tail = '';
      for (const b of crypto.randomBytes(10)) tail += abc[b % abc.length];
      p = `/admin-${tail}`;
    }
    setSetting('admin_path', p);
  }
  cached = p;
  return cached;
}

module.exports = { adminPath };
