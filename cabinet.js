/**
 * ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА — ЛОГИКА (CABINET JS)
 * ТОО «Образцовая бухгалтерия "Диалог Учёт"»
 */

document.addEventListener('DOMContentLoaded', () => {

  const STORAGE_KEYS = {
    CLIENT_AUTH: 'dialog_client_auth',
    DOCS: 'dialog_uchet_docs'
  };

  const CLIENT_ACCOUNTS = {
    '190440012345': {
      name: 'ТОО «Алма Строй Сервис»',
      bin: '190440012345',
      tax: 'ОУР с НДС',
      accountant: 'Кузьменко Наталья Вячеславовна',
      accInitials: 'НК',
      fee: '120 000 ₸',
      forms: ['ф. 300.00 (НДС)', 'ф. 200.00 (ЗП)', 'ф. 328.00 (ВЭД)']
    },
    '850312300456': {
      name: 'ИП «Касымов К. А.»',
      bin: '850312300456',
      tax: 'Упрощенная декларация (3%)',
      accountant: 'Смагулова Алия Токтаровна',
      accInitials: 'АС',
      fee: '35 000 ₸',
      forms: ['ф. 910.00 (Упрощенка)', 'Кабинет налогоплательщика', 'Enbek.kz']
    }
  };

  const clientAuthScreen = document.getElementById('clientAuthScreen');
  const clientCabinetApp = document.getElementById('clientCabinetApp');
  const clientLoginForm = document.getElementById('clientLoginForm');
  const clientLogoutBtn = document.getElementById('clientLogoutBtn');
  const demoButtons = document.querySelectorAll('.demo-client-btn');
  const cBinInput = document.getElementById('cBinInput');

  const cHeaderName = document.getElementById('cHeaderName');
  const cHeaderBin = document.getElementById('cHeaderBin');
  const cPlanPrice = document.getElementById('cPlanPrice');
  const cDocsTableBody = document.getElementById('cDocsTableBody');

  const cDropZone = document.getElementById('cDropZone');
  const cFileInput = document.getElementById('cFileInput');
  const cBrowseBtn = document.getElementById('cBrowseBtn');

  let currentClient = null;

  // Demo client selectors
  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      demoButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bin = btn.dataset.bin;
      if (cBinInput) cBinInput.value = bin;
    });
  });

  // Check saved session
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CLIENT_AUTH);
    if (saved) {
      currentClient = JSON.parse(saved);
    }
  } catch (e) {}

  function checkClientAuth() {
    if (currentClient) {
      clientAuthScreen.style.display = 'none';
      clientCabinetApp.style.display = 'block';

      if (cHeaderName) cHeaderName.textContent = currentClient.name;
      if (cHeaderBin) cHeaderBin.textContent = currentClient.bin;
      if (cPlanPrice) cPlanPrice.textContent = currentClient.fee;

      renderClientDocs();
    } else {
      clientAuthScreen.style.display = 'flex';
      clientCabinetApp.style.display = 'none';
    }
  }

  if (clientLoginForm) {
    clientLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const bin = cBinInput.value.trim();
      const client = CLIENT_ACCOUNTS[bin] || {
        name: 'ТОО / ИП (БИН: ' + bin + ')',
        bin: bin,
        tax: 'Упрощенный режим',
        accountant: 'Кузьменко Наталья Вячеславовна',
        accInitials: 'НК',
        fee: '45 000 ₸'
      };

      currentClient = client;
      localStorage.setItem(STORAGE_KEYS.CLIENT_AUTH, JSON.stringify(client));
      checkClientAuth();
    });
  }

  if (clientLogoutBtn) {
    clientLogoutBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.CLIENT_AUTH);
      currentClient = null;
      checkClientAuth();
    });
  }

  // ==========================================
  // DOCUMENT RENDER & UPLOAD
  // ==========================================
  function renderClientDocs() {
    if (!cDocsTableBody || !currentClient) return;

    let allDocs = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOCS);
      if (saved) allDocs = JSON.parse(saved);
    } catch (e) {}

    // Filter by client BIN
    const clientDocs = allDocs.filter(d => d.bin === currentClient.bin);
    cDocsTableBody.innerHTML = '';

    if (clientDocs.length === 0) {
      cDocsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color:#888;">Вы еще не загружали документы за этот месяц. Загрузите файлы через форму выше.</td></tr>`;
      return;
    }

    clientDocs.forEach(d => {
      const tr = document.createElement('tr');
      let statusHtml = `<span style="color:#d97706; font-weight:700;">● Ожидает проверки</span>`;
      if (d.status === 'processed') statusHtml = `<span style="color:#2e9e5b; font-weight:700;">✓ Проведено в 1С</span>`;
      if (d.status === 'rejected') statusHtml = `<span style="color:#dc2626; font-weight:700;">⚠ Замечание бухгалтера</span>`;

      tr.innerHTML = `
        <td><small class="font-mono">${d.date.slice(0, 10)}</small></td>
        <td><strong>📄 ${d.name}</strong></td>
        <td><span class="font-mono">${d.amount || '—'}</span></td>
        <td>${statusHtml}</td>
      `;
      cDocsTableBody.appendChild(tr);
    });
  }

  function handleFiles(files) {
    if (!files || files.length === 0 || !currentClient) return;

    let allDocs = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOCS);
      if (saved) allDocs = JSON.parse(saved);
    } catch (e) {}

    Array.from(files).forEach(f => {
      const newDoc = {
        id: 'D-' + (Math.floor(Math.random() * 9000) + 1000),
        date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        client: currentClient.name,
        bin: currentClient.bin,
        name: f.name,
        period: 'Ноябрь 2026',
        amount: (Math.floor(Math.random() * 450) + 50) + ' 000 ₸',
        status: 'pending'
      };
      allDocs.unshift(newDoc);
    });

    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(allDocs));
    renderClientDocs();

    alert(`✓ Успешно передано файлов: ${files.length}. Главный бухгалтер получил уведомление и приступает к обработке в 1С.`);
  }

  // Dropzone drag-and-drop
  if (cDropZone && cFileInput) {
    cBrowseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cFileInput.click();
    });

    cDropZone.addEventListener('click', () => {
      cFileInput.click();
    });

    cFileInput.addEventListener('change', () => {
      handleFiles(cFileInput.files);
      cFileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      cDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        cDropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      cDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        cDropZone.classList.remove('dragover');
      });
    });

    cDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files) {
        handleFiles(dt.files);
      }
    });
  }

  // Initialize
  checkClientAuth();

});
