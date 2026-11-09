/* Общие скрипты кабинета клиента и панели управления */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // подтверждение опасных действий
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-confirm]');
    if (f && !window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
  });

  // выбор файлов: показываем имена, поддержка перетаскивания
  $$('.dropzone').forEach(function (dz) {
    var input = dz.querySelector('input[type=file]'), text = dz.querySelector('[data-dz-text]');
    var update = function () {
      var n = input.files ? input.files.length : 0;
      text.textContent = n ? Array.prototype.map.call(input.files, function (f) { return f.name; }).join(', ') : text.getAttribute('data-default');
      dz.classList.toggle('has-files', n > 0);
    };
    input.addEventListener('change', update);
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function () { dz.classList.remove('is-drag'); }); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) { input.files = e.dataTransfer.files; update(); } });
  });

  // кнопка отправки блокируется, чтобы не было двойной отправки
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var b = e.target.querySelector('button[type=submit]:not([data-keep])');
    if (b) setTimeout(function () { b.disabled = true; }, 0);
  });

  // Ctrl+Enter отправляет сообщение
  $$('[data-enter-submit]').forEach(function (t) {
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); t.form.requestSubmit ? t.form.requestSubmit() : t.form.submit(); } });
  });
  // чат прокручен к последнему сообщению
  $$('[data-chat]').forEach(function (c) { c.scrollTop = c.scrollHeight; });

  // маска телефона
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

  // мобильное меню панели
  var t = document.querySelector('[data-side-toggle]');
  if (t) t.addEventListener('click', function () { document.body.classList.toggle('side-open'); });
  document.addEventListener('click', function (e) { if (e.target.matches('.side-backdrop')) document.body.classList.remove('side-open'); });
})();
