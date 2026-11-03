/**
 * ОБРАЗЦОВАЯ БУХГАЛТЕРИЯ «ДИАЛОГ УЧЕТ»
 * Интерактивная логика, Калькулятор тарифа, Экспресс-квиз, Поиск услуг
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. HEADER SCROLL & MOBILE BURGER MENU
  // ==========================================
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  const burgerBtn = document.getElementById('burgerBtn');
  const navMenu = document.getElementById('navMenu');

  if (burgerBtn && navMenu) {
    burgerBtn.addEventListener('click', () => {
      navMenu.classList.toggle('open');
      const isOpen = navMenu.classList.contains('open');
      burgerBtn.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ==========================================
  // 2. INTERACTIVE SMART COST CALCULATOR
  // ==========================================
  const entityPills = document.querySelectorAll('#entityType .pill-btn');
  const taxPills = document.querySelectorAll('#taxRegime .pill-btn');
  const employeesRange = document.getElementById('employeesRange');
  const employeesVal = document.getElementById('employeesVal');
  const docsRange = document.getElementById('docsRange');
  const docsVal = document.getElementById('docsVal');
  const optVat = document.getElementById('optVat');
  const optVed = document.getElementById('optVed');
  const optBank = document.getElementById('optBank');
  const calculatedPrice = document.getElementById('calculatedPrice');
  const calcWhatsAppBtn = document.getElementById('calcWhatsAppBtn');

  let currentEntity = 'ip'; // 'ip' | 'too'
  let currentTax = 'simplified'; // 'simplified' | 'retail' | 'our' | 'patent'

  // Entity selection
  entityPills.forEach(btn => {
    btn.addEventListener('click', () => {
      entityPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEntity = btn.dataset.value;
      recalculatePrice();
    });
  });

  // Tax selection
  taxPills.forEach(btn => {
    btn.addEventListener('click', () => {
      taxPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTax = btn.dataset.value;
      recalculatePrice();
    });
  });

  // Employees range
  if (employeesRange && employeesVal) {
    employeesRange.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      employeesVal.textContent = val >= 30 ? '30+' : val;
      recalculatePrice();
    });
  }

  // Docs range
  const docsLabels = {
    1: 'До 10',
    2: 'До 50',
    3: 'До 150',
    4: 'Свыше 150'
  };

  if (docsRange && docsVal) {
    docsRange.addEventListener('input', (e) => {
      const step = parseInt(e.target.value, 10);
      docsVal.textContent = docsLabels[step] || 'До 10';
      recalculatePrice();
    });
  }

  // Checkboxes
  [optVat, optVed, optBank].forEach(chk => {
    if (chk) {
      chk.addEventListener('change', recalculatePrice);
    }
  });

  function recalculatePrice() {
    let basePrice = 25000;

    // Entity adjustment
    if (currentEntity === 'too') {
      basePrice += 15000;
    }

    // Tax regime adjustment
    if (currentTax === 'our') {
      basePrice += 20000;
    } else if (currentTax === 'retail') {
      basePrice += 10000;
    } else if (currentTax === 'patent') {
      basePrice -= 10000;
      if (basePrice < 15000) basePrice = 15000;
    }

    // Employees adjustment (approx 2,500 ₸ per staff member for payroll & Enbek reporting)
    const empCount = parseInt(employeesRange.value, 10);
    basePrice += empCount * 2500;

    // Documents volume adjustment
    const docStep = parseInt(docsRange.value, 10);
    if (docStep === 2) basePrice += 10000; // до 50
    if (docStep === 3) basePrice += 25000; // до 150
    if (docStep === 4) basePrice += 50000; // 150+

    // Options
    if (optVat && optVat.checked) basePrice += 20000;
    if (optVed && optVed.checked) basePrice += 25000;
    if (optBank && optBank.checked) basePrice += 10000;

    // Format output
    if (calculatedPrice) {
      calculatedPrice.textContent = basePrice.toLocaleString('ru-RU');
    }

    // Build customized WhatsApp link
    if (calcWhatsAppBtn) {
      const entityName = currentEntity === 'too' ? 'ТОО' : 'ИП';
      const taxNames = {
        simplified: 'Упрощенка (3%)',
        retail: 'Розничный налог',
        our: 'ОУР (Общеустановленный)',
        patent: 'Патент'
      };
      const taxName = taxNames[currentTax] || 'Упрощенка';
      const docsText = docsLabels[docStep] || 'До 10';

      let optionsList = [];
      if (optVat && optVat.checked) optionsList.push('с НДС');
      if (optVed && optVed.checked) optionsList.push('ВЭД');
      if (optBank && optBank.checked) optionsList.push('Банк-Клиент');
      const optStr = optionsList.length > 0 ? ` (Опции: ${optionsList.join(', ')})` : '';

      const msg = `Здравствуйте! Я рассчитал на сайте предварительный тариф для ${entityName} (${taxName}): сотрудников: ${empCount}, документов в месяц: ${docsText}${optStr}. Ориентир: ${basePrice.toLocaleString('ru-RU')} ₸/мес. Хочу зафиксировать эти условия и проконсультироваться.`;

      calcWhatsAppBtn.href = `https://wa.me/77070601980?text=${encodeURIComponent(msg)}`;
    }
  }

  // Initial calculation
  recalculatePrice();

  // ==========================================
  // 3. INTERACTIVE TAX AUDIT RISK QUIZ
  // ==========================================
  const quizBox = document.getElementById('quizBox');
  const quizSteps = document.querySelectorAll('.quiz-step');
  const quizResult = document.getElementById('quizResult');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const quizWaBtn = document.getElementById('quizWaBtn');
  const quizResetBtn = document.getElementById('quizResetBtn');

  let currentStep = 1;
  let totalRiskScore = 0;

  document.querySelectorAll('.quiz-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const points = parseInt(opt.dataset.points, 10) || 0;
      totalRiskScore += points;

      const currentStepEl = document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
      if (currentStepEl) currentStepEl.classList.remove('active');

      currentStep++;

      const nextStepEl = document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
      if (nextStepEl) {
        nextStepEl.classList.add('active');
      } else {
        // Show result
        showQuizResult();
      }
    });
  });

  function showQuizResult() {
    quizSteps.forEach(s => s.classList.remove('active'));
    if (quizResult) {
      quizResult.classList.add('active');

      let riskCategory = '';
      let waMessage = '';

      if (totalRiskScore >= 4) {
        resultTitle.textContent = 'Высокая степень риска (Красная зона)';
        resultTitle.style.color = '#ef4444';
        resultText.textContent = 'Внимание! Обнаружены серьезные маркеры риска по критериям СУР КГД МФ РК. Высокая вероятность блокировки расходных операций по счетам, вызова на комиссию или назначения проверки.';
        waMessage = 'Здравствуйте! Прошел экспресс-тест на сайте, результат: Высокая степень налогового риска (Красная зона). Нужен срочный аудит и помощь главного бухгалтера «Диалог Учет».';
      } else if (totalRiskScore >= 2) {
        resultTitle.textContent = 'Средняя степень риска (Желтая зона)';
        resultTitle.style.color = '#f59e0b';
        resultText.textContent = 'У вашей компании есть зоны уязвимости (возможны расхождения в ЭСФ, несданные уведомления или задержки по кадрам Enbek.kz). Рекомендуем устранить их до начисления пени и штрафов.';
        waMessage = 'Здравствуйте! Прошел экспресс-тест на сайте, результат: Средняя степень риска (Желтая зона). Хочу проверить компанию и получить консультацию.';
      } else {
        resultTitle.textContent = 'Низкая степень риска (Зеленая зона)';
        resultTitle.style.color = '#10b981';
        resultText.textContent = 'Отличный результат! Критических нарушений не выявлено. Мы поможем вам сохранить идеальное состояние учета и передать рутину на аутсорсинг с финансовой гарантией.';
        waMessage = 'Здравствуйте! Прошел экспресс-тест на сайте, учет в норме. Хочу узнать условия передачи бухгалтерии на аутсорсинг в «Диалог Учет».';
      }

      if (quizWaBtn) {
        quizWaBtn.href = `https://wa.me/77070601980?text=${encodeURIComponent(waMessage)}`;
      }
    }
  }

  if (quizResetBtn) {
    quizResetBtn.addEventListener('click', () => {
      totalRiskScore = 0;
      currentStep = 1;
      if (quizResult) quizResult.classList.remove('active');
      quizSteps.forEach((s, idx) => {
        if (idx === 0) s.classList.add('active');
        else s.classList.remove('active');
      });
    });
  }

  // ==========================================
  // 4. SERVICES FILTER TABS & SEARCH
  // ==========================================
  const srvTabs = document.querySelectorAll('.srv-tab');
  const searchInput = document.getElementById('serviceSearchInput');
  const accordionItems = document.querySelectorAll('.services-accordion-list .accordion-item');

  let currentCategory = 'all';
  let searchQuery = '';

  srvTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      srvTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.cat;
      filterServices();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      filterServices();
    });
  }

  function filterServices() {
    accordionItems.forEach(item => {
      const itemCat = item.dataset.cat || '';
      const itemKeywords = (item.dataset.keywords || '') + ' ' + item.textContent.toLowerCase();

      const matchesCat = (currentCategory === 'all' || itemCat === currentCategory);
      const matchesSearch = !searchQuery || itemKeywords.includes(searchQuery);

      if (matchesCat && matchesSearch) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // ==========================================
  // 5. ACCORDION LOGIC WITH SMOOTH HEIGHT
  // ==========================================
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('active');

      // Close all other accordions
      document.querySelectorAll('.accordion-item').forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
          const otherBody = otherItem.querySelector('.accordion-body');
          if (otherBody) otherBody.style.maxHeight = null;
        }
      });

      // Toggle current
      if (!isOpen) {
        item.classList.add('active');
        body.style.maxHeight = body.scrollHeight + 'px';
      } else {
        item.classList.remove('active');
        body.style.maxHeight = null;
      }
    });
  });

  // ==========================================
  // 6. SCROLL REVEAL ANIMATIONS
  // ==========================================
  const reveals = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  reveals.forEach(el => revealObserver.observe(el));

  // ==========================================
  // 7. ANIMATED NUMBER COUNTERS
  // ==========================================
  const statNumbers = document.querySelectorAll('.stat-number');
  const statObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        let start = 0;
        const duration = 1600;
        const frameRate = 30;
        const totalFrames = Math.round((duration / 1000) * frameRate);
        let frame = 0;

        if (target === 0) {
          el.textContent = '0' + suffix;
          obs.unobserve(el);
          return;
        }

        const counterTimer = setInterval(() => {
          frame++;
          const progress = frame / totalFrames;
          const current = Math.round(target * (1 - Math.pow(1 - progress, 3))); // easeOutCubic
          el.textContent = current.toLocaleString('ru-RU') + suffix;

          if (frame >= totalFrames) {
            clearInterval(counterTimer);
            el.textContent = target.toLocaleString('ru-RU') + suffix;
          }
        }, 1000 / frameRate);

        obs.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  statNumbers.forEach(el => statObserver.observe(el));
});
