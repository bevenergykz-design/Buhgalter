'use strict';
// Формула калькулятора. Та же формула продублирована в public/js/site.js (для мгновенного пересчёта),
// а сервер пересчитывает цену сам — чтобы в заявку попадало честное значение.
const DOC_KEYS = ['docs_10', 'docs_50', 'docs_150', 'docs_more'];

function calcPrice(t, p) {
  const n = (v) => Number(v) || 0;
  let price = p.entity === 'ip' ? n(t.base_ip) : n(t.base_too);
  if (p.regime === 'our') price += n(t.regime_our);
  price += Math.max(0, Math.min(100, n(p.employees))) * n(t.per_employee);
  price += n(t[DOC_KEYS[Math.max(0, Math.min(3, n(p.docs)))]]);
  if (p.vat) price += n(t.opt_vat);
  if (p.ved) price += n(t.opt_ved);
  if (p.bank) price += n(t.opt_bank);
  return price;
}

module.exports = { calcPrice, DOC_KEYS };
