import { initCrmShell } from './crm-shell.js';

const els = {
  panel: document.querySelector('#bankCommissionsPanel'),
  form: document.querySelector('#filtersForm'),
  dateFrom: document.querySelector('#dateFrom'),
  dateTo: document.querySelector('#dateTo'),
  bankFilter: document.querySelector('#bankFilter'),
  paymentTypeFilter: document.querySelector('#paymentTypeFilter'),
  totalCommission: document.querySelector('#totalCommission'),
  totalTurnover: document.querySelector('#totalTurnover'),
  totalNetAmount: document.querySelector('#totalNetAmount'),
  topBank: document.querySelector('#topBank'),
  paymentCount: document.querySelector('#paymentCount'),
  averageRate: document.querySelector('#averageRate'),
  chart: document.querySelector('#chart'),
  chartStatus: document.querySelector('#chartStatus'),
  chartTooltip: document.querySelector('#chartTooltip'),
  tableBody: document.querySelector('#tableBody'),
  tableStatus: document.querySelector('#tableStatus'),
  detailsPanel: document.querySelector('#detailsPanel'),
  detailsStatus: document.querySelector('#detailsStatus'),
  exportExcel: document.querySelector('#exportExcel'),
  exportPdf: document.querySelector('#exportPdf')
};

const state = {
  period: 'month',
  report: null,
  selectedPaymentType: '',
  sort: { key: 'commission', direction: 'desc' }
};

init();

async function init() {
  bindEvents();
  setPeriod('month');
  const user = await initCrmShell({ page: 'bankCommissions', allowedRoles: ['admin', 'owner', 'manager', 'accountant'] });
  if (!user) return;
  els.panel.classList.remove('hidden');
  await loadReport();
}

function bindEvents() {
  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.period = 'custom';
    syncPeriodButtons();
    await loadReport();
  });

  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', async () => {
      setPeriod(button.dataset.period);
      await loadReport();
    });
  });

  els.bankFilter.addEventListener('change', loadReport);
  els.paymentTypeFilter.addEventListener('change', loadReport);

  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { key, direction: key === 'paymentType' ? 'asc' : 'desc' };
      }
      renderTable();
    });
  });
}

function setPeriod(period) {
  state.period = period;
  const { from, to } = getPeriodDates(period);
  els.dateFrom.value = from;
  els.dateTo.value = to;
  syncPeriodButtons();
}

function syncPeriodButtons() {
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.classList.toggle('active', button.dataset.period === state.period);
  });
}

function getPeriodDates(period) {
  const now = new Date();
  const today = toInputDate(now);
  if (period === 'today') return { from: today, to: today };
  if (period === 'yesterday') {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    const value = toInputDate(date);
    return { from: value, to: value };
  }
  if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: toInputDate(from), to: today };
  }
  if (period === '2weeks') {
    const from = new Date(now);
    from.setDate(from.getDate() - 13);
    return { from: toInputDate(from), to: today };
  }
  if (period === 'year') {
    const from = new Date(now);
    from.setFullYear(from.getFullYear(), 0, 1);
    return { from: toInputDate(from), to: today };
  }
  if (period === 'all') {
    return { from: '2020-01-01', to: today };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toInputDate(from), to: today };
}

