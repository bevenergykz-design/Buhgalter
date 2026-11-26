'use strict';
// Разовые правки содержимого по замечаниям заказчика. Каждая выполняется один раз (флаг в settings),
// на сервере применяются сами при обновлении из GitHub. Правки, сделанные позже в панели, не трогаются.
const { all, get, run, settings, setSetting, resetTextsCache } = require('./db');

function m20261126() {
  // 1. Название компании — без лишних внутренних кавычек
  const fixName = (v) => String(v || '').replace(/„Диалог Учёт“/g, 'Диалог Учёт').replace(/«Образцовая бухгалтерия «Диалог Учёт»»/g, '«Образцовая бухгалтерия Диалог Учёт»');
  for (const k of ['company_name_ru', 'company_name_kk']) { const v = settings()[k]; if (v && fixName(v) !== v) setSetting(k, fixName(v)); }
  for (const col of ['ru', 'kk']) run(`UPDATE texts SET ${col} = replace(${col}, '„Диалог Учёт“', 'Диалог Учёт') WHERE ${col} LIKE '%„Диалог Учёт“%'`);
  for (const col of ['title_ru', 'title_kk', 'body_ru', 'body_kk', 'desc_ru', 'desc_kk']) run(`UPDATE pages SET ${col} = replace(${col}, '„Диалог Учёт“', 'Диалог Учёт') WHERE ${col} LIKE '%„Диалог Учёт“%'`);

  // 2. Тексты главной
  const setText = (key, ru, kk, en) => run('UPDATE texts SET ru = ?, kk = ?, en = ? WHERE key = ?', ru, kk, en, key);
  setText('home.calc.note',
    'Расчёт предварительный. Точную стоимость вам сможет рассчитать менеджер по работе с клиентами.',
    'Бұл — алдын ала есеп. Нақты құнын клиенттермен жұмыс жөніндегі менеджер есептеп береді.',
    'This is a preliminary estimate. Our client manager can calculate the exact cost for you.');
  const feat = get("SELECT ru, kk, en FROM texts WHERE key = 'home.features.items'");
  if (feat && !/ответственность/.test(feat.ru)) {
    run("UPDATE texts SET ru = ?, kk = ?, en = ? WHERE key = 'home.features.items'",
      feat.ru.trim() + '\nМы берём на себя ответственность',
      (feat.kk || '').trim() + (feat.kk ? '\nЖауапкершілікті өз мойнымызға аламыз' : ''),
      (feat.en || '').trim() + (feat.en ? '\nWe take responsibility' : ''));
  }
  run(`UPDATE texts SET ru = replace(ru, 'Полная финансовая гарантия', 'Финансовая ответственность в пределах гарантийного взноса'),
    kk = replace(kk, 'Толық қаржылық кепілдік', 'Кепілдік жарнасы шегіндегі қаржылық жауапкершілік'),
    en = replace(en, 'Full financial guarantee', 'Financial liability within the guarantee deposit') WHERE key = 'home.verify.checks'`);

  // 3. Вопросы и ответы
  run("DELETE FROM faq WHERE q_ru = 'Что будет, если налоговая начислит штраф по вашей вине?'");
  run(`UPDATE faq SET q_ru = 'Работаете ли вы с компаниями за пределами Алматы и Павлодара?',
    q_kk = 'Алматы мен Павлодардан тыс жердегі компаниялармен жұмыс істейсіз бе?',
    q_en = 'Do you work with companies outside Almaty and Pavlodar?',
    a_ru = replace(a_ru, 'Астаны, Павлодара, ', 'Астаны, '), a_kk = replace(a_kk, 'Астана, Павлодар, ', 'Астана, '), a_en = replace(a_en, 'Astana, Pavlodar, ', 'Astana, ')
    WHERE q_ru = 'Работаете ли вы с компаниями за пределами Алматы?'`);
  run(`UPDATE faq SET a_ru = replace(a_ru, 'в установленный 30-дневный срок', 'в установленный срок'),
    a_kk = replace(a_kk, 'белгіленген 30 күндік мерзімде', 'белгіленген мерзімде'),
    a_en = replace(a_en, 'within the 30-day deadline', 'within the set deadline')
    WHERE q_ru = 'Поможете ли вы, если уже пришло уведомление камерального контроля?'`);

  // 4. Сертификаты: на первое место — сертификат профессионального бухгалтера; короче подписи
  run("UPDATE certificates SET sort = 0 WHERE image LIKE '%prof-buh%'");
  run(`UPDATE certificates SET sort = 1, title_ru = 'Аудит качества учёта «1С Казахстан»', title_kk = '«1С Қазақстан» есеп сапасының аудиті',
    title_en = '1C Kazakhstan accounting quality audit',
    desc_ru = 'По итогам централизованного аудита за 2024 год. Выдан 3 июля 2025 г.',
    desc_kk = '2024 жылғы орталықтандырылған аудит қорытындысы бойынша. 2025 жылғы 3 шілдеде берілген.',
    desc_en = 'Based on the centralised audit for 2024. Issued on 3 July 2025.' WHERE image LIKE '%audit-1c%'`);
  run(`UPDATE certificates SET desc_ru = replace(desc_ru, ', 3 академических часа.', '.'), desc_kk = replace(desc_kk, ', 3 академиялық сағат.', '.'),
    desc_en = replace(desc_en, ', 3 academic hours.', '.') WHERE desc_ru LIKE '%академических%'`);

  // 5. Рубрики «Новостей»: консультации и изменения законодательства
  run("UPDATE posts SET category = 'consult' WHERE category IN ('explain', 'tips', 'clients')");
  run("UPDATE posts SET category = 'law' WHERE category IN ('tax', 'labor')");

  // 6. Новое фото коллектива на главной (без обрезанных лиц)
  const im = settings().images || {};
  if (!im.hero || im.hero === '/img/team/hero.webp') setSetting('images', { ...im, hero: '/img/team/team-4.webp' });

  // подзаголовок «Новостей» — под новые рубрики (если его не меняли в панели)
  run(`UPDATE texts SET ru = 'Видео-советы наших бухгалтеров, консультации по темам и изменения законодательства Казахстана — полезное для предпринимателей.',
    kk = 'Бухгалтерлеріміздің бейне-кеңестері, тақырыптық кеңестер және Қазақстан заңнамасындағы өзгерістер — кәсіпкерлерге пайдалы ақпарат.',
    en = 'Video tips from our accountants, consultations by topic and changes in Kazakhstan legislation — useful information for entrepreneurs.'
    WHERE key = 'news.text' AND ru LIKE 'Новости компании, изменения налогового%'`);

  // 7. Правила оплаты: порядок оплаты через Kaspi QR с номером заявки
  const PAY = [
    ['body_ru', '<li>Сотрудник компании выставит удалённую оплату через Kaspi Pay на указанный номер.</li><li>Подтвердите оплату в приложении Kaspi.kz. Электронный чек формирует Kaspi.</li>',
      '<li>Сайт присвоит заявке номер и покажет Kaspi QR компании. Отсканируйте его в приложении Kaspi.kz и оплатите указанную сумму. По желанию клиента сотрудник может вместо этого выставить удалённую оплату через Kaspi Pay на указанный номер.</li><li>Сотрудник сверит поступившую оплату с заявкой. Электронный чек формирует Kaspi.</li>'],
    ['body_kk', '<li>Компания қызметкері көрсетілген нөмірге Kaspi Pay арқылы қашықтан төлем жазады.</li><li>Kaspi.kz қосымшасында төлемді растаңыз. Электрондық чекті Kaspi қалыптастырады.</li>',
      '<li>Сайт өтінімге нөмір беріп, компанияның Kaspi QR кодын көрсетеді. Оны Kaspi.kz қосымшасында сканерлеп, көрсетілген соманы төлеңіз. Клиенттің қалауы бойынша қызметкер оның орнына көрсетілген нөмірге Kaspi Pay арқылы қашықтан төлем жаза алады.</li><li>Қызметкер түскен төлемді өтініммен салыстырады. Электрондық чекті Kaspi қалыптастырады.</li>'],
    ['body_en', '<li>Our staff will send a remote payment request via Kaspi Pay to that number.</li><li>Confirm the payment in the Kaspi.kz app. The electronic receipt is issued by Kaspi.</li>',
      '<li>The site assigns your request a number and shows our company\'s Kaspi QR code. Scan it in the Kaspi.kz app and pay the amount. If you prefer, our staff can instead send a remote payment request via Kaspi Pay to your number.</li><li>Our staff will match the payment to your request. The electronic receipt is issued by Kaspi.</li>'],
  ];
  for (const [col, from, to] of PAY) run(`UPDATE pages SET ${col} = replace(${col}, ?, ?) WHERE slug = 'pravila-oplaty'`, from, to);
}

