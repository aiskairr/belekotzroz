import { initCrmShell } from './crm-shell.js';

const els = Object.fromEntries([
  'payrollPanel', 'filtersForm', 'dateFrom', 'dateTo', 'saveButton', 'printButton', 'addToExpensesButton', 'searchInput',
  'payrollRows', 'status', 'totalEmployees', 'totalRevenue', 'totalFixed', 'totalCommission', 'totalSalary',
  'salesModal', 'salesModalTitle', 'salesModalMeta', 'salesModalBody', 'closeSalesModal'
].map((id) => [id, document.querySelector(`#${id}`)]));

const positionLabels = {
  manager: 'Менеджер', seller: 'Продавец', courier: 'Курьер', cashier: 'Кассир', warehouse: 'Склад', other: 'Другая'
};
const schemeLabels = {
  salary: 'Только оклад',
  percent: 'Только процент',
  salary_percent: 'Оклад + процент',
  category_bonus: 'Бонус по категории',
  salary_category_bonus: 'Оклад + бонус категории'
};
let report = { rows: [], totals: {} };
let saving = false;

init();

async function init() {
  setCurrentMonth();
  bindEvents();
  const user = await initCrmShell({ page: 'payroll', allowedRoles: ['admin', 'owner'] });
  if (!user) return;
  els.payrollPanel.classList.remove('hidden');
  await loadPayroll();
}

function bindEvents() {
  els.filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadPayroll();
  });
  document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', async () => {
    setMonth(button.dataset.period === 'previous-month' ? -1 : 0);
    await loadPayroll();
  }));
  els.searchInput.addEventListener('input', renderRows);
  els.payrollRows.addEventListener('change', handleRowChange);
  els.payrollRows.addEventListener('input', handleRowInput);
  els.payrollRows.addEventListener('click', handlePayrollClick);
  els.saveButton.addEventListener('click', saveConfigs);
  els.addToExpensesButton.addEventListener('click', addPayrollToExpenses);
  els.printButton.addEventListener('click', () => window.print());
  els.closeSalesModal.addEventListener('click', closeSalesModal);
  els.salesModal.addEventListener('click', (event) => { if (event.target === els.salesModal) closeSalesModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSalesModal(); });
}

async function loadPayroll() {
  els.status.textContent = 'Загружаю продажи и сотрудников...';
  els.payrollRows.innerHTML = '<tr><td colspan="12">Загрузка данных из МойСклад...</td></tr>';
  try {
    report = await api(`/api/payroll?dateFrom=${encodeURIComponent(els.dateFrom.value)}&dateTo=${encodeURIComponent(els.dateTo.value)}`);
    render();
    const unassigned = Number(report.totals?.unassignedDocuments || 0);
    els.status.textContent = unassigned
      ? `Период: ${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)}. Без сотрудника: ${unassigned} продаж на ${formatMoney(report.totals.unassignedRevenue)}.`
      : `Период: ${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)}`;
  } catch (error) {
    els.status.textContent = error.message;
    els.payrollRows.innerHTML = `<tr><td colspan="12" class="error">${escapeHtml(error.message)}</td></tr>`;
  }
}

function render() {
  renderSummary();
  renderRows();
}

function renderSummary() {
  const totals = report.totals || {};
  els.totalEmployees.textContent = formatNumber(totals.employees || 0);
  els.totalRevenue.textContent = formatMoney(totals.revenue);
  els.totalFixed.textContent = formatMoney(totals.fixedSalary);
  els.totalCommission.textContent = formatMoney(totals.commission);
  els.totalSalary.textContent = formatMoney(totals.totalSalary);
}

function renderRows() {
  const query = normalize(els.searchInput.value);
  const rows = (report.rows || []).filter((row) => {
    const position = getPayrollPositionLabel(row.payroll);
    return !query || normalize(`${row.name} ${position}`).includes(query);
  });
  els.payrollRows.innerHTML = rows.map(renderRow).join('') || '<tr><td colspan="12">Сотрудники не найдены.</td></tr>';
  rows.forEach(updateRowAvailability);
}

