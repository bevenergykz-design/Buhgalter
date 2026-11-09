'use strict';
// Описание редактируемых разделов сайта для универсального редактора панели управления.
// Поле: { name, label, type: text|textarea|html|image|check|number|select|date, bi: true — есть RU и KZ версии, required, options, hint }

const NEWS_CATS = [
  ['company', 'Новости компании'], ['tax', 'Налоговое законодательство'], ['labor', 'Трудовое законодательство'],
  ['tips', 'Советы предпринимателям'], ['explain', 'Разъяснения по учёту'], ['clients', 'Материалы для клиентов'],
];
const ICONS = [['ledger', 'Книга учёта'], ['tax', 'Документ с процентом'], ['people', 'Люди'], ['plus', 'Плюс'], ['briefcase', 'Портфель'], ['shield', 'Щит'], ['chart', 'График'], ['doc', 'Документ'], ['calc', 'Калькулятор'], ['globe', 'Глобус']];

const ENTITIES = {
  posts: {
    table: 'posts', title: 'Новости и статьи', one: 'публикацию', icon: 'doc', order: 'published_at DESC',
    slugFrom: 'title_ru', publicUrl: (r) => `/novosti/${r.slug}`,
    columns: [['title_ru', 'Заголовок'], ['category', 'Раздел', (v) => (NEWS_CATS.find((c) => c[0] === v) || [, v])[1]], ['published_at', 'Дата', 'date'], ['published', 'Опубликовано', 'bool']],
    fields: [
      { name: 'title', label: 'Заголовок', type: 'text', bi: true, required: true },
      { name: 'category', label: 'Раздел', type: 'select', options: NEWS_CATS },
      { name: 'published_at', label: 'Дата публикации', type: 'date' },
      { name: 'slug', label: 'Адрес страницы (латиницей)', type: 'text', hint: 'Если оставить пустым — сформируется из заголовка. Пример: izmeneniya-nds-2026' },
      { name: 'image', label: 'Обложка', type: 'image' },
      { name: 'excerpt', label: 'Краткое описание (для списка и поисковиков)', type: 'textarea', bi: true },
      { name: 'body', label: 'Текст публикации', type: 'html', bi: true },
      { name: 'published', label: 'Опубликовано на сайте', type: 'check', default: 1 },
    ],
  },
  pages: {
    table: 'pages', title: 'Страницы', one: 'страницу', icon: 'layers', order: 'sort, id',
    slugFrom: 'title_ru', publicUrl: (r) => `/${r.slug}`,
    columns: [['title_ru', 'Название'], ['slug', 'Адрес', (v) => '/' + v], ['in_menu', 'В меню', 'bool'], ['in_footer', 'В подвале', 'bool'], ['published', 'Опубликована', 'bool']],
    fields: [
      { name: 'title', label: 'Название', type: 'text', bi: true, required: true },
      { name: 'slug', label: 'Адрес страницы (латиницей)', type: 'text', hint: 'Если оставить пустым — сформируется из названия. Пример: registraciya-too' },
      { name: 'desc', label: 'Описание для поисковиков (Description)', type: 'textarea', bi: true },
      { name: 'body', label: 'Содержимое страницы', type: 'html', bi: true },
      { name: 'in_menu', label: 'Показывать в главном меню', type: 'check' },
      { name: 'in_footer', label: 'Показывать в подвале', type: 'check' },
      { name: 'sort', label: 'Порядок (меньше — левее/выше)', type: 'number' },
      { name: 'published', label: 'Опубликована', type: 'check', default: 1 },
    ],
  },
  categories: {
    table: 'service_categories', title: 'Разделы услуг', one: 'раздел', icon: 'layers', order: 'sort, id', slugFrom: 'title_ru',
    columns: [['title_ru', 'Название'], ['slug', 'Адрес'], ['sort', 'Порядок']],
    fields: [
      { name: 'title', label: 'Название раздела (кнопка на странице «Услуги»)', type: 'text', bi: true, required: true },
      { name: 'slug', label: 'Адрес (латиницей)', type: 'text' },
      { name: 'intro', label: 'Краткое описание', type: 'textarea', bi: true },
      { name: 'icon', label: 'Иконка', type: 'select', options: ICONS },
      { name: 'sort', label: 'Порядок', type: 'number' },
    ],
  },
  services: {
    table: 'services', title: 'Услуги', one: 'услугу', icon: 'briefcase', order: 'category_id, sort, id',
    columns: [['title_ru', 'Услуга'], ['category_id', 'Раздел', 'cat'], ['price_ru', 'Цена'], ['active', 'Показывается', 'bool']],
    fields: [
      { name: 'category_id', label: 'Раздел', type: 'select', options: 'categories', required: true },
      { name: 'title', label: 'Название услуги', type: 'text', bi: true, required: true },
      { name: 'desc', label: 'Пояснение (раскрывается по нажатию)', type: 'textarea', bi: true },
      { name: 'price', label: 'Цена (необязательно), например «от 25 000 ₸/мес.»', type: 'text', bi: true },
      { name: 'sort', label: 'Порядок', type: 'number' },
      { name: 'active', label: 'Показывать на сайте', type: 'check', default: 1 },
    ],
  },
  reviews: {
    table: 'reviews', title: 'Отзывы клиентов', one: 'отзыв', icon: 'star', order: 'sort, id DESC',
    columns: [['author', 'Автор'], ['company', 'Компания'], ['published', 'Опубликован', 'bool']],
    fields: [
      { name: 'author', label: 'Имя автора', type: 'text', required: true },
      { name: 'company', label: 'Компания / должность', type: 'text' },
      { name: 'text', label: 'Текст отзыва', type: 'textarea', bi: true, required: true },
      { name: 'photo', label: 'Фото автора (необязательно)', type: 'image' },
      { name: 'sort', label: 'Порядок', type: 'number' },
      { name: 'published', label: 'Опубликован', type: 'check', default: 1 },
    ],
  },
  faq: {
    table: 'faq', title: 'Вопросы и ответы', one: 'вопрос', icon: 'help', order: 'sort, id',
    columns: [['q_ru', 'Вопрос'], ['sort', 'Порядок'], ['published', 'Показывается', 'bool']],
    fields: [
      { name: 'q', label: 'Вопрос', type: 'text', bi: true, required: true },
      { name: 'a', label: 'Ответ', type: 'textarea', bi: true, required: true },
      { name: 'sort', label: 'Порядок', type: 'number' },
      { name: 'published', label: 'Показывать на сайте', type: 'check', default: 1 },
    ],
  },
};

