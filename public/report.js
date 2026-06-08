const loginPanel = document.querySelector('#loginPanel');
const reportPanel = document.querySelector('#reportPanel');
const loginForm = document.querySelector('#loginForm');
const loginStatus = document.querySelector('#loginStatus');
const filtersForm = document.querySelector('#filtersForm');
const reportStatus = document.querySelector('#reportStatus');
const reportRows = document.querySelector('#reportRows');
const retailStoreSelect = document.querySelector('#retailStore');
const printReport = document.querySelector('#printReport');

const els = {
  dateFrom: document.querySelector('#dateFrom'),
  dateTo: document.querySelector('#dateTo'),
  periodLabel: document.querySelector('#periodLabel'),
  periodPrev: document.querySelector('#periodPrev'),
  periodNext: document.querySelector('#periodNext'),
  totalDocuments: document.querySelector('#totalDocuments'),
  totalAmount: document.querySelector('#totalAmount'),
  totalPaid: document.querySelector('#totalPaid'),
  totalUnpaid: document.querySelector('#totalUnpaid'),
  totalNetProfit: document.querySelector('#totalNetProfit')
};

let currentReport = null;
let currentPeriod = 'today';
let periodOffset = 0;

init();

async function init() {
  setPeriod('today');
  bindEvents();
  const session = await api('/api/report/session').catch(() => ({ authenticated: false }));
  if (session.authenticated) {
    showReport();
  }
}

function bindEvents() {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginStatus.textContent = 'Проверяю доступ...';

    try {
      await api('/api/report/login', {
        method: 'POST',
        body: {
          login: document.querySelector('#login').value,
          password: document.querySelector('#password').value
        }
      });
      loginStatus.textContent = '';
      showReport();
    } catch (error) {
      loginStatus.textContent = error.message;
    }
  });

  document.querySelector('#logoutButton').addEventListener('click', async () => {
    await api('/api/report/logout', { method: 'POST', body: {} }).catch(() => {});
    reportPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
  });

  filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    currentPeriod = 'custom';
    updatePeriodLabel();
    await loadReport();
  });

  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', async () => {
      setPeriod(button.dataset.period);
      await loadReport();
    });
  });

  els.periodPrev.addEventListener('click', async () => {
    shiftPeriod(-1);
    await loadReport();
  });

  els.periodNext.addEventListener('click', async () => {
    shiftPeriod(1);
    await loadReport();
  });

  document.querySelector('#printButton').addEventListener('click', () => {
    renderPrintReport();
    printWithTitle(`Отчет продаж ${els.dateFrom.value} - ${els.dateTo.value}`);
  });
}

async function showReport() {
  loginPanel.classList.add('hidden');
  reportPanel.classList.remove('hidden');
  await loadRetailStores();
  await loadReport();
}

async function loadRetailStores() {
  const data = await api('/api/retail-stores');
  const stores = Array.isArray(data.retailStores) ? data.retailStores : [];
  retailStoreSelect.innerHTML = '<option value="">Все филиалы</option>';
  for (const store of stores) {
    const option = document.createElement('option');
    option.value = store.href;
    option.dataset.storeHref = store.storeHref || '';
    option.textContent = store.name;
    retailStoreSelect.append(option);
  }
}

async function loadReport() {
  reportStatus.textContent = 'Загружаю отчет...';
  reportRows.innerHTML = '<div class="empty-state">Загружаю данные из МойСклад...</div>';

  try {
    const params = new URLSearchParams({
      dateFrom: els.dateFrom.value,
      dateTo: els.dateTo.value
    });
    if (retailStoreSelect.value) {
      params.set('retailStoreHref', retailStoreSelect.value);
      const selectedOption = retailStoreSelect.selectedOptions[0];
      if (selectedOption?.dataset.storeHref) {
        params.set('storeHref', selectedOption.dataset.storeHref);
      }
    }
    currentReport = await api(`/api/reports/sales?${params}`);
    renderReport(currentReport);
    reportStatus.textContent = `Период: ${formatDateOnly(els.dateFrom.value)} - ${formatDateOnly(els.dateTo.value)}`;
  } catch (error) {
    reportStatus.textContent = error.message;
    reportRows.innerHTML = `<div class="empty-state error">${escapeHtml(error.message)}</div>`;
  }
}

function renderReport(report) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  renderTotals(report.totals || {});

  if (!rows.length) {
    reportRows.innerHTML = '<div class="empty-state">За этот период документов нет.</div>';
    return;
  }

  reportRows.innerHTML = rows.map(renderDocumentGroup).join('');
  reportRows.querySelectorAll('[data-print-waybill]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => item.id === button.dataset.printWaybill);
      if (!row) {
        return;
      }
      renderPrintWaybill(row);
      printWithTitle(`Товарная накладная ${row.name || ''} ${toInputDate(new Date(row.moment || Date.now()))}`.trim());
    });
  });
}