function renderRow(row) {
  const config = row.payroll;
  const position = getPayrollPositionLabel(config);
  return `<tr data-employee="${escapeHtml(row.id)}" data-href="${escapeHtml(row.href)}">
    <td><label class="employee-cell"><input data-field="enabled" type="checkbox" ${config.enabled ? 'checked' : ''}><span><strong>${escapeHtml(row.name)}</strong><small>${config.enabled ? 'Участвует в расчёте' : 'Расчёт выключен'}</small></span></label></td>
    <td><div class="readonly-payroll-field">${escapeHtml(position || 'Не указана')}</div><input type="hidden" data-field="position" value="other"><input type="hidden" data-field="customPosition" value="${escapeHtml(position)}"></td>
    <td><select data-field="scheme">${options(schemeLabels, config.scheme)}</select></td>
    <td><input data-field="monthlySalary" class="readonly-input" type="number" min="0" step="100" value="${numberValue(config.monthlySalary)}" readonly title="Оклад подтягивается из раздела Сотрудники и доступ"></td>
    <td><div class="percent-input"><input data-field="percent" type="number" min="0" max="100" step="0.1" value="${numberValue(config.percent)}"><span>%</span></div></td>
    <td><select data-field="percentBase"><option value="revenue" ${config.percentBase === 'revenue' ? 'selected' : ''}>Выручка</option><option value="profit" ${config.percentBase === 'profit' ? 'selected' : ''}>Прибыль</option></select></td>
    <td class="number"><button class="sales-detail-button" data-sales-employee="${escapeHtml(row.id)}" type="button">${formatNumber(row.documents)} · Детали</button></td>
    <td class="number">${formatMoney(row.revenue)}</td>
    <td class="number">${formatMoney(row.profit)}</td>
    <td class="number fixed-result">${formatMoney(row.fixedSalary)}</td>
    <td class="number commission-result">${formatMoney(row.commission)}</td>
    <td class="number total-result"><strong>${formatMoney(row.totalSalary)}</strong></td>
  </tr>`;
}

function handlePayrollClick(event) {
  const button = event.target.closest('[data-sales-employee]');
  if (!button) return;
  const row = getRowById(button.dataset.salesEmployee);
  if (row) openSalesModal(row);
}

function openSalesModal(employee) {
  const sales = employee.sales || [];
  els.salesModalTitle.textContent = employee.name;
  els.salesModalMeta.textContent = `${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)} · ${sales.length} документов · ${formatMoney(employee.revenue)}`;
  els.salesModalBody.innerHTML = sales.length ? sales.map(renderSaleDocument).join('') : '<div class="sales-empty">У сотрудника нет продаж за выбранный период.</div>';
  els.salesModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function renderSaleDocument(sale) {
  const products = sale.products || [];
  return `<article class="sale-document">
    <div class="sale-document-head">
      <div><span>${escapeHtml(sale.typeLabel || 'Документ')} № ${escapeHtml(sale.name || '')}</span><strong>${formatDateTime(sale.moment)}</strong></div>
      <div><span>${escapeHtml(sale.customerName || 'Розничный покупатель')} · сумма ${formatMoney(sale.amount)}</span><strong class="${Number(sale.netProfit || 0) < 0 ? 'negative-profit' : ''}">Прибыль: ${formatMoney(sale.netProfit)}</strong></div>
      ${sale.webUrl ? `<a href="${escapeHtml(sale.webUrl)}" target="_blank" rel="noopener noreferrer">Открыть в МойСклад</a>` : ''}
    </div>
    <div class="sale-products">
      ${products.map((product) => `<div><span><b>${escapeHtml(product.code || '-')}</b>${escapeHtml(product.name || 'Товар')}</span><span>${formatQuantity(product.quantity)} шт</span><span>${formatMoney(product.price)}</span><strong>${formatMoney(product.sum)}</strong></div>`).join('') || '<p>Позиции не найдены.</p>'}
    </div>
  </article>`;
}

function closeSalesModal() {
  els.salesModal?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function options(items, selected) {
  return Object.entries(items).map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function getPayrollPositionLabel(config = {}) {
  return config.position === 'other'
    ? config.customPosition
    : positionLabels[config.position] || config.customPosition || '';
}

function handleRowChange(event) {
  const rowElement = event.target.closest('[data-employee]');
  if (!rowElement) return;
  syncRow(rowElement);
  updateRowAvailability(getRowById(rowElement.dataset.employee));
  recalculateClientSide();
}

function handleRowInput(event) {
  const rowElement = event.target.closest('[data-employee]');
  if (!rowElement) return;
  syncRow(rowElement);
  recalculateClientSide();
}

function syncRow(rowElement) {
  const row = getRowById(rowElement.dataset.employee);
  if (!row) return;
  row.payroll = readConfig(rowElement);
  rowElement.classList.add('dirty');
  const custom = rowElement.querySelector('[data-field="customPosition"]');
  custom?.classList.toggle('hidden', row.payroll.position !== 'other');
}

function readConfig(rowElement) {
  const field = (name) => rowElement.querySelector(`[data-field="${name}"]`);
  return {
    enabled: field('enabled').checked,
    position: field('position').value,
    customPosition: field('customPosition').value.trim(),
    scheme: field('scheme').value,
    monthlySalary: Number(field('monthlySalary').value || 0),
    percent: Number(field('percent').value || 0),
    percentBase: field('percentBase').value
  };
}

function updateRowAvailability(row) {
  if (!row) return;
  const element = document.querySelector(`[data-employee="${CSS.escape(row.id)}"]`);
  if (!element) return;
  const config = row.payroll;
  const salaryEnabled = config.enabled && ['salary', 'salary_percent', 'salary_category_bonus'].includes(config.scheme);
  const percentEnabled = config.enabled && ['percent', 'salary_percent'].includes(config.scheme);
  element.querySelector('[data-field="monthlySalary"]').disabled = !salaryEnabled;
  element.querySelector('[data-field="monthlySalary"]').readOnly = true;
  element.querySelector('[data-field="percent"]').disabled = !percentEnabled;
  element.querySelector('[data-field="percentBase"]').disabled = !percentEnabled;
  element.classList.toggle('disabled-row', !config.enabled);
}

function recalculateClientSide() {
  let totals = { employees: 0, revenue: 0, fixedSalary: 0, commission: 0, totalSalary: 0 };
  for (const row of report.rows || []) {
    const config = row.payroll;
    const fixed = config.enabled && ['salary', 'salary_percent', 'salary_category_bonus'].includes(config.scheme)
      ? prorateSalary(config.monthlySalary, els.dateFrom.value, els.dateTo.value)
      : 0;
    const source = config.percentBase === 'profit' ? Math.max(0, row.profit) : Math.max(0, row.revenue);
    const categoryEnabled = config.enabled && ['category_bonus', 'salary_category_bonus'].includes(config.scheme);
    const commission = categoryEnabled
      ? roundMoney(row.categoryBonus || 0)
      : config.enabled && ['percent', 'salary_percent'].includes(config.scheme)
        ? roundMoney(source * config.percent / 100)
        : 0;
    row.fixedSalary = fixed;
    row.commission = commission;
    row.totalSalary = roundMoney(fixed + commission);
    if (config.enabled) totals.employees += 1;
    totals.revenue += row.revenue;
    totals.fixedSalary += fixed;
    totals.commission += commission;
    totals.totalSalary += row.totalSalary;
    const element = document.querySelector(`[data-employee="${CSS.escape(row.id)}"]`);
    if (element) {
      element.querySelector('.fixed-result').textContent = formatMoney(fixed);
      element.querySelector('.commission-result').textContent = formatMoney(commission);
      element.querySelector('.total-result').innerHTML = `<strong>${formatMoney(row.totalSalary)}</strong>`;
    }
  }
  report.totals = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundMoney(value)]));
  renderSummary();
}