const LEAD_STATUS = [['new', 'Новая'], ['in_progress', 'В работе'], ['won', 'Стал клиентом'], ['lost', 'Отказ'], ['spam', 'Спам']];
const CLIENT_STATUS = [['pending', 'Заявка на подключение'], ['active', 'Обслуживается'], ['paused', 'Приостановлен'], ['closed', 'Договор завершён']];
const REPORT_STATUS = [['planned', 'Запланирован'], ['in_progress', 'В работе'], ['waiting', 'Ждём документы'], ['submitted', 'Сдан'], ['accepted', 'Принят']];
const REPORT_PRESETS = [
  'ФНО 910.00 — упрощённая декларация', 'ФНО 200.00 — ИПН и социальный налог', 'ФНО 300.00 — НДС', 'ФНО 100.00 — КПН',
  'ФНО 220.00 — ИПН (ИП на ОУР)', 'ФНО 328.00 — косвенные налоги (ЕАЭС)', 'ФНО 101.02 — авансовые платежи КПН', 'ФНО 701.00 — налог на транспорт / имущество / землю',
  'Статистическая отчётность', 'Финансовая отчётность (депозитарий)', 'Уплата налогов и взносов', 'Расчёт заработной платы',
];
const ENTITY_TYPES = [['too', 'ТОО'], ['ip', 'ИП'], ['other', 'Другое']];
const TAX_REGIMES = [['simplified', 'Упрощённая декларация'], ['our', 'Общеустановленный'], ['other', 'Другой']];

module.exports = { ENTITIES, NEWS_CATS, ICONS, LEAD_STATUS, CLIENT_STATUS, REPORT_STATUS, REPORT_PRESETS, ENTITY_TYPES, TAX_REGIMES };