function renderDocumentGroup(row) {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];

  return `
    <article class="document-card">
      <header class="document-card-head">
        <div>
          <span>Номер</span>
          <strong>${escapeHtml(row.name)}</strong>
        </div>
        <div>
          <span>Время</span>
          <strong>${formatDateTime(row.moment)}</strong>
        </div>
        <div>
          <span>Сумма</span>
          <strong>${formatSom(row.amount)}</strong>
        </div>
        <div>
          <span>Склад</span>
          <strong>${escapeHtml(row.storeName)}</strong>
        </div>
        <div>
          <span>Контрагент</span>
          <strong>${escapeHtml(row.customerName)}</strong>
        </div>
        <div>
          <span>Сотрудник</span>
          <strong>${escapeHtml(row.employeeName || '-')}</strong>
        </div>
        <div>
          <span>Прибыль</span>
          <strong>${formatSom(row.netProfit)}</strong>
        </div>
        <div>
          <span>Тип оплаты</span>
          <strong>${escapeHtml(row.paymentType || '-')}</strong>
        </div>
      </header>

      <div class="document-meta">
        <div><span>Организация:</span> ${escapeHtml(row.organizationName || '-')}</div>
        <div><span>Комментарий:</span> ${escapeHtml(row.comment || '-')}</div>
        <div><span>Оплачено:</span> ${formatSom(row.paid)}</div>
        <div><span>Не оплачено:</span> ${formatSom(row.unpaid)}</div>
      </div>

      <div class="products-table-wrap">
        <table class="products-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Наименование товара</th>
              <th>Цена</th>
              <th>Кол-во</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((product) => `
              <tr>
                <td>${escapeHtml(product.code || '')}</td>
                <td>${escapeHtml(product.name)}</td>
                <td class="num">${formatSom(product.price)}</td>
                <td class="num">${formatQuantity(product.quantity)}</td>
                <td class="num">${formatSom(product.sum)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <footer class="document-actions">
        <button type="button" data-print-waybill="${escapeHtml(row.id)}">Распечатать товарную накладную</button>
      </footer>
    </article>
  `;
}

function renderTotals(totals) {
  els.totalDocuments.textContent = formatNumber(totals.documents || 0);
  els.totalAmount.textContent = formatSom(totals.amount || 0);
  els.totalPaid.textContent = formatSom(totals.paid || 0);
  els.totalUnpaid.textContent = formatSom(totals.unpaid || 0);
  els.totalNetProfit.textContent = formatSom(totals.netProfit || 0);
}

function renderPrintReport() {
  const report = currentReport || { rows: [], totals: {} };
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const totals = report.totals || {};

  printReport.innerHTML = `
    <div class="print-sheet">
      <h1>Отчет продаж</h1>
      <p>Период: ${escapeHtml(formatDateOnly(els.dateFrom.value))} - ${escapeHtml(formatDateOnly(els.dateTo.value))}</p>
      <table>
        <thead>
          <tr class="print-head-main">
            <th>Номер</th>
            <th>Время</th>
            <th>Сумма</th>
            <th>Склад</th>
            <th colspan="2">Организация</th>
            <th colspan="2">Контрагент</th>
            <th>Сотрудник</th>
            <th>Прибыль</th>
            <th colspan="2">Комментарий</th>
          </tr>
          <tr class="print-head-sub">
            <th>Код</th>
            <th colspan="4">Наименование товара</th>
            <th>Цена</th>
            <th>Кол-во</th>
            <th>Сумма</th>
            <th>Тип оплаты</th>
            <th>Оплачено</th>
            <th>Не оплачено</th>
            <th>Документ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderPrintDocumentGroup).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">Итого</td>
            <td>${formatSom(totals.amount || 0)}</td>
            <td colspan="6"></td>
            <td>${formatSom(totals.netProfit || 0)}</td>
            <td>${formatSom(totals.unpaid || 0)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderPrintWaybill(row) {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];

  printReport.innerHTML = `
    <div class="waybill-sheet">
      <h1>Расходная накладная № ${escapeHtml(row.name)} от ${formatDateOnlyTime(row.moment)}</h1>
      <p><strong>Поставщик:</strong> ${escapeHtml(row.organizationName || 'ИП Матаев Женишбек Камилович')}</p>
      <p><strong>Покупатель:</strong> ${escapeHtml(row.customerName || 'Розничный покупатель')}</p>
      <p><strong>Склад:</strong> ${escapeHtml(row.storeName || '-')}</p>
      <p><strong>Сотрудник:</strong> ${escapeHtml(row.employeeName || '-')}</p>

      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Код</th>
            <th>Наименование</th>
            <th>Цена</th>
            <th>Кол-во</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((product, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(product.code || '')}</td>
              <td>${escapeHtml(product.name || '')}</td>
              <td>${formatSom(product.price)}</td>
              <td>${formatQuantity(product.quantity)}</td>
              <td>${formatSom(product.sum)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">Итого</td>
            <td>${formatSom(row.amount)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="waybill-summary">
        <p>Всего наименований ${products.length}, на сумму ${formatSom(row.amount)}</p>
        <p>Тип оплаты: ${escapeHtml(row.paymentType || '-')}</p>
        <p>Оплачено: ${formatSom(row.paid)}${row.unpaid > 0 ? `, не оплачено: ${formatSom(row.unpaid)}` : ''}</p>
      </div>

      <div class="waybill-signatures">
        <div><span>Отпустил</span><b>${escapeHtml(row.employeeName || '')}</b></div>
        <div><span>Получил</span><b></b></div>
      </div>
    </div>
  `;
}

