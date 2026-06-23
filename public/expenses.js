import { initCrmShell } from './crm-shell.js';

const categories = {
  fixed: { label: 'Постоянные', hint: 'Регулярные платежи: аренда, зарплата, интернет, охрана, бухгалтерия.', examples: ['Аренда', 'Зарплата', 'Интернет', 'Охрана', 'Бухгалтерия'] },
  variable: { label: 'Переменные', hint: 'Зависят от объема продаж: закуп товара, доставка, упаковка, бонусы продавцам.', examples: ['Закуп товара', 'Доставка', 'Упаковка', 'Бонусы продавцам', 'Комиссия маркетплейса'] },
  one_time: { label: 'Разовые', hint: 'Единоразовые вложения: ремонт, вывеска, мебель, техника или открытие точки.', examples: ['Ремонт', 'Вывеска', 'Мебель', 'Техника', 'Касса', 'Открытие точки'] },
  operational: { label: 'Операционные', hint: 'Ежедневная работа: топливо, расходники, грузчики и обслуживание склада.', examples: ['Топливо', 'Канцелярия', 'Грузчики', 'Расходники', 'Обслуживание склада'] },
  marketing: { label: 'Маркетинг', hint: 'Привлечение клиентов: реклама, таргет, баннеры, розыгрыши и контент.', examples: ['Instagram', 'Таргет', 'Баннеры', 'Розыгрыши', 'Фото и видео'] },
  taxes: { label: 'Налоги', hint: 'Налоги и обязательные платежи: соцфонд, патент, таможня и утильсбор.', examples: ['Налоги', 'Соцфонд', 'Патент и отчеты', 'Таможня', 'Утильсбор'] },
  financial: { label: 'Финансовые', hint: 'Расходы на деньги: комиссии банков, эквайринг, проценты и курсовые потери.', examples: ['Комиссия банка', 'Эквайринг', 'Проценты', 'Потери на курсе валют'] }
};

const ids = ['expensesApp', 'expenseEditor', 'expenseForm', 'expenseId', 'expenseDate', 'category', 'subcategory', 'subcategoryOptions', 'amount', 'branchName', 'paymentMethod', 'description', 'saveExpenseButton', 'cancelEditButton', 'editorTitle', 'categoryHint', 'filtersForm', 'dateFrom', 'dateTo', 'categoryFilter', 'searchInput', 'currentMonthButton', 'totalAmount', 'expenseCount', 'categorySummary', 'expenseRows', 'status', 'printButton', 'newExpenseButton', 'toast'];
const els = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
let expenses = [];

init();

async function init() {
  const user = await initCrmShell({ page: 'expenses', allowedRoles: ['admin', 'owner', 'accountant'] });
  if (!user) return;
  els.expensesApp.classList.remove('hidden');
  renderCategoryOptions();
  setCurrentMonth();
  resetEditor();
  bindEvents();
  await loadExpenses();
}

function bindEvents() {
  els.category.addEventListener('change', renderCategoryHelp);
  els.expenseForm.addEventListener('submit', saveExpense);
  els.cancelEditButton.addEventListener('click', resetEditor);
  els.newExpenseButton.addEventListener('click', () => { resetEditor(); els.expenseEditor.scrollIntoView({ behavior: 'smooth' }); });
  els.filtersForm.addEventListener('submit', (event) => { event.preventDefault(); loadExpenses(); });
  els.currentMonthButton.addEventListener('click', async () => { setCurrentMonth(); await loadExpenses(); });
  els.searchInput.addEventListener('input', render);
  els.expenseRows.addEventListener('click', handleTableAction);
  els.printButton.addEventListener('click', () => window.print());
}

function renderCategoryOptions() {
  const options = Object.entries(categories).map(([value, item]) => `<option value="${value}">${item.label}</option>`).join('');
  els.category.innerHTML = options;
  els.categoryFilter.insertAdjacentHTML('beforeend', options);
  renderCategoryHelp();
}

function renderCategoryHelp() {
  const item = categories[els.category.value];
  els.categoryHint.textContent = item?.hint || '';
  els.subcategoryOptions.innerHTML = (item?.examples || []).map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
}

async function loadExpenses() {
  els.status.textContent = 'Загружаю расходы...';
  const params = new URLSearchParams({ dateFrom: els.dateFrom.value, dateTo: els.dateTo.value });
  if (els.categoryFilter.value) params.set('category', els.categoryFilter.value);
  try {
    const data = await api(`/api/expenses?${params}`);
    expenses = data.expenses || [];
    render();
    els.status.textContent = `${formatDate(els.dateFrom.value)} - ${formatDate(els.dateTo.value)} · ${expenses.length} записей`;
  } catch (error) {
    expenses = [];
    render();
    els.status.textContent = error.message;
    showToast(error.message, true);
  }
}

