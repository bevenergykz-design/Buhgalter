/* «Диалог Учёт» — скрипты публичного сайта */
(function () {
  'use strict';
  var S = window.SITE || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var loadedAt = Date.now();

  // ---------- шапка при прокрутке ----------
  var header = $('.header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // ---------- открытие/закрытие слоёв ----------
  var lastFocus = null;
  function openLayer(el) {
    lastFocus = document.activeElement;
    el.hidden = false; document.body.classList.add('no-scroll');
    var f = el.querySelector('input:not([type=hidden]):not([tabindex="-1"]), button[data-close], a');
    setTimeout(function () { f && f.focus(); }, 30);
  }
  function closeLayer(el) {
    el.hidden = true;
    if (!$$('.modal:not([hidden]), .drawer:not([hidden])').length) document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-close]');
    if (c) { var layer = c.closest('.modal, .drawer'); if (layer) closeLayer(layer); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.modal:not([hidden]), .drawer:not([hidden])').forEach(closeLayer);
  });

  // мобильное меню
  var drawer = $('#drawer'), burger = $('.burger');
  if (drawer && burger) burger.addEventListener('click', function () { burger.setAttribute('aria-expanded', 'true'); openLayer(drawer); });

  // ---------- модальная форма заявки ----------
  var modal = $('#lead-modal');
  function openLead(type, service) {
    if (!modal) return;
    if (drawer && !drawer.hidden) closeLayer(drawer);
    var form = $('form', modal), wrap = $('.lead-form-wrap', modal), ok = $('.form-success', modal);
    var cfg = (S.forms || {})[type] || S.forms.request;
    $('#lead-title').textContent = cfg[0];
    $('#lead-text').textContent = service ? cfg[1] + ' — ' + service : cfg[1];
    form.elements.type.value = type;
    form.elements.service.value = service || '';
    form.elements.page.value = location.pathname;
    modal.classList.toggle('modal--callback', type === 'callback');
    wrap.hidden = false; ok.hidden = true;
    resetErrors(form);
    openLayer(modal);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lead]');
    if (b) { e.preventDefault(); openLead(b.getAttribute('data-lead'), b.getAttribute('data-service')); }
  });

  // ---------- маска телефона ----------
  function formatPhone(v) {
    // «+7…» — код страны уже введён; 11 цифр с 8/7 в начале — номер с кодом; иначе считаем, что ввели номер без кода
    var plus = v.trim().charAt(0) === '+';
    var d = v.replace(/\D/g, '');
    if (!d) return plus ? '+' : '';
    if (plus) { if (d[0] !== '7') d = '7' + d; }
    else if (d.length >= 11 && (d[0] === '8' || d[0] === '7')) d = '7' + d.slice(1);
    else d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' ' + d.slice(1, 4);
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    if (d.length > 9) out += ' ' + d.slice(9, 11);
    return out;
  }
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-phone]')) e.target.value = formatPhone(e.target.value);
  });
  document.addEventListener('focusin', function (e) {
    if (e.target.matches('[data-phone]') && !e.target.value) e.target.value = '+7 ';
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.matches('[data-phone]') && e.target.value.replace(/\D/g, '').length <= 1) e.target.value = '';
  });

  // ---------- отправка форм ----------
  function resetErrors(form) {
    $$('.is-invalid', form).forEach(function (x) { x.classList.remove('is-invalid'); });
    var er = $('.form-error', form) || $('.form-error', form.closest('.calc') || form); if (er) er.hidden = true;
  }
  function validate(form) {
    var ok = true;
    var name = form.elements.name, phone = form.elements.phone, consent = form.elements.consent;
    if (!name.value.trim()) { name.classList.add('is-invalid'); ok = false; }
    if (phone.value.replace(/\D/g, '').length < 11) { phone.classList.add('is-invalid'); ok = false; }
    if (consent && !consent.checked) { consent.closest('.check').classList.add('is-invalid'); ok = false; }
    var em = form.elements.email;
    if (em && em.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value)) { em.classList.add('is-invalid'); ok = false; }
    return ok;
  }
  function submitLead(form, scope) {
    var err = $('.form-error', scope);
    resetErrors(form);
    if (!validate(form)) { if (err) { err.textContent = S.err; err.hidden = false; } return; }
    if (form.elements.ts) form.elements.ts.value = String(loadedAt);
    var btn = $('button[type=submit]', scope), label = btn.textContent;
    btn.disabled = true; btn.textContent = S.sending;
    var body = new URLSearchParams(new FormData(form));
    fetch(form.getAttribute('action'), { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || S.err);
        var wrap = scope.querySelector('.lead-form-wrap, .calc__lead'), ok = scope.querySelector('.form-success');
        if (wrap) wrap.hidden = true; if (ok) ok.hidden = false;
        form.reset(); if (window.dataLayer) window.dataLayer.push({ event: 'lead_submit', lead_type: form.elements.type.value });
        if (form.matches('[data-calc]')) recalc();
      })
      .catch(function (e) { if (err) { err.textContent = e.message || S.err; err.hidden = false; } })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  }
  $$('form[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); submitLead(form, form.closest('.modal__dialog, .card') || form.parentNode); });
  });

  // ---------- калькулятор ----------
  var calc = $('form[data-calc]');
  var recalc = function () {};
  if (calc) {
    var T = JSON.parse(calc.getAttribute('data-tariffs') || '{}');
    var DOCS = ['docs_10', 'docs_50', 'docs_150', 'docs_more'];
    var emp = calc.elements.employees, docs = calc.elements.docs;
    var steps = JSON.parse(docs.getAttribute('data-steps') || '[]');
    var priceEl = $('[data-price]', calc), empOut = $('[data-emp-out]', calc), docsOut = $('[data-docs-out]', calc), wa = $('[data-calc-wa]', calc);
    var n = function (v) { return Number(v) || 0; };
    var fill = function (r) { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); };
    recalc = function () {
      var ent = calc.querySelector('[name=entity]:checked').value, reg = calc.querySelector('[name=regime]:checked').value;
      var p = ent === 'ip' ? n(T.base_ip) : n(T.base_too);
      if (reg === 'our') p += n(T.regime_our);
      p += n(emp.value) * n(T.per_employee);
      p += n(T[DOCS[n(docs.value)]]);
      if (calc.elements.vat.checked) p += n(T.opt_vat);
      if (calc.elements.ved.checked) p += n(T.opt_ved);
      if (calc.elements.bank.checked) p += n(T.opt_bank);
      priceEl.textContent = p.toLocaleString('ru-RU').replace(/,/g, ' ');
      empOut.textContent = emp.value + (emp.value === emp.max ? '+' : '');
      docsOut.textContent = steps[n(docs.value)] || '';
      fill(emp); fill(docs);
      if (wa) {
        var base = wa.getAttribute('href').split('?')[0];
        var txt = (S.lang === 'kk' ? 'Сәлеметсіз бе! Калькулятор бойынша есеп: ' : 'Здравствуйте! Расчёт по калькулятору: ') +
          (ent === 'ip' ? (S.lang === 'kk' ? 'ЖК' : 'ИП') : (S.lang === 'kk' ? 'ЖШС' : 'ТОО')) + ', ' + emp.value + (S.lang === 'kk' ? ' қызметкер, ' : ' сотр., ') +
          (steps[n(docs.value)] || '') + (S.lang === 'kk' ? ' құжат — ' : ' док. — ') + priceEl.textContent + ' ₸';
        wa.setAttribute('href', base + '?text=' + encodeURIComponent(txt));
      }
    };
    calc.addEventListener('input', recalc);
    calc.addEventListener('change', recalc);
    calc.addEventListener('submit', function (e) { e.preventDefault(); submitLead(calc, $('.calc__result', calc)); });
    recalc();
  }

  // ---------- вкладки услуг без перезагрузки ----------
  var tabs = $$('.tab[data-tab]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.preventDefault();
      tabs.forEach(function (x) { x.classList.toggle('is-active', x === t); x.setAttribute('aria-selected', x === t); });
      $$('.tab-panel').forEach(function (p) { p.hidden = p.id !== 'cat-' + t.getAttribute('data-tab'); });
      history.replaceState(null, '', t.getAttribute('href'));
    });
  });
})();