function renderPrintDocumentGroup(row) {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];

  return `
    <tr class="report-document-row">
      <td>${escapeHtml(row.name)}</td>
      <td>${formatDateTime(row.moment)}</td>
      <td>${formatSom(row.amount)}</td>
      <td>${escapeHtml(row.storeName)}</td>
      <td colspan="2">${escapeHtml(row.organizationName)}</td>
      <td colspan="2">${escapeHtml(row.customerName)}</td>
      <td>${escapeHtml(row.employeeName)}</td>
      <td>${formatSom(row.netProfit)}</td>
      <td colspan="2">${escapeHtml(row.comment || row.paymentType || '')}</td>
    </tr>
    ${products.map((product) => `
      <tr class="report-product-row">
        <td>${escapeHtml(product.code)}</td>
        <td colspan="4">${escapeHtml(product.name)}</td>
        <td>${formatSom(product.price)}</td>
        <td>${formatQuantity(product.quantity)}</td>
        <td>${formatSom(product.sum)}</td>
        <td>${escapeHtml(row.paymentType)}</td>
        <td>${formatSom(row.paid)}</td>
        <td>${formatSom(row.unpaid)}</td>
        <td>${escapeHtml(row.typeLabel)}</td>
      </tr>
    `).join('')}
  `;
}

function setPeriod(period, offset = 0) {
  currentPeriod = period;
  periodOffset = offset;
  const today = startOfDay(new Date());
  let start = new Date(today);
  let end = new Date(today);

  if (period === 'yesterday') {
    start.setDate(today.getDate() - 1 + offset);
    end = new Date(start);
  } else if (period === 'today') {
    start.setDate(today.getDate() + offset);
    end = new Date(start);
  } else if (period === 'week') {
    start = startOfWeek(today);
    start.setDate(start.getDate() + offset * 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  }

  els.dateFrom.value = toInputDate(start);
  els.dateTo.value = toInputDate(end);
  updatePeriodLabel();
  updatePeriodButtons();
}

function shiftPeriod(direction) {
  if (currentPeriod === 'custom') {
    currentPeriod = 'today';
    periodOffset = 0;
  }
  setPeriod(currentPeriod, periodOffset + direction);
}

function updatePeriodButtons() {
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.classList.toggle('active', button.dataset.period === currentPeriod);
  });
}

function updatePeriodLabel() {
  const from = parseInputDate(els.dateFrom.value);
  const to = parseInputDate(els.dateTo.value);
  if (!from || !to) {
    els.periodLabel.textContent = '';
    return;
  }

  if (currentPeriod === 'yesterday' && periodOffset === 0) {
    els.periodLabel.textContent = `Вчера, ${formatHumanDate(from)}`;
    return;
  }
  if (currentPeriod === 'today' && periodOffset === 0) {
    els.periodLabel.textContent = `Сегодня, ${formatHumanDate(from)}`;
    return;
  }
  if (sameDay(from, to)) {
    els.periodLabel.textContent = formatHumanDate(from);
    return;
  }
  els.periodLabel.textContent = `${formatHumanDate(from)} - ${formatHumanDate(to)}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

function toInputDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseInputDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const result = startOfDay(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatHumanDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(value);
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDateOnlyTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatQuantity(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3
  }).format(Number(value || 0));
}

function formatSom(value) {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))} сом`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function printWithTitle(title) {
  const oldTitle = document.title;
  document.title = sanitizeFileName(title);
  window.print();
  window.setTimeout(() => {
    document.title = oldTitle;
  }, 1000);
}

function sanitizeFileName(value) {
  return String(value || 'Отчет')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
