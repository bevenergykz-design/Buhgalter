/* Панель управления: редактор текста, кликабельные строки, копирование, предпросмотр тарифов */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // строки таблиц открываются по клику
  document.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-href]');
    if (!tr || e.target.closest('a, button, input, select, textarea, label, form')) return;
    if (e.ctrlKey || e.metaKey) window.open(tr.getAttribute('data-href')); else location.href = tr.getAttribute('data-href');
  });

  // визуальный редактор (contenteditable) с синхронизацией в textarea
  $$('[data-editor]').forEach(function (ed) {
    var area = ed.querySelector('.editor__area'), src = ed.querySelector('.editor__src'), htmlBtn = ed.querySelector('[data-html]');
    var htmlMode = false;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* старые браузеры */ }
    var sync = function () { if (!htmlMode) src.value = area.innerHTML.trim() === '<br>' ? '' : area.innerHTML; };
    area.addEventListener('input', sync);
    area.addEventListener('blur', sync);
    // вставка из Word/браузера — только чистый текст с переносами
    area.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      e.preventDefault();
      var text = e.clipboardData.getData('text/plain');
      var html = text.split(/\r?\n\s*\r?\n/).map(function (p) { return '<p>' + p.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }).replace(/\r?\n/g, '<br>') + '</p>'; }).join('');
      document.execCommand('insertHTML', false, html);
      sync();
    });
    ed.querySelectorAll('[data-cmd]').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        if (htmlMode) return;
        area.focus();
        var cmd = b.getAttribute('data-cmd'), arg = b.getAttribute('data-arg');
        if (cmd === 'createLink') {
          arg = window.prompt('Адрес ссылки (https://…)', 'https://');
          if (!arg) return;
        }
        document.execCommand(cmd, false, arg ? (cmd === 'formatBlock' ? '<' + arg + '>' : arg) : null);
        sync();
      });
    });
    // вставка картинки: загружаем файл на сервер и ставим его в текст на место курсора
    var imgBtn = ed.querySelector('[data-img]');
    if (imgBtn) {
      var picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.jpg,.jpeg,.png,.webp'; picker.hidden = true; ed.appendChild(picker);
      var range = null;
      imgBtn.addEventListener('mousedown', function (e) { e.preventDefault(); var sel = window.getSelection(); range = sel.rangeCount && area.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null; });
      imgBtn.addEventListener('click', function () { if (!htmlMode) picker.click(); });
      picker.addEventListener('change', function () {
        var file = picker.files[0]; if (!file) return;
        var form = ed.closest('form'), fd = new FormData();
        fd.append('_csrf', form.querySelector('[name=_csrf]').value); fd.append('file', file);
        imgBtn.disabled = true; imgBtn.textContent = '…';
        fetch(form.getAttribute('data-img-upload') || (location.pathname.split('/content/')[0] + '/upload-image'), { method: 'POST', body: fd, credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Не удалось загрузить картинку');
            area.focus();
            if (range) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
            document.execCommand('insertHTML', false, '<p><img src="' + j.url + '" alt=""></p>');
            sync();
          })
          .catch(function (e) { window.alert(e.message); })
          .then(function () { imgBtn.disabled = false; imgBtn.textContent = '🖼'; picker.value = ''; });
      });
    }
    htmlBtn.addEventListener('click', function () {
      htmlMode = !htmlMode;
      if (htmlMode) { sync(); src.hidden = false; area.hidden = true; }
      else { area.innerHTML = src.value; src.hidden = true; area.hidden = false; }
      htmlBtn.classList.toggle('is-on', htmlMode);
    });
    ed.closest('form').addEventListener('submit', function () { if (!htmlMode) sync(); });
  });

  // копирование данных доступа
  $$('[data-copy-all]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.closest('.panel').querySelector('.secret');
      var text = $$('div', box).map(function (d) { return d.querySelector('span').textContent + ': ' + d.querySelector('code').textContent; }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { b.textContent = 'Скопировано'; }, function () { window.prompt('Скопируйте:', text); });
    });
  });

  // предпросмотр калькулятора
  var prev = document.querySelector('[data-preview]');
  if (prev) {
    var calc = function () {
      var v = function (n) { var i = document.querySelector('[name=' + n + ']'); return i ? Number(i.value) || 0 : 0; };
      var p = v('base_too') + 3 * v('per_employee') + v('docs_50');
      prev.textContent = p.toLocaleString('ru-RU').replace(/,/g, ' ');
    };
    document.addEventListener('input', function (e) { if (e.target.matches('[data-tariff]')) calc(); });
    calc();
  }

  // предупреждение о несохранённых изменениях в формах редактирования
  $$('form.entity-form, form[action$="/texts"], form[action$="/contacts"]').forEach(function (f) {
    var dirty = false;
    f.addEventListener('input', function () { dirty = true; });
    f.addEventListener('submit', function () { dirty = false; });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  });
})();