async function saveConfigs() {
  if (saving) return;
  document.querySelectorAll('[data-employee]').forEach(syncRow);
  const employees = (report.rows || []).map((row) => ({ employeeHref: row.href, payroll: row.payroll }));
  if (!employees.length) return;
  saving = true;
  els.saveButton.disabled = true;
  els.status.textContent = 'Сохраняю настройки сотрудников в МойСклад...';
  try {
    await api('/api/payroll/employees/config', { method: 'POST', body: { employees } });
    document.querySelectorAll('.dirty').forEach((row) => row.classList.remove('dirty'));
    els.status.textContent = `Настройки сохранены: ${employees.length} сотрудников.`;
    await loadPayroll();
  } catch (error) {
    els.status.textContent = error.message;
  } finally {
    saving = false;
    els.saveButton.disabled = false;
  }
}

async function addPayrollToExpenses() {
  const amount = roundMoney(report.totals?.totalSalary || 0);
  if (amount <= 0) {
    els.status.textContent = 'Сначала рассчитайте зарплату: сумма к выплате равна нулю.';
    return;
  }

  const period = `${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)}`;
  if (!window.confirm(`Добавить зарплату ${formatMoney(amount)} за период ${period} в расходы?`)) return;

  els.addToExpensesButton.disabled = true;
  els.status.textContent = 'Добавляю зарплату в расходы...';
  try {
    await api('/api/expenses', {
      method: 'POST',
      body: {
        expenseDate: els.dateTo.value,
        category: 'fixed',
        subcategory: 'Зарплата сотрудников',
        amount,
        branchName: '',
        paymentMethod: '',
        description: `Зарплата за период ${period}. Сотрудников в расчете: ${Number(report.totals?.employees || 0)}.`
      }
    });
    els.status.textContent = `Зарплата ${formatMoney(amount)} добавлена в расходы.`;
  } catch (error) {
    els.status.textContent = error.message;
  } finally {
    els.addToExpensesButton.disabled = false;
  }
}

function setCurrentMonth() { setMonth(0); }
function setMonth(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  els.dateFrom.value = localDate(start);
  els.dateTo.value = localDate(end);
}

function prorateSalary(monthlySalary, from, to) {
  const salary = Number(monthlySalary || 0);
  let current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let result = 0;
  while (current <= end) {
    const days = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
    result += salary / days;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return roundMoney(result);
}

function getRowById(id) { return (report.rows || []).find((row) => row.id === id); }
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function normalize(value) { return String(value || '').trim().toLocaleLowerCase('ru-RU'); }
function numberValue(value) { return Number(value || 0).toFixed(2).replace(/\.00$/, ''); }
function roundMoney(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(Number(value || 0)); }
function formatMoney(value) { return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`; }
function formatDate(value) { return new Intl.DateTimeFormat('ru-RU').format(new Date(`${value}T00:00:00`)); }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value.replace(' ', 'T'))) : '-'; }
function formatQuantity(value) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details?.errors?.[0]?.error || data.error || 'Ошибка запроса');
  return data;
}