// Вычитка казахских и английских текстов (27.11). Заменяется только исходная формулировка:
// если текст уже поправили в панели, замена не найдёт его и ничего не изменит.
const PROOF_20261127 = [
  ['texts', 'kk', "key = 'home.hero.advantages'", '70%-ға дейін үнем', '70%-ға дейін үнемдеу'],
  ['texts', 'kk', "key = 'home.calc.text'", 'шамамен алынған құнын біліңіз', 'болжамды құнын біліңіз'],
  ['texts', 'kk', "key = 'home.calc.note'", 'Есеп алдын ала жасалған.', 'Бұл — алдын ала есеп.'],
  ['texts', 'kk', "key = 'home.process.title'", 'қадам-қадаммен', 'кезең-кезеңімен'],
  ['texts', 'kk', "key = 'home.verify.badge'", 'мемлекеттік тізілімдерімен тексерілген', 'мемлекеттік тізілімдері арқылы тексерілген'],
  ['texts', 'kk', "key = 'about.value4.items'", 'қолдау мен ынта сезінеді', 'қолдау мен ықылас сезінеді'],
  ['texts', 'kk', "key = 'seo.home.description'", 'камералдық бақылауды сүйемелдеу.', 'камералдық бақылауды сүйемелдеу. Алматы мен Павлодардағы кеңселер.'],
  ['texts', 'kk', "key = 'seo.services.description'", 'кадрлық есеп және жалақы есептеу.', 'кадрлық есеп және жалақы есептеу. Өтінім қалдырыңыз немесе тегін кеңес алыңыз.'],
  ['texts', 'kk', "key = 'seo.about.description'", 'бизнестің есебін жүргізеді.', 'бизнестің бухгалтерлік, салықтық және кадрлық есебін жүргізеді.'],
  ['texts', 'en', "key = 'home.process.step4.text'", 'with the company head', "with your company’s director"],
  ['texts', 'en', "key = 'seo.home.title'", 'for IP and LLPs', 'for Sole Proprietors and LLPs'],
  ['services', 'title_en', 'id = 6', 'Accounting recovery', 'Restoring accounting records'],
  ['services', 'desc_en', 'id = 2', 'invoices, acts, waybills', 'invoices, completion certificates, waybills'],
  ['services', 'desc_en', 'id = 3', 'accountable persons', 'employees holding cash advances'],
  ['services', 'desc_kk', 'id = 5', 'демалыс ақысы, еңбекке жарамсыздық бойынша және басқа да төлемдерді', 'демалыс ақысын, еңбекке уақытша жарамсыздық бойынша жәрдемақыны және басқа да төлемдерді'],
  ['services', 'title_kk', 'id = 19', 'Басшыға арналған анықтамалар мен есептер', 'Басшыға арналған анықтамалар мен есептерді дайындау'],
  ['videos', 'title_kk', 'id = 12', 'Біздің бухгалтерлер өз мамандығы туралы', 'Бухгалтерлеріміз өз мамандығы туралы'],
  ['videos', 'title_en', 'id = 12', 'Our accountants about their profession', 'Our accountants on their profession'],
  ['videos', 'title_en', 'id = 9', 'Natalya Kuzmenko about the company', 'Natalya Kuzmenko on the company'],
  ['posts', 'body_kk', 'id = 1', 'шамамен алынған құны', 'болжамды құны'],
  ['pages', 'body_en', 'id = 2', 'an act of completed work', 'a certificate of completed work (act)'],
];
function m20261127() {
  for (const [table, col, where, from, to] of PROOF_20261127) {
    // повторно не применяем: если исправленный вариант уже есть (новая установка), строка не трогается
    const r = run(`UPDATE ${table} SET ${col} = replace(${col}, ?, ?) WHERE ${where} AND instr(${col}, ?) > 0 AND instr(${col}, ?) = 0`, from, to, from, to);
    if (!r.changes) console.log(`[migrate] вычитка: не найдено в ${table}.${col} (${where}) — вероятно, уже изменено в панели`);
  }
}

const MIGRATIONS = [['migr_20261126', m20261126], ['migr_20261127_proof', m20261127]];

function migrate() {
  for (const [flag, fn] of MIGRATIONS) {
    if (settings()[flag]) continue;
    fn();
    setSetting(flag, new Date().toISOString());
    console.log(`[migrate] выполнено: ${flag}`);
  }
  resetTextsCache();
}

module.exports = { migrate };
