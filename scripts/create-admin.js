'use strict';
// Создать администратора или сменить ему пароль:
//   node scripts/create-admin.js email@example.kz "Имя Фамилия" [пароль]
// Если пароль не указан — будет сгенерирован и выведен в консоль.
const { get, run, now } = require('../src/db');
const A = require('../src/auth');

const [email, name = 'Администратор', passArg] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.log('Использование: node scripts/create-admin.js email@example.kz "Имя Фамилия" [пароль]');
  process.exit(1);
}
const pass = passArg || A.randomPassword(14);
if (pass.length < 8) { console.log('Пароль должен быть не короче 8 символов.'); process.exit(1); }
const e = email.toLowerCase();
const u = get('SELECT id FROM staff WHERE email = ?', e);
if (u) {
  run("UPDATE staff SET pass_hash = ?, role = 'admin', active = 1 WHERE id = ?", A.hashPassword(pass), u.id);
  run("DELETE FROM sessions WHERE kind = 'staff' AND user_id = ?", u.id);
  console.log(`Пароль администратора ${e} обновлён.`);
} else {
  run("INSERT INTO staff(name, email, pass_hash, role, created_at) VALUES(?,?,?,'admin',?)", name, e, A.hashPassword(pass), now());
  console.log(`Создан администратор ${e}.`);
}
if (!passArg) console.log(`Пароль: ${pass}`);
