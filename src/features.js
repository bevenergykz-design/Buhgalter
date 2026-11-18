'use strict';
// Включаемые части сайта.
// Личный кабинет клиента — функция второго этапа: по умолчанию выключен.
// Включить: в базе настройка features.cabinet = true или переменная окружения CABINET_ENABLED=1.
const { settings } = require('./db');

function cabinetOn() {
  if (process.env.CABINET_ENABLED === '1') return true;
  const f = settings().features;
  return !!(f && f.cabinet);
}

module.exports = { cabinetOn };
