import { initCrmShell } from './crm-shell.js';

const els = Object.fromEntries([
  'auditPanel', 'searchInput',
  'actionFilter', 'userFilter', 'refreshButton', 'auditStatus', 'auditRows', 'totalCount',
  'salesCount', 'returnsCount', 'pricesCount'
].map((id) => [id, document.querySelector(`#${id}`)]));

const actionLabels = {
  login: 'Вход',
  logout: 'Выход',
  'sale.create': 'Создание продажи',
  return: 'Возврат',
  'prices.update': 'Изменение цен'
};

const roleLabels = {
  admin: 'Администратор',
  owner: 'Владелец',
  accountant: 'Бухгалтер',
  employee: 'Сотрудник'
};

let rows = [];

init();

async function init() {
  bindEvents();
  const user = await initCrmShell({ page: 'audit', allowedRoles: ['admin', 'owner'] });
  if (user) await showAudit();
}

function bindEvents() {
  els.refreshButton.addEventListener('click', loadAudit);
  els.searchInput.addEventListener('input', render);
  els.actionFilter.addEventListener('change', render);
  els.userFilter.addEventListener('change', render);
}

async function showAudit() {
  els.auditPanel.classList.remove('hidden');
  await loadAudit();
}

async function loadAudit() {
  els.auditStatus.textContent = 'Загружаю журнал...';
  els.refreshButton.disabled = true;
  try {
    const data = await api('/api/audit?limit=500');
    rows = Array.isArray(data.rows) ? data.rows : [];
    fillUsers();
    render();
    els.auditStatus.textContent = `Обновлено: ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())}`;
  } catch (error) {
    els.auditStatus.textContent = error.message;
    els.auditRows.innerHTML = `<tr class="empty-row"><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  } finally {
    els.refreshButton.disabled = false;
  }
}

function fillUsers() {
  const selected = els.userFilter.value;
  const users = [...new Set(rows.map(getUserName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  els.userFilter.innerHTML = '<option value="">Все пользователи</option>' + users.map((user) =>
    `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`
  ).join('');
  if (users.includes(selected)) els.userFilter.value = selected;
}

function render() {
  const query = normalize(els.searchInput.value);
  const action = els.actionFilter.value;
  const user = els.userFilter.value;
  const filtered = rows.filter((row) => {
    const rowUser = getUserName(row);
    const haystack = normalize([rowUser, row.action, row.description, row.entity, row.entityId].join(' '));
    return (!query || haystack.includes(query)) && (!action || row.action === action) && (!user || rowUser === user);
  });

  els.totalCount.textContent = rows.length;
  els.salesCount.textContent = rows.filter((row) => row.action === 'sale.create').length;
  els.returnsCount.textContent = rows.filter((row) => row.action === 'return').length;
  els.pricesCount.textContent = rows.filter((row) => row.action === 'prices.update').length;

  if (!filtered.length) {
    els.auditRows.innerHTML = '<tr class="empty-row"><td colspan="6">По выбранным фильтрам записей нет.</td></tr>';
    return;
  }

  els.auditRows.innerHTML = filtered.map((row) => {
    const userName = getUserName(row) || 'Система';
    const actionClass = row.action === 'return' ? 'return' : row.action === 'prices.update' ? 'prices' : '';
    const entity = [row.entity, row.entityId].filter(Boolean).join(' / ') || '—';
    return `<tr>
      <td>${escapeHtml(formatDate(row.createdAt))}</td>
      <td><strong>${escapeHtml(userName)}</strong></td>
      <td>${escapeHtml(roleLabels[row.role] || row.role || '—')}</td>
      <td><span class="action-badge ${actionClass}">${escapeHtml(actionLabels[row.action] || row.action || 'Действие')}</span></td>
      <td>${escapeHtml(row.description || '—')}</td>
      <td>${escapeHtml(entity)}</td>
    </tr>`;
  }).join('');
}

function getUserName(row) {
  return row.userName || row.userLogin || '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса.');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