async function loadReport() {
  els.chartStatus.textContent = 'Загружаю аналитику...';
  els.tableStatus.textContent = 'Загружаю аналитику...';
  els.detailsStatus.textContent = 'Загружаю аналитику...';
  els.chart.innerHTML = '<div class="empty-state">Загружаю данные...</div>';
  els.tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Загружаю данные...</td></tr>';
  els.detailsPanel.innerHTML = '<div class="empty-state">Загружаю данные...</div>';

  try {
    const params = new URLSearchParams({
      dateFrom: els.dateFrom.value,
      dateTo: els.dateTo.value
    });
    if (els.bankFilter.value) params.set('bank', els.bankFilter.value);
    if (els.paymentTypeFilter.value) params.set('paymentType', els.paymentTypeFilter.value);
    const data = await api(`/api/reports/bank-commissions?${params}`);
    state.report = data;
    if (state.selectedPaymentType && !data.rows.some((row) => row.paymentType === state.selectedPaymentType)) {
      state.selectedPaymentType = data.rows[0]?.paymentType || '';
    } else if (!state.selectedPaymentType) {
      state.selectedPaymentType = data.rows[0]?.paymentType || '';
    }
    syncFilters();
    syncExportLinks();
    renderSummary();
    renderChart();
    renderTable();
    renderDetails();
    els.chartStatus.textContent = `Период: ${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)}`;
    els.tableStatus.textContent = `Найдено типов оплат: ${formatNumber(data.rows.length)}`;
    els.detailsStatus.textContent = state.selectedPaymentType ? `Детализация по: ${state.selectedPaymentType}` : 'Нет данных за выбранный период.';
  } catch (error) {
    els.chartStatus.textContent = error.message;
    els.tableStatus.textContent = error.message;
    els.detailsStatus.textContent = error.message;
    els.chart.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    els.tableBody.innerHTML = `<tr><td colspan="7" class="empty-cell">${escapeHtml(error.message)}</td></tr>`;
    els.detailsPanel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function syncFilters() {
  const currentBank = els.bankFilter.value;
  const currentType = els.paymentTypeFilter.value;
  els.bankFilter.innerHTML = '<option value="">Все банки</option>' + (state.report?.bankOptions || []).map((bank) =>
    `<option value="${escapeHtml(bank)}">${escapeHtml(bank)}</option>`
  ).join('');
  els.paymentTypeFilter.innerHTML = '<option value="">Все типы</option>' + (state.report?.paymentTypeOptions || []).map((type) =>
    `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
  ).join('');
  if ((state.report?.bankOptions || []).includes(currentBank)) els.bankFilter.value = currentBank;
  if ((state.report?.paymentTypeOptions || []).includes(currentType)) els.paymentTypeFilter.value = currentType;
}

function syncExportLinks() {
  const params = new URLSearchParams({
    dateFrom: els.dateFrom.value,
    dateTo: els.dateTo.value
  });
  if (els.bankFilter.value) params.set('bank', els.bankFilter.value);
  if (els.paymentTypeFilter.value) params.set('paymentType', els.paymentTypeFilter.value);
  els.exportExcel.href = `/api/reports/bank-commissions/export.xls?${params}`;
  els.exportPdf.href = `/api/reports/bank-commissions/export.pdf?${params}`;
}

function renderSummary() {
  const totals = state.report?.totals || {};
  els.totalCommission.textContent = `${formatMoney(totals.commission || 0)} сом`;
  els.totalTurnover.textContent = `${formatMoney(totals.turnover || 0)} сом`;
  els.totalNetAmount.textContent = `${formatMoney(totals.netAmount || 0)} сом`;
  els.topBank.textContent = totals.topCommissionBank?.paymentType || '—';
  els.paymentCount.textContent = formatNumber(totals.paymentCount || 0);
  els.averageRate.textContent = formatPercent(totals.averageRate || 0);
}

function renderChart() {
  const rows = state.report?.rows || [];
  if (!rows.length) {
    els.chart.innerHTML = '<div class="empty-state">Нет данных для графика.</div>';
    return;
  }

  const maxCommission = Math.max(...rows.map((row) => Number(row.commission || 0)), 1);
  els.chart.innerHTML = rows.map((row) => {
    const height = Math.max(6, Math.round((row.commission / maxCommission) * 100));
    const share = Number(row.shareOfTotalCommission || 0);
    return `
      <button type="button" class="bc-bar ${row.paymentType === state.selectedPaymentType ? 'active' : ''}" data-payment-type="${escapeHtml(row.paymentType)}">
        <div class="bc-bar-rail">
          <div class="bc-bar-fill" style="height:${height}%"></div>
        </div>
        <div class="bc-bar-meta">
          <div class="bc-bar-label">${escapeHtml(row.paymentType)}</div>
          <div class="bc-bar-value">${escapeHtml(formatMoney(row.commission))} сом</div>
          <div class="bc-bar-share">${escapeHtml(formatPercent(share))} от всех комиссий</div>
        </div>
      </button>
    `;
  }).join('');

  els.chart.querySelectorAll('.bc-bar').forEach((button) => {
    const row = rows.find((item) => item.paymentType === button.dataset.paymentType);
    if (!row) return;
    button.addEventListener('click', () => {
      state.selectedPaymentType = row.paymentType;
      renderChart();
      renderTable();
      renderDetails();
    });
    button.addEventListener('mouseenter', (event) => showTooltip(event, row));
    button.addEventListener('mousemove', (event) => showTooltip(event, row));
    button.addEventListener('mouseleave', hideTooltip);
  });
}

function renderTable() {
  const rows = sortRows([...(state.report?.rows || [])]);
  if (!rows.length) {
    els.tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Нет данных за выбранный период.</td></tr>';
    return;
  }
  els.tableBody.innerHTML = rows.map((row) => `
    <tr class="${row.paymentType === state.selectedPaymentType ? 'active' : ''}" data-payment-type="${escapeHtml(row.paymentType)}">
      <td>${escapeHtml(row.paymentType)}</td>
      <td class="num">${escapeHtml(formatMoney(row.turnover))} сом</td>
      <td class="num">${escapeHtml(formatMoney(row.commission))} сом</td>
      <td class="num">${escapeHtml(formatMoney(row.netAmount))} сом</td>
      <td class="num">${escapeHtml(formatNumber(row.paymentCount))}</td>
      <td class="num">${escapeHtml(formatPercent(row.averageRate))}</td>
      <td class="num">${escapeHtml(formatPercent(row.shareOfTotalCommission))}</td>
    </tr>
  `).join('');
  els.tableBody.querySelectorAll('[data-payment-type]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedPaymentType = row.dataset.paymentType;
      renderChart();
      renderTable();
      renderDetails();
    });
  });
}

function renderDetails() {
  const row = (state.report?.rows || []).find((item) => item.paymentType === state.selectedPaymentType);
  if (!row) {
    els.detailsPanel.innerHTML = '<div class="empty-state">Нет платежей по выбранному фильтру.</div>';
    return;
  }
  const payments = Array.isArray(row.payments) ? row.payments : [];
  els.detailsPanel.innerHTML = `
    <section class="bc-detail-header">
      <div class="bc-detail-bank">
        <div class="bc-detail-badge">Банк</div>
        <div>
          <h3>${escapeHtml(row.paymentType)}</h3>
          <p>${escapeHtml(row.bankName || row.paymentType)}</p>
        </div>
      </div>
      <div class="bc-detail-stats">
        <div><span>Комиссия</span><strong>${escapeHtml(formatMoney(row.commission))} сом</strong></div>
        <div><span>Оборот</span><strong>${escapeHtml(formatMoney(row.turnover))} сом</strong></div>
        <div><span>Чистая сумма</span><strong>${escapeHtml(formatMoney(row.netAmount))} сом</strong></div>
        <div><span>Платежей</span><strong>${escapeHtml(formatNumber(row.paymentCount))}</strong></div>
        <div><span>Средний %</span><strong>${escapeHtml(formatPercent(row.averageRate))}</strong></div>
        <div><span>Доля комиссии</span><strong>${escapeHtml(formatPercent(row.shareOfTotalCommission))}</strong></div>
      </div>
    </section>
    ${payments.length ? payments.map((payment) => `
      <article class="bc-payment-item">
        <div class="bc-payment-main">
          <div>
            <span>Продажа / заказ</span>
            <strong>${escapeHtml(payment.saleName || payment.saleId || 'Документ')}</strong>
          </div>
          <div class="bc-payment-meta">
            <p>${escapeHtml(payment.customerName || 'Клиент не указан')}</p>
            <p>${escapeHtml(formatDateTime(payment.moment))}</p>
          </div>
        </div>
        <div class="bc-payment-metrics">
          <div><span>Сумма</span><strong>${escapeHtml(formatMoney(payment.amount))} сом</strong></div>
          <div><span>% комиссии</span><strong>${escapeHtml(formatPercent(payment.rate || 0))}</strong></div>
          <div><span>Комиссия</span><strong>${escapeHtml(formatMoney(payment.commission))} сом</strong></div>
          <div><span>Чистая сумма</span><strong>${escapeHtml(formatMoney(payment.netAmount))} сом</strong></div>
        </div>
      </article>
    `).join('') : '<div class="empty-state">Нет платежей по этому банку.</div>'}
  `;
}

function sortRows(rows) {
  const { key, direction } = state.sort;
  const factor = direction === 'asc' ? 1 : -1;
  return rows.sort((left, right) => {
    if (key === 'paymentType') {
      return left.paymentType.localeCompare(right.paymentType, 'ru') * factor;
    }
    return ((Number(left[key] || 0) - Number(right[key] || 0)) || left.paymentType.localeCompare(right.paymentType, 'ru')) * factor;
  });
}

function showTooltip(event, row) {
  els.chartTooltip.innerHTML = [
    `<strong>${escapeHtml(row.paymentType)}</strong>`,
    `Комиссия: ${escapeHtml(formatMoney(row.commission))} сом`,
    `Продажи: ${escapeHtml(formatMoney(row.turnover))} сом`,
    `Платежей: ${escapeHtml(formatNumber(row.paymentCount))}`,
    `Средний %: ${escapeHtml(formatPercent(row.averageRate))}`,
    `Чистая сумма: ${escapeHtml(formatMoney(row.netAmount))} сом`
  ].join('<br>');
  els.chartTooltip.classList.remove('hidden');
  const rect = els.chart.getBoundingClientRect();
  const x = Math.min(rect.width - 280, Math.max(10, event.clientX - rect.left + 14));
  const y = Math.max(10, event.clientY - rect.top - 10);
  els.chartTooltip.style.left = `${x}px`;
  els.chartTooltip.style.top = `${y}px`;
}

function hideTooltip() {
  els.chartTooltip.classList.add('hidden');
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить отчет.');
  return data;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