function render() {
  const query = normalize(els.searchInput.value);
  const rows = expenses.filter((item) => !query || normalize(`${item.subcategory} ${item.description} ${item.branch_name} ${item.payment_method}`).includes(query));
  const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  els.totalAmount.textContent = formatMoney(total);
  els.expenseCount.textContent = `${rows.length} ${plural(rows.length, 'запись', 'записи', 'записей')}`;
  els.categorySummary.innerHTML = Object.entries(categories).map(([key, item]) => {
    const value = rows.filter((row) => row.category === key).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `<article><span>${item.label}</span><strong>${formatMoney(value)}</strong></article>`;
  }).join('');
  els.expenseRows.innerHTML = rows.map(renderRow).join('') || '<tr><td colspan="9" class="empty">За выбранный период расходов нет.</td></tr>';
}

function renderRow(item) {
  return `<tr>
    <td>${formatDate(item.expense_date)}</td>
    <td><span class="category-badge category-${escapeHtml(item.category)}">${escapeHtml(categories[item.category]?.label || item.category)}</span></td>
    <td><strong>${escapeHtml(item.subcategory)}</strong></td>
    <td>${escapeHtml(item.branch_name || 'Общий')}</td>
    <td>${escapeHtml(item.payment_method || '-')}</td>
    <td class="description-cell">${escapeHtml(item.description || '-')}</td>
    <td>${escapeHtml(item.created_by || '-')}</td>
    <td class="number"><strong>${formatMoney(item.amount)}</strong></td>
    <td><div class="row-actions"><button data-action="edit" data-id="${item.id}" type="button" title="Редактировать">Изменить</button><button class="danger" data-action="delete" data-id="${item.id}" type="button" title="Удалить">Удалить</button></div></td>
  </tr>`;
}

async function saveExpense(event) {
  event.preventDefault();
  const id = els.expenseId.value;
  const body = {
    expenseDate: els.expenseDate.value,
    category: els.category.value,
    subcategory: els.subcategory.value,
    amount: els.amount.value,
    branchName: els.branchName.value,
    paymentMethod: els.paymentMethod.value,
    description: els.description.value
  };
  els.saveExpenseButton.disabled = true;
  try {
    await api(id ? `/api/expenses/${id}` : '/api/expenses', { method: id ? 'PUT' : 'POST', body });
    showToast(id ? 'Расход обновлен' : 'Расход сохранен');
    resetEditor();
    await loadExpenses();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    els.saveExpenseButton.disabled = false;
  }
}

async function handleTableAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = expenses.find((row) => row.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'edit') {
    els.expenseId.value = item.id;
    els.expenseDate.value = item.expense_date;
    els.category.value = item.category;
    els.subcategory.value = item.subcategory;
    els.amount.value = item.amount;
    els.branchName.value = item.branch_name || '';
    els.paymentMethod.value = item.payment_method || '';
    els.description.value = item.description || '';
    els.editorTitle.textContent = 'Редактировать расход';
    els.saveExpenseButton.textContent = 'Сохранить изменения';
    els.cancelEditButton.classList.remove('hidden');
    renderCategoryHelp();
    els.expenseEditor.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!window.confirm(`Удалить расход «${item.subcategory}» на ${formatMoney(item.amount)}?`)) return;
  try {
    await api(`/api/expenses/${item.id}`, { method: 'DELETE' });
    showToast('Расход удален');
    await loadExpenses();
  } catch (error) {
    showToast(error.message, true);
  }
}

function resetEditor() {
  els.expenseForm.reset();
  els.expenseId.value = '';
  els.expenseDate.value = today();
  els.editorTitle.textContent = 'Добавить расход';
  els.saveExpenseButton.textContent = 'Сохранить расход';
  els.cancelEditButton.classList.add('hidden');
  renderCategoryHelp();
}

function setCurrentMonth() {
  const date = new Date();
  els.dateFrom.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  els.dateTo.value = today();
}

async function api(url, options = {}) {
  const response = await fetch(url, { method: options.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.className = `toast${error ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 3500);
}

function today() { return new Date().toLocaleDateString('en-CA'); }
function normalize(value) { return String(value || '').trim().toLowerCase(); }
function formatMoney(value) { return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`; }
function formatDate(value) { if (!value) return '-'; const [y, m, d] = String(value).slice(0, 10).split('-'); return `${d}.${m}.${y}`; }
function plural(value, one, few, many) { const n = Math.abs(value) % 100; const n1 = n % 10; return n > 10 && n < 20 ? many : n1 > 1 && n1 < 5 ? few : n1 === 1 ? one : many; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
