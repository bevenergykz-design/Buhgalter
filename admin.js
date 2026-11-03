/**
 * ПАНЕЛЬ УПРАВЛЕНИЯ — ЛОГИКА (ADMIN JS)
 * ТОО «Образцовая бухгалтерия "Диалог Учёт"»
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. DATA STORAGE & CONSTANTS
  // ==========================================
  const STORAGE_KEYS = {
    AUTH_USER: 'dialog_admin_user',
    TARIFFS: 'dialog_uchet_tariffs',
    LEADS: 'dialog_uchet_leads',
    CLIENTS: 'dialog_uchet_clients',
    DOCS: 'dialog_uchet_docs',
    TELEGRAM: 'dialog_uchet_telegram'
  };

  const DEFAULT_TARIFFS = {
    ipBase: 25000,
    tooBase: 15000,
    perEmployee: 2500,
    taxOur: 20000,
    taxRetail: 10000,
    optVat: 20000,
    optVed: 25000,
    optBank: 10000
  };

  const DEFAULT_LEADS = [
    {
      id: 'L-101',
      date: '03.11.2026 18:40',
      name: 'Ерлан Садыков',
      phone: '+7 (705) 345-67-89',
      entity: 'ТОО',
      tax: 'ОУР с НДС',
      details: 'Сотрудников: 4, Документов: До 50, Опции: с НДС, ВЭД',
      source: 'Калькулятор тарифа',
      price: 95000,
      status: 'new',
      notes: 'Интересует ведение импорта из ЕАЭС и сдача ф. 300.00'
    },
    {
      id: 'L-102',
      date: '03.11.2026 16:15',
      name: 'Гульнара Ибраева',
      phone: '+7 (777) 123-45-67',
      entity: 'ИП',
      tax: 'Упрощенка',
      details: 'Сотрудников: 1, Документов: До 10',
      source: 'Калькулятор тарифа',
      price: 27500,
      status: 'in_progress',
      notes: 'Перезванивали, отправили договор на ознакомление в WhatsApp'
    },
    {
      id: 'L-103',
      date: '03.11.2026 14:05',
      name: 'Асхат Нурланов (ТОО СтройСервис)',
      phone: '+7 (701) 987-65-43',
      entity: 'ТОО',
      tax: 'ОУР с НДС',
      details: 'Результат: Красная зона (пришло уведомление камералки)',
      source: 'Квиз аудита рисков',
      price: 50000,
      status: 'new',
      notes: 'Срочно! Пришло уведомление КГД по сомнительным поставщикам, срок 30 дней'
    },
    {
      id: 'L-104',
      date: '02.11.2026 11:30',
      name: 'Тимур Касымов',
      phone: '+7 (707) 555-12-34',
      entity: 'ТОО',
      tax: 'Розничный налог',
      details: 'Сотрудников: 6, Документов: До 150, Банк-Клиент',
      source: 'Калькулятор тарифа',
      price: 75000,
      status: 'contract',
      notes: 'Договор подписан, перевели аванс за ноябрь. База 1С принята'
    }
  ];

  const DEFAULT_CLIENTS = [
    {
      id: 'C-1',
      name: 'ТОО «Алма Строй Сервис»',
      bin: '190440012345',
      tax: 'ОУР',
      accountant: 'Кузьменко Н. В.',
      reports: 'ф. 300 (Q3) — Сдано, ф. 200 — Сдано',
      fee: '120 000 ₸',
      status: 'Активен'
    },
    {
      id: 'C-2',
      name: 'ИП «Касымов К. А.»',
      bin: '850312300456',
      tax: 'Упрощенка',
      accountant: 'Смагулова А. Т.',
      reports: 'ф. 910 (1П) — Сдано, ф. 910 (2П) — Подготовка',
      fee: '35 000 ₸',
      status: 'Активен'
    },
    {
      id: 'C-3',
      name: 'ТОО «SilkWay Logistics»',
      bin: '210840034567',
      tax: 'ОУР',
      accountant: 'Кузьменко Н. В.',
      reports: 'ф. 300, 328 (ВЭД) — Сдано',
      fee: '150 000 ₸',
      status: 'Активен'
    },
    {
      id: 'C-4',
      name: 'ТОО «Step Catering Group»',
      bin: '220340056789',
      tax: 'Розничный',
      accountant: 'Смагулова А. Т.',
      reports: 'ф. 913 — Сдано, Enbek 100%',
      fee: '65 000 ₸',
      status: 'Активен'
    },
    {
      id: 'C-5',
      name: 'ИП «Beauty Studio Almaty»',
      bin: '920815400789',
      tax: 'Упрощенка',
      accountant: 'Омаров Д. Е.',
      reports: 'ф. 910 — Сдано, ОСМС оплачено',
      fee: '25 000 ₸',
      status: 'Активен'
    },
    {
      id: 'C-6',
      name: 'ТОО «Digital Retail KZ»',
      bin: '230140089123',
      tax: 'Розничный',
      accountant: 'Смагулова А. Т.',
      reports: 'ф. 913 — Сдано',
      fee: '55 000 ₸',
      status: 'Активен'
    }
  ];

  const DEFAULT_DOCS = [
    {
      id: 'D-501',
      date: '03.11.2026 17:10',
      client: 'ТОО «Алма Строй Сервис»',
      bin: '190440012345',
      name: 'АВР_Аренда_Склада_Октябрь.pdf',
      period: 'Октябрь 2026',
      amount: '450 000 ₸',
      status: 'pending'
    },
    {
      id: 'D-502',
      date: '03.11.2026 15:30',
      client: 'ТОО «SilkWay Logistics»',
      bin: '210840034567',
      name: 'ЭСФ_ГТД_Импорт_Оборудования.zip',
      period: 'Q3 2026',
      amount: '2 800 000 ₸',
      status: 'pending'
    },
    {
      id: 'D-503',
      date: '03.11.2026 11:20',
      client: 'ИП «Касымов К. А.»',
      bin: '850312300456',
      name: 'Выписка_Kaspi_Pay_10-2026.xlsx',
      period: 'Октябрь 2026',
      amount: '1 230 000 ₸',
      status: 'processed'
    },
    {
      id: 'D-504',
      date: '02.11.2026 14:40',
      client: 'ТОО «Step Catering Group»',
      bin: '220340056789',
      name: 'Накладные_Продукты_Акт_Сверки.pdf',
      period: 'Октябрь 2026',
      amount: '890 000 ₸',
      status: 'rejected'
    }
  ];

  const DEFAULT_EMPLOYEES = [
    {
      id: 'E-1',
      name: 'Кузьменко Наталья Вячеславовна',
      position: 'Директор / Главный бухгалтер',
      email: 'kuzmenko@dialog-uchet.kz',
      role: 'Руководитель (Полный доступ)',
      clientsCount: 2,
      status: 'В сети'
    },
    {
      id: 'E-2',
      name: 'Смагулова Алия Токтаровна',
      position: 'Ведущий бухгалтер (ОУР, НДС, ВЭД)',
      email: 'smagulova@dialog-uchet.kz',
      role: 'Бухгалтер',
      clientsCount: 3,
      status: 'В сети'
    },
    {
      id: 'E-3',
      name: 'Омаров Данияр Ерланович',
      position: 'Менеджер по клиентам / 1С специалист',
      email: 'omarov@dialog-uchet.kz',
      role: 'Менеджер',
      clientsCount: 1,
      status: 'Не в сети'
    }
  ];

  // ==========================================
  // 2. HELPER FUNCTIONS FOR STORAGE
  // ==========================================
  function getStorage(key, defaultVal) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  function setStorage(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('Storage save error', e);
    }
  }

  // Init Data if not present
  if (!localStorage.getItem(STORAGE_KEYS.TARIFFS)) setStorage(STORAGE_KEYS.TARIFFS, DEFAULT_TARIFFS);
  if (!localStorage.getItem(STORAGE_KEYS.LEADS)) setStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
  if (!localStorage.getItem(STORAGE_KEYS.CLIENTS)) setStorage(STORAGE_KEYS.CLIENTS, DEFAULT_CLIENTS);
  if (!localStorage.getItem(STORAGE_KEYS.DOCS)) setStorage(STORAGE_KEYS.DOCS, DEFAULT_DOCS);

  // ==========================================
  // 3. AUTHENTICATION & ROLES
  // ==========================================
  const authScreen = document.getElementById('authScreen');
  const adminApp = document.getElementById('adminApp');
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserRole = document.getElementById('sidebarUserRole');
  const sidebarAvatar = document.getElementById('sidebarAvatar');

  let currentUser = getStorage(STORAGE_KEYS.AUTH_USER, null);

  function checkAuth() {
    if (currentUser) {
      authScreen.style.display = 'none';
      adminApp.style.display = 'flex';
      sidebarUserName.textContent = currentUser.name;
      sidebarUserRole.textContent = currentUser.roleTitle;
      sidebarAvatar.textContent = currentUser.avatar;
      initAppViews();
    } else {
      authScreen.style.display = 'flex';
      adminApp.style.display = 'none';
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const role = document.querySelector('input[name="authRole"]:checked').value;
      
      let userObj = {
        role: role,
        name: 'Кузьменко Н. В.',
        roleTitle: 'Руководитель (Директор)',
        avatar: 'НК'
      };

      if (role === 'accountant') {
        userObj = {
          role: 'accountant',
          name: 'Смагулова А. Т.',
          roleTitle: 'Ведущий бухгалтер',
          avatar: 'АС'
        };
      } else if (role === 'manager') {
        userObj = {
          role: 'manager',
          name: 'Омаров Д. Е.',
          roleTitle: 'Менеджер по клиентам',
          avatar: 'ДО'
        };
      }

      currentUser = userObj;
      setStorage(STORAGE_KEYS.AUTH_USER, userObj);
      checkAuth();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      currentUser = null;
      checkAuth();
    });
  }

  // ==========================================
  // 4. SIDEBAR NAVIGATION & TABS
  // ==========================================
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const pageTitle = document.getElementById('pageTitle');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const adminSidebar = document.getElementById('adminSidebar');

  const tabTitles = {
    leads: 'Лиды и входящие заявки',
    tariffs: 'Управление ценами и калькулятором на сайте',
    clients: 'Клиенты на абонентском обслуживании (ИП / ТОО)',
    documents: 'Первичные документы клиентов (1С)',
    telegram: 'Интеграция с Telegram-ботом',
    employees: 'Сотрудники компании и права доступа'
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      tabPanels.forEach(p => p.classList.remove('active'));
      const targetPanel = document.getElementById(`tab${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`);
      if (targetPanel) targetPanel.classList.add('active');

      if (pageTitle && tabTitles[targetTab]) {
        pageTitle.textContent = tabTitles[targetTab];
      }
    });
  });

  if (toggleSidebarBtn && adminSidebar) {
    toggleSidebarBtn.addEventListener('click', () => {
      adminSidebar.classList.toggle('collapsed');
    });
  }

  // ==========================================
  // 5. TARIFFS MANAGEMENT (FOR EMPLOYEES)
  // ==========================================
  const priceIpBase = document.getElementById('priceIpBase');
  const priceTooBase = document.getElementById('priceTooBase');
  const pricePerEmployee = document.getElementById('pricePerEmployee');
  const priceTaxOur = document.getElementById('priceTaxOur');
  const priceTaxRetail = document.getElementById('priceTaxRetail');
  const priceOptVat = document.getElementById('priceOptVat');
  const priceOptVed = document.getElementById('priceOptVed');
  const priceOptBank = document.getElementById('priceOptBank');
  const saveTariffsBtn = document.getElementById('saveTariffsBtn');
  const resetTariffsBtn = document.getElementById('resetTariffsBtn');
  const tariffSaveStatus = document.getElementById('tariffSaveStatus');

  const prevIpSimple = document.getElementById('prevIpSimple');
  const prevTooStaff = document.getElementById('prevTooStaff');
  const prevTooBig = document.getElementById('prevTooBig');

  function loadTariffsForm() {
    const t = getStorage(STORAGE_KEYS.TARIFFS, DEFAULT_TARIFFS);
    if (!priceIpBase) return;

    priceIpBase.value = t.ipBase;
    priceTooBase.value = t.tooBase;
    pricePerEmployee.value = t.perEmployee;
    priceTaxOur.value = t.taxOur;
    priceTaxRetail.value = t.taxRetail;
    priceOptVat.value = t.optVat;
    priceOptVed.value = t.optVed;
    priceOptBank.value = t.optBank;

    updateTariffPreview(t);
  }

  function updateTariffPreview(t) {
    if (prevIpSimple) {
      prevIpSimple.textContent = t.ipBase.toLocaleString('ru-RU') + ' ₸';
    }
    if (prevTooStaff) {
      const calc1 = t.ipBase + t.tooBase + (5 * t.perEmployee) + t.optBank;
      prevTooStaff.textContent = calc1.toLocaleString('ru-RU') + ' ₸';
    }
    if (prevTooBig) {
      const calc2 = t.ipBase + t.tooBase + t.taxOur + (10 * t.perEmployee) + t.optVat + t.optVed;
      prevTooBig.textContent = calc2.toLocaleString('ru-RU') + ' ₸';
    }
  }

  [priceIpBase, priceTooBase, pricePerEmployee, priceTaxOur, priceTaxRetail, priceOptVat, priceOptVed, priceOptBank].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        const temp = {
          ipBase: parseInt(priceIpBase.value, 10) || 0,
          tooBase: parseInt(priceTooBase.value, 10) || 0,
          perEmployee: parseInt(pricePerEmployee.value, 10) || 0,
          taxOur: parseInt(priceTaxOur.value, 10) || 0,
          taxRetail: parseInt(priceTaxRetail.value, 10) || 0,
          optVat: parseInt(priceOptVat.value, 10) || 0,
          optVed: parseInt(priceOptVed.value, 10) || 0,
          optBank: parseInt(priceOptBank.value, 10) || 0
        };
        updateTariffPreview(temp);
      });
    }
  });

  if (saveTariffsBtn) {
    saveTariffsBtn.addEventListener('click', () => {
      const updated = {
        ipBase: parseInt(priceIpBase.value, 10) || DEFAULT_TARIFFS.ipBase,
        tooBase: parseInt(priceTooBase.value, 10) || DEFAULT_TARIFFS.tooBase,
        perEmployee: parseInt(pricePerEmployee.value, 10) || DEFAULT_TARIFFS.perEmployee,
        taxOur: parseInt(priceTaxOur.value, 10) || DEFAULT_TARIFFS.taxOur,
        taxRetail: parseInt(priceTaxRetail.value, 10) || DEFAULT_TARIFFS.taxRetail,
        optVat: parseInt(priceOptVat.value, 10) || DEFAULT_TARIFFS.optVat,
        optVed: parseInt(priceOptVed.value, 10) || DEFAULT_TARIFFS.optVed,
        optBank: parseInt(priceOptBank.value, 10) || DEFAULT_TARIFFS.optBank
      };
      setStorage(STORAGE_KEYS.TARIFFS, updated);
      tariffSaveStatus.textContent = '✓ Тарифы сохранены и обновлены на сайте!';
      setTimeout(() => { tariffSaveStatus.textContent = ''; }, 3500);
    });
  }

  if (resetTariffsBtn) {
    resetTariffsBtn.addEventListener('click', () => {
      if (confirm('Сбросить тарифы к начальным настройкам?')) {
        setStorage(STORAGE_KEYS.TARIFFS, DEFAULT_TARIFFS);
        loadTariffsForm();
        tariffSaveStatus.textContent = 'Тарифы сброшены';
        setTimeout(() => { tariffSaveStatus.textContent = ''; }, 3000);
      }
    });
  }

  // ==========================================
  // 6. LEADS VIEW & MANAGEMENT
  // ==========================================
  const leadsTableBody = document.getElementById('leadsTableBody');
  const leadSearchInput = document.getElementById('leadSearchInput');
  const leadStatusFilter = document.getElementById('leadStatusFilter');
  const leadSourceFilter = document.getElementById('leadSourceFilter');
  const leadsTotal = document.getElementById('leadsTotal');
  const leadsNew = document.getElementById('leadsNew');
  const leadsInProgress = document.getElementById('leadsInProgress');
  const leadsClosed = document.getElementById('leadsClosed');
  const badgeLeadsCount = document.getElementById('badgeLeadsCount');
  const exportLeadsBtn = document.getElementById('exportLeadsBtn');

  function renderLeads() {
    const leads = getStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
    const search = leadSearchInput ? leadSearchInput.value.toLowerCase().trim() : '';
    const statusF = leadStatusFilter ? leadStatusFilter.value : 'all';
    const sourceF = leadSourceFilter ? leadSourceFilter.value : 'all';

    let countNew = 0, countProg = 0, countClosed = 0;

    leads.forEach(l => {
      if (l.status === 'new') countNew++;
      if (l.status === 'in_progress') countProg++;
      if (l.status === 'contract') countClosed++;
    });

    if (leadsTotal) leadsTotal.textContent = leads.length;
    if (leadsNew) leadsNew.textContent = countNew;
    if (leadsInProgress) leadsInProgress.textContent = countProg;
    if (leadsClosed) leadsClosed.textContent = countClosed;
    if (badgeLeadsCount) badgeLeadsCount.textContent = countNew;

    if (!leadsTableBody) return;
    leadsTableBody.innerHTML = '';

    const filtered = leads.filter(l => {
      const matchesSearch = !search || 
        l.name.toLowerCase().includes(search) || 
        l.phone.toLowerCase().includes(search) || 
        l.entity.toLowerCase().includes(search) ||
        (l.notes && l.notes.toLowerCase().includes(search));

      const matchesStatus = (statusF === 'all' || l.status === statusF);
      const matchesSource = (sourceF === 'all' || 
        (sourceF === 'calc' && l.source.includes('Калькулятор')) ||
        (sourceF === 'quiz' && l.source.includes('Квиз')) ||
        (sourceF === 'direct' && l.source.includes('WhatsApp')));

      return matchesSearch && matchesStatus && matchesSource;
    });

    if (filtered.length === 0) {
      leadsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: #888;">Заявок по выбранным фильтрам не найдено</td></tr>`;
      return;
    }

    filtered.forEach(lead => {
      const tr = document.createElement('tr');
      const cleanPhone = lead.phone.replace(/[^0-9]/g, '');

      let statusBadge = `<span class="status-badge new">Новая</span>`;
      if (lead.status === 'in_progress') statusBadge = `<span class="status-badge in_progress">В работе</span>`;
      if (lead.status === 'contract') statusBadge = `<span class="status-badge contract">Договор ✓</span>`;
      if (lead.status === 'archive') statusBadge = `<span class="status-badge archive">Архив</span>`;

      tr.innerHTML = `
        <td><small class="font-mono">${lead.date}</small></td>
        <td>
          <strong>${lead.name}</strong><br>
          <a href="tel:${cleanPhone}" class="accent-link" style="font-size:0.85rem;">${lead.phone}</a>
        </td>
        <td><span class="nav-tag" style="background:#e6e3fd; color:#544cab;">${lead.source}</span></td>
        <td>
          <strong>${lead.entity}</strong> • ${lead.tax}<br>
          <small style="color:#666;">${lead.details || ''}</small>
        </td>
        <td><strong class="font-mono" style="color:#544cab;">${lead.price ? lead.price.toLocaleString('ru-RU') + ' ₸' : '—'}</strong></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            <a href="https://wa.me/${cleanPhone}?text=${encodeURIComponent('Здравствуйте, ' + lead.name + '! ТОО «Образцовая бухгалтерия "Диалог Учёт"», вы оставляли заявку на бухгалтерское сопровождение.')}" target="_blank" class="btn btn-sm" style="background:#25d366; color:#fff;" title="Написать в WhatsApp">WA</a>
            <button class="btn btn-sm btn-secondary change-lead-status" data-id="${lead.id}">Статус</button>
            <button class="btn btn-sm btn-secondary delete-lead" data-id="${lead.id}" title="Удалить" style="color:#dc2626;">×</button>
          </div>
        </td>
      `;
      leadsTableBody.appendChild(tr);
    });

    // Attach actions
    document.querySelectorAll('.change-lead-status').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        cycleLeadStatus(id);
      });
    });

    document.querySelectorAll('.delete-lead').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('Удалить эту заявку?')) {
          deleteLead(id);
        }
      });
    });
  }

  function cycleLeadStatus(id) {
    const leads = getStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    const flow = ['new', 'in_progress', 'contract', 'archive'];
    const currentIdx = flow.indexOf(lead.status);
    lead.status = flow[(currentIdx + 1) % flow.length];

    setStorage(STORAGE_KEYS.LEADS, leads);
    renderLeads();
  }

  function deleteLead(id) {
    let leads = getStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
    leads = leads.filter(l => l.id !== id);
    setStorage(STORAGE_KEYS.LEADS, leads);
    renderLeads();
  }

  if (leadSearchInput) leadSearchInput.addEventListener('input', renderLeads);
  if (leadStatusFilter) leadStatusFilter.addEventListener('change', renderLeads);
  if (leadSourceFilter) leadSourceFilter.addEventListener('change', renderLeads);

  // Export to CSV
  if (exportLeadsBtn) {
    exportLeadsBtn.addEventListener('click', () => {
      const leads = getStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);
      let csv = 'ID;Дата;Имя;Телефон;Форма;Режим;Сумма;Источник;Статус;Заметки\n';
      leads.forEach(l => {
        csv += `"${l.id}";"${l.date}";"${l.name}";"${l.phone}";"${l.entity}";"${l.tax}";"${l.price}";"${l.source}";"${l.status}";"${(l.notes||'').replace(/"/g, '""')}"\n`;
      });

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `leads_dialog_uchet_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // ==========================================
  // 7. CLIENTS DIRECTORY
  // ==========================================
  const clientsTableBody = document.getElementById('clientsTableBody');
  const clientSearchInput = document.getElementById('clientSearchInput');
  const clientTaxFilter = document.getElementById('clientTaxFilter');

  function renderClients() {
    if (!clientsTableBody) return;
    const clients = getStorage(STORAGE_KEYS.CLIENTS, DEFAULT_CLIENTS);
    const search = clientSearchInput ? clientSearchInput.value.toLowerCase().trim() : '';
    const taxF = clientTaxFilter ? clientTaxFilter.value : 'all';

    clientsTableBody.innerHTML = '';

    const filtered = clients.filter(c => {
      const matchesSearch = !search || 
        c.name.toLowerCase().includes(search) || 
        c.bin.includes(search) || 
        c.accountant.toLowerCase().includes(search);
      const matchesTax = (taxF === 'all' || c.tax.includes(taxF));
      return matchesSearch && matchesTax;
    });

    filtered.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.name}</strong></td>
        <td><span class="font-mono">${c.bin}</span></td>
        <td><span class="nav-tag" style="background:#f3f8fa; color:#1d2538;">${c.tax}</span></td>
        <td>${c.accountant}</td>
        <td><small style="color:#2e9e5b; font-weight:600;">${c.reports}</small></td>
        <td><strong class="font-mono">${c.fee}</strong></td>
        <td><span class="status-badge contract">${c.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="alert('Карточка клиента ${c.name} открыта в базе')">Карточка</button>
        </td>
      `;
      clientsTableBody.appendChild(tr);
    });
  }

  if (clientSearchInput) clientSearchInput.addEventListener('input', renderClients);
  if (clientTaxFilter) clientTaxFilter.addEventListener('change', renderClients);

  // ==========================================
  // 8. CLIENT PRIMARY DOCUMENTS
  // ==========================================
  const docsTableBody = document.getElementById('docsTableBody');
  const docSearchInput = document.getElementById('docSearchInput');
  const docStatusFilter = document.getElementById('docStatusFilter');
  const refreshDocsBtn = document.getElementById('refreshDocsBtn');

  function renderDocs() {
    if (!docsTableBody) return;
    const docs = getStorage(STORAGE_KEYS.DOCS, DEFAULT_DOCS);
    const search = docSearchInput ? docSearchInput.value.toLowerCase().trim() : '';
    const statusF = docStatusFilter ? docStatusFilter.value : 'all';

    docsTableBody.innerHTML = '';

    const filtered = docs.filter(d => {
      const matchesSearch = !search || 
        d.client.toLowerCase().includes(search) || 
        d.name.toLowerCase().includes(search) || 
        d.bin.includes(search);
      const matchesStatus = (statusF === 'all' || d.status === statusF);
      return matchesSearch && matchesStatus;
    });

    filtered.forEach(d => {
      const tr = document.createElement('tr');
      let statusHtml = `<span class="status-badge new">Ожидает</span>`;
      if (d.status === 'processed') statusHtml = `<span class="status-badge contract">Проведено в 1С ✓</span>`;
      if (d.status === 'rejected') statusHtml = `<span class="status-badge" style="background:#fee2e2; color:#dc2626;">Требует акта</span>`;

      tr.innerHTML = `
        <td><small class="font-mono">${d.date}</small></td>
        <td><strong>${d.client}</strong><br><small class="font-mono" style="color:#666;">БИН: ${d.bin}</small></td>
        <td>📁 <strong>${d.name}</strong></td>
        <td>${d.period}</td>
        <td><strong class="font-mono">${d.amount}</strong></td>
        <td>${statusHtml}</td>
        <td>
          <div style="display:flex; gap:0.35rem;">
            <button class="btn btn-sm btn-primary set-doc-processed" data-id="${d.id}" title="Пометить как проведенный в 1С">В 1С</button>
            <button class="btn btn-sm btn-secondary set-doc-rejected" data-id="${d.id}" title="Вернуть клиенту с замечанием">Замечание</button>
          </div>
        </td>
      `;
      docsTableBody.appendChild(tr);
    });

    document.querySelectorAll('.set-doc-processed').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const docs = getStorage(STORAGE_KEYS.DOCS, DEFAULT_DOCS);
        const doc = docs.find(x => x.id === id);
        if (doc) {
          doc.status = 'processed';
          setStorage(STORAGE_KEYS.DOCS, docs);
          renderDocs();
        }
      });
    });

    document.querySelectorAll('.set-doc-rejected').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const docs = getStorage(STORAGE_KEYS.DOCS, DEFAULT_DOCS);
        const doc = docs.find(x => x.id === id);
        if (doc) {
          doc.status = 'rejected';
          setStorage(STORAGE_KEYS.DOCS, docs);
          renderDocs();
        }
      });
    });
  }

  if (docSearchInput) docSearchInput.addEventListener('input', renderDocs);
  if (docStatusFilter) docStatusFilter.addEventListener('change', renderDocs);
  if (refreshDocsBtn) refreshDocsBtn.addEventListener('click', renderDocs);

  // ==========================================
  // 9. TELEGRAM SETTINGS
  // ==========================================
  const tgBotToken = document.getElementById('tgBotToken');
  const tgChatId = document.getElementById('tgChatId');
  const tgSendCalculations = document.getElementById('tgSendCalculations');
  const tgSendQuiz = document.getElementById('tgSendQuiz');
  const tgSendDocUploads = document.getElementById('tgSendDocUploads');
  const saveTelegramSettingsBtn = document.getElementById('saveTelegramSettingsBtn');
  const testTelegramBtn = document.getElementById('testTelegramBtn');
  const tgTestResult = document.getElementById('tgTestResult');

  function loadTelegramSettings() {
    const tg = getStorage(STORAGE_KEYS.TELEGRAM, {
      botToken: '',
      chatId: '',
      sendCalculations: true,
      sendQuiz: true,
      sendDocs: true
    });

    if (tgBotToken) tgBotToken.value = tg.botToken || '';
    if (tgChatId) tgChatId.value = tg.chatId || '';
    if (tgSendCalculations) tgSendCalculations.checked = tg.sendCalculations;
    if (tgSendQuiz) tgSendQuiz.checked = tg.sendQuiz;
    if (tgSendDocUploads) tgSendDocUploads.checked = tg.sendDocs;
  }

  if (saveTelegramSettingsBtn) {
    saveTelegramSettingsBtn.addEventListener('click', () => {
      const tgData = {
        botToken: tgBotToken.value.trim(),
        chatId: tgChatId.value.trim(),
        sendCalculations: tgSendCalculations.checked,
        sendQuiz: tgSendQuiz.checked,
        sendDocs: tgSendDocUploads.checked
      };
      setStorage(STORAGE_KEYS.TELEGRAM, tgData);
      tgTestResult.textContent = '✓ Настройки Telegram сохранены!';
      setTimeout(() => { tgTestResult.textContent = ''; }, 3000);
    });
  }

  if (testTelegramBtn) {
    testTelegramBtn.addEventListener('click', async () => {
      const token = tgBotToken.value.trim();
      const chat = tgChatId.value.trim();

      if (!token || !chat) {
        alert('Пожалуйста, укажите Bot Token и Chat ID для проверки!');
        return;
      }

      tgTestResult.textContent = 'Отправка теста...';

      try {
        const text = `🔔 Тестовое уведомление из панели управления «Диалог Учет»\nСистема настроена и готова получать новые расчеты с сайта!`;
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text: text })
        });
        const data = await res.json();
        if (data.ok) {
          tgTestResult.textContent = '✓ Сообщение успешно доставлено в Telegram!';
        } else {
          tgTestResult.textContent = 'Ошибка: ' + (data.description || 'Не удалось отправить');
        }
      } catch (err) {
        tgTestResult.textContent = 'Ошибка сети или неверный токен бота';
      }
    });
  }

  // ==========================================
  // 10. EMPLOYEES DIRECTORY
  // ==========================================
  const employeesTableBody = document.getElementById('employeesTableBody');
  function renderEmployees() {
    if (!employeesTableBody) return;
    employeesTableBody.innerHTML = '';

    DEFAULT_EMPLOYEES.forEach(emp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${emp.name}</strong></td>
        <td>${emp.position}</td>
        <td><span class="font-mono">${emp.email}</span></td>
        <td><span class="nav-tag" style="background:#e6e3fd; color:#544cab;">${emp.role}</span></td>
        <td><strong>${emp.clientsCount} компаний</strong></td>
        <td><span class="status-badge contract">${emp.status}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="alert('Редактирование профиля ${emp.name}')">Настройки</button>
        </td>
      `;
      employeesTableBody.appendChild(tr);
    });
  }

  // ==========================================
  // 11. MANUAL ADD LEAD MODAL
  // ==========================================
  const addManualLeadBtn = document.getElementById('addManualLeadBtn');
  const leadModal = document.getElementById('leadModal');
  const leadForm = document.getElementById('leadForm');

  if (addManualLeadBtn && leadModal) {
    addManualLeadBtn.addEventListener('click', () => {
      leadForm.reset();
      leadModal.classList.add('active');
    });
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mId = btn.dataset.close;
      const m = document.getElementById(mId);
      if (m) m.classList.remove('active');
    });
  });

  if (leadForm) {
    leadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const leads = getStorage(STORAGE_KEYS.LEADS, DEFAULT_LEADS);

      const newL = {
        id: 'L-' + (Math.floor(Math.random() * 900) + 100),
        date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        name: document.getElementById('mLeadName').value.trim(),
        phone: document.getElementById('mLeadPhone').value.trim(),
        entity: document.getElementById('mLeadEntity').value,
        tax: document.getElementById('mLeadTax').value,
        price: parseInt(document.getElementById('mLeadPrice').value, 10) || 35000,
        source: 'Ручное добавление',
        status: document.getElementById('mLeadStatus').value,
        notes: document.getElementById('mLeadNotes').value.trim()
      };

      leads.unshift(newL);
      setStorage(STORAGE_KEYS.LEADS, leads);
      leadModal.classList.remove('active');
      renderLeads();
    });
  }

  // ==========================================
  // 12. INITIALIZATION
  // ==========================================
  function initAppViews() {
    loadTariffsForm();
    renderLeads();
    renderClients();
    renderDocs();
    renderEmployees();
    loadTelegramSettings();
  }

  // Check auth on load
  checkAuth();

});
