import { initCrmShell } from './crm-shell.js';

const reportPanel = document.querySelector('#reportPanel');
const filtersForm = document.querySelector('#filtersForm');
const reportStatus = document.querySelector('#reportStatus');
const reportRows = document.querySelector('#reportRows');
const retailStoreSelect = document.querySelector('#retailStore');
const printReport = document.querySelector('#printReport');
const documentsTitle = document.querySelector('#documentsTitle');
const salesTabCount = document.querySelector('#salesTabCount');
const demandsTabCount = document.querySelector('#demandsTabCount');
const salesReturnsTabCount = document.querySelector('#salesReturnsTabCount');
const demandReturnsTabCount = document.querySelector('#demandReturnsTabCount');

const REPORT_TYPES = {
  retaildemand: {
    tabTitle: 'Продажи',
    reportTitle: 'Отчет по продажам',
    emptyText: 'продаж'
  },
  demand: {
    tabTitle: 'Отгрузки',
    reportTitle: 'Отчет по отгрузкам',
    emptyText: 'отгрузок'
  },
  retailsalesreturn: {
    tabTitle: 'Возвраты продаж',
    reportTitle: 'Отчет по возвратам продаж',
    emptyText: 'возвратов продаж'
  },
  salesreturn: {
    tabTitle: 'Возвраты отгрузок',
    reportTitle: 'Отчет по возвратам отгрузок',
    emptyText: 'возвратов отгрузок'
  }
};

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
  totalNetProfit: document.querySelector('#totalNetProfit'),
  profitSummaryCard: document.querySelector('#profitSummaryCard')
};

let currentReport = null;
let canViewProfit = false;
let currentDocumentType = 'retaildemand';
let currentPeriod = 'today';
let periodOffset = 0;

init();

async function init() {
  setPeriod('today');
  bindEvents();
  const user = await initCrmShell({ page: 'reports', allowedRoles: ['admin', 'owner', 'manager', 'seller', 'accountant'] });
  if (user) await showReport();
}

function bindEvents() {
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
    printWithTitle(`${getCurrentTypeLabel()} ${els.dateFrom.value} - ${els.dateTo.value}`);
  });

  document.querySelectorAll('[data-report-type]').forEach((button) => {
    button.addEventListener('click', () => {
      currentDocumentType = button.dataset.reportType;
      document.querySelectorAll('[data-report-type]').forEach((item) => item.classList.toggle('active', item === button));
      renderReport(currentReport || { rows: [] });
    });
  });
}

async function showReport() {
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
  canViewProfit = report?.canViewProfit === true;
  document.body.classList.toggle('report-profit-hidden', !canViewProfit);
  els.profitSummaryCard.classList.toggle('hidden', !canViewProfit);
  const allRows = Array.isArray(report?.rows) ? report.rows : [];
  const rows = allRows.filter((row) => row.type === currentDocumentType);
  salesTabCount.textContent = formatNumber(allRows.filter((row) => row.type === 'retaildemand').length);
  demandsTabCount.textContent = formatNumber(allRows.filter((row) => row.type === 'demand').length);
  salesReturnsTabCount.textContent = formatNumber(allRows.filter((row) => row.type === 'retailsalesreturn').length);
  demandReturnsTabCount.textContent = formatNumber(allRows.filter((row) => row.type === 'salesreturn').length);
  documentsTitle.textContent = getCurrentTabTitle();
  renderTotals(calculateVisibleTotals(rows));

  if (!rows.length) {
    reportRows.innerHTML = `<div class="empty-state">За этот период ${getCurrentEmptyText()} нет.</div>`;
    return;
  }

  reportRows.innerHTML = rows.map(renderDocumentGroup).join('');
  reportRows.querySelectorAll('[data-print-receipt]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => item.id === button.dataset.printReceipt);
      if (!row) {
        return;
      }
      renderPrintReceipt(row);
      printWithTitle(`Товарный чек ${row.name || ''} ${toInputDate(new Date(row.moment || Date.now()))}`.trim());
    });
  });
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
  reportRows.querySelectorAll('[data-return-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = rows.find((item) => item.id === button.dataset.documentId);
      if (!row) {
        return;
      }
      const product = row.products?.[Number(button.dataset.productIndex)];
      if (!product) {
        return;
      }
      await createReturn(row, product, button);
    });
  });
}

function renderDocumentGroup(row) {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];
  const returnAllowed = canCreateReturn(row);

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
        ${canViewProfit ? `<div>
          <span>Прибыль</span>
          <strong>${formatSom(row.netProfit)}</strong>
        </div>` : ''}
        <div>
          <span>Тип оплаты</span>
          <strong>${escapeHtml(row.paymentType || '-')}</strong>
        </div>
      </header>

      <div class="document-meta">
        <div><span>Организация:</span> ${escapeHtml(row.organizationName || '-')}</div>
        <div><span>Телефон:</span> ${escapeHtml(row.customerPhone || '-')}</div>
        <div><span>Адрес:</span> ${escapeHtml(row.customerAddress || '-')}</div>
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
              ${returnAllowed ? '<th>Возврат</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${products.map((product) => `
              <tr>
                <td>${escapeHtml(product.code || '')}</td>
                <td>${escapeHtml(product.name)}</td>
                <td class="num">${product.isGift ? '<strong class="gift-label">Подарок</strong>' : formatSom(product.price)}</td>
                <td class="num">${formatQuantity(product.quantity)}</td>
                <td class="num">${formatSom(product.sum)}</td>
                ${returnAllowed ? `<td class="return-cell">
                  <button type="button" data-return-product data-document-id="${escapeHtml(row.id)}" data-product-index="${escapeHtml(String(product.index ?? 0))}">Возврат</button>
                </td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <footer class="document-actions">
        ${row.webUrl ? `<a href="${escapeHtml(row.webUrl)}" target="_blank" rel="noopener">Перейти к документу</a>` : ''}
        ${returnAllowed ? `<button type="button" data-print-receipt="${escapeHtml(row.id)}">Распечатать товарный чек</button>
        <button type="button" data-print-waybill="${escapeHtml(row.id)}">Распечатать товарную накладную</button>` : ''}
      </footer>
    </article>
  `;
}

function canCreateReturn(row) {
  return row?.type === 'retaildemand' || row?.type === 'demand';
}

async function createReturn(row, product, button) {
  const confirmed = window.confirm(`Создать возврат товара "${product.name}" по документу №${row.name}?`);
  if (!confirmed) {
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'Создаю...';

  try {
    const data = await api('/api/reports/returns', {
      method: 'POST',
      body: {
        documentId: row.id,
        documentType: row.type,
        productIndex: product.index,
        quantity: product.quantity
      }
    });

    button.textContent = 'Создано';
    if (data.document?.webUrl) {
      window.open(data.document.webUrl, '_blank', 'noopener');
    }
  } catch (error) {
    alert(error.message);
    button.disabled = false;
    button.textContent = oldText;
  }
}

function renderTotals(totals) {
  els.totalDocuments.textContent = formatNumber(totals.documents || 0);
  els.totalAmount.textContent = formatSom(totals.amount || 0);
  els.totalPaid.textContent = formatSom(totals.paid || 0);
  els.totalUnpaid.textContent = formatSom(totals.unpaid || 0);
  if (canViewProfit) els.totalNetProfit.textContent = formatSom(totals.netProfit || 0);
}

function renderPrintReport() {
  const report = currentReport || { rows: [], totals: {} };
  const rows = (Array.isArray(report.rows) ? report.rows : []).filter((row) => row.type === currentDocumentType);
  const totals = calculateVisibleTotals(rows);
  const paymentTotals = calculatePaymentTotals(rows);

  printReport.className = 'print-report';
  printReport.innerHTML = `
    <div class="print-sheet">
      <h1>${escapeHtml(getCurrentTypeLabel())}</h1>
      <p>Период: ${escapeHtml(formatDateOnly(els.dateFrom.value))} - ${escapeHtml(formatDateOnly(els.dateTo.value))}</p>
      <section class="print-payment-summary">
        <h2>Оплата по банкам и способам</h2>
        <div>
          ${paymentTotals.length
            ? paymentTotals.map((item) => `<p><span>${escapeHtml(item.name)}</span><strong>${formatSom(item.amount)}</strong></p>`).join('')
            : '<p><span>Нет данных об оплате</span><strong>0,00 сом</strong></p>'}
        </div>
      </section>
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
            ${canViewProfit ? '<th>Прибыль</th>' : ''}
            <th colspan="2">Комментарий</th>
          </tr>
          <tr class="print-head-sub">
            <th>Код</th>
            <th colspan="${canViewProfit ? 4 : 3}">Наименование товара</th>
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
            ${canViewProfit ? `<td>${formatSom(totals.netProfit || 0)}</td>` : ''}
            <td>${formatSom(totals.unpaid || 0)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function calculatePaymentTotals(rows) {
  const totals = new Map();
  const add = (name, amount) => {
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    const numericAmount = Number(amount) || 0;
    if (!normalizedName || numericAmount <= 0) return;
    totals.set(normalizedName, (totals.get(normalizedName) || 0) + numericAmount);
  };

  rows.forEach((row) => {
    const breakdown = parsePaymentBreakdown(row.comment);
    if (breakdown.length) {
      breakdown.forEach((item) => add(item.name, item.amount));
      return;
    }
    add(row.paymentType || 'Не указан', row.amount);
  });

  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount);
}

function parsePaymentBreakdown(comment) {
  const result = [];
  const pattern = /(?:^|\n|[.;]\s*)([^:\n.;]{1,60}):\s*([\d\s]+(?:[.,]\d{1,2})?)/gim;
  let match;
  while ((match = pattern.exec(String(comment || ''))) !== null) {
    const name = match[1].trim();
    if (!/(?:налич|qr|банк|bank|mbank|m\+|o!|zero|optima|bakai|payda|рассроч)/i.test(name)) continue;
    if (/тип\s+оплаты/i.test(name)) continue;
    const amount = Number(match[2].replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) result.push({ name, amount });
  }
  return result;
}

function calculateVisibleTotals(rows) {
  return rows.reduce((totals, row) => {
    totals.documents += 1;
    totals.amount += Number(row.amount) || 0;
    totals.paid += Number(row.paid) || 0;
    totals.unpaid += Number(row.unpaid) || 0;
    totals.netProfit += Number(row.netProfit) || 0;
    return totals;
  }, { documents: 0, amount: 0, paid: 0, unpaid: 0, netProfit: 0 });
}

function getCurrentTypeLabel() {
  return REPORT_TYPES[currentDocumentType]?.reportTitle || 'Отчет по документам';
}

function getCurrentTabTitle() {
  return REPORT_TYPES[currentDocumentType]?.tabTitle || 'Документы';
}

function getCurrentEmptyText() {
  return REPORT_TYPES[currentDocumentType]?.emptyText || 'документов';
}

function renderPrintWaybill(row) {
  printReport.className = 'print-report';
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];
  const buyerName = row.customerName || 'Розничный покупатель';
  const buyerPhone = row.customerPhone || '________________';
  const buyerAddress = row.customerAddress || '____________________________';

  printReport.innerHTML = `
    <div class="waybill-sheet">
      <h1>Расходная накладная № ${escapeHtml(row.name)} от ${formatDateOnlyTime(row.moment)}</h1>
      <p><strong>Поставщик:</strong> ${escapeHtml(row.organizationName || 'ИП Матаев Женишбек Камилович')}</p>
      <p><strong>Имя покупателя:</strong> ${escapeHtml(buyerName)}</p>
      <p><strong>Номер телефона:</strong> ${escapeHtml(buyerPhone)}</p>
      <p><strong>Адрес покупателя:</strong> ${escapeHtml(buyerAddress)}</p>
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
              <td>${product.isGift ? 'Подарок' : formatSom(product.price)}</td>
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

function renderPrintReceipt(row) {
  const products = Array.isArray(row.products) && row.products.length
    ? row.products
    : [{ code: '', name: row.productText || 'Товар', quantity: 1, price: row.amount, sum: row.amount }];
  const total = Number(row.amount || 0);
  const paid = Number(row.paid || 0);
  const unpaid = Number(row.unpaid || 0);

  printReport.className = 'print-report receipt-print-report';
  printReport.innerHTML = `
    <div class="receipt-sheet">
      <h1>ТОВАРНЫЙ ЧЕК</h1>
      <div class="receipt-center">${escapeHtml(row.organizationName || 'ИП Матаев Женишбек Камилович')}</div>
      <div class="receipt-line"></div>

      <div class="receipt-row"><span>Документ:</span><b>№ ${escapeHtml(row.name || '')}</b></div>
      <div class="receipt-row"><span>Дата:</span><b>${formatDateTime(row.moment)}</b></div>
      <div class="receipt-row"><span>Склад:</span><b>${escapeHtml(row.storeName || '-')}</b></div>
      <div class="receipt-row"><span>Кассир:</span><b>${escapeHtml(row.employeeName || '-')}</b></div>
      <div class="receipt-row"><span>Покупатель:</span><b>${escapeHtml(row.customerName || 'Розничный покупатель')}</b></div>

      <div class="receipt-line"></div>
      <div class="receipt-items">
        ${products.map((product, index) => `
          <div class="receipt-item">
            <div class="receipt-item-name">${index + 1}. ${escapeHtml(product.name || '')}</div>
            <div class="receipt-item-calc">
              <span>${product.isGift ? 'ПОДАРОК' : `${formatReceiptMoney(product.price || 0)} x ${escapeHtml(formatQuantity(product.quantity || 1))}`}</span>
              <b>${product.isGift ? '0,00' : formatReceiptMoney(product.sum || 0)}</b>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="receipt-line"></div>
      <div class="receipt-total"><span>ИТОГО</span><b>${formatReceiptMoney(total)} сом</b></div>
      <div class="receipt-row"><span>Тип оплаты:</span><b>${escapeHtml(row.paymentType || '-')}</b></div>
      <div class="receipt-row"><span>Оплачено:</span><b>${formatReceiptMoney(paid)} сом</b></div>
      ${unpaid > 0 ? `<div class="receipt-row"><span>Не оплачено:</span><b>${formatReceiptMoney(unpaid)} сом</b></div>` : ''}
      ${row.comment ? `<div class="receipt-comment">${escapeHtml(row.comment)}</div>` : ''}

      <div class="receipt-line"></div>
      <div class="receipt-count">Позиций: ${products.length}</div>
      <div class="receipt-thanks">Спасибо за покупку!</div>
      <div class="receipt-cut"></div>
    </div>
  `;
}

function renderPrintDocumentGroup(row) {
  printReport.className = 'print-report';
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
      ${canViewProfit ? `<td>${formatSom(row.netProfit)}</td>` : ''}
      <td colspan="2">${escapeHtml(row.comment || row.paymentType || '')}</td>
    </tr>
    ${products.map((product) => `
      <tr class="report-product-row">
        <td>${escapeHtml(product.code)}</td>
        <td colspan="${canViewProfit ? 4 : 3}">${escapeHtml(product.name)}</td>
        <td>${product.isGift ? 'Подарок' : formatSom(product.price)}</td>
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
    throw new Error(formatApiError(data));
  }
  return data;
}

function formatApiError(data) {
  const base = data.error || 'Ошибка запроса';
  const errors = data.details?.errors;
  if (Array.isArray(errors) && errors.length) {
    const messages = errors
      .map((error) => error.error || error.message)
      .filter(Boolean);
    if (messages.length) {
      return `${base}\n${messages.join('\n')}`;
    }
  }
  return base;
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

function formatReceiptMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
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
