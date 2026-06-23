import { initCrmShell } from '/crm-shell.js';

const app = document.querySelector('#usersApp');
const list = document.querySelector('#usersList');
const status = document.querySelector('#usersStatus');
const toast = document.querySelector('#usersToast');

const roles = {
  admin: 'Главный администратор',
  owner: 'Владелец',
  manager: 'Менеджер',
  seller: 'Продавец',
  logistics: 'Логистика',
  accountant: 'Бухгалтер',
  employee: 'Сотрудник'
};

const permissions = {
  sales: 'Продажи',
  debtSale: 'Продажа в долг',
  deliveries: 'Доставки',
  reports: 'Отчетность',
  expenses: 'Расходы',
  payroll: 'Зарплаты',
  priceFormula: 'Расчет цен',
  audit: 'Журнал действий',
  users: 'Сотрудники и доступ',
  about: 'О системе'
};

let users = [];

const user = await initCrmShell({ page: 'users', allowedRoles: ['admin', 'owner'] });
if (user) {
  app.classList.remove('hidden');
  document.querySelector('#refreshUsers').addEventListener('click', loadUsers);
  await loadUsers();
}

async function loadUsers() {
  status.textContent = 'Загрузка...';
  try {
    const response = await fetch('/api/crm/users');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить сотрудников.');
    users = data.users || [];
    renderUsers();
    status.textContent = `${users.length} сотрудников`;
  } catch (error) {
    status.textContent = error.message;
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderUsers() {
  list.innerHTML = users.map((entry) => {
    const fullAccess = entry.role === 'admin' || entry.role === 'owner';
    const locked = user.role !== 'admin' && entry.role === 'admin';
    const disabled = locked ? 'disabled' : '';
    return `<article class="user-card" data-user-id="${entry.id}">
      <header>
        <div class="avatar">${initials(entry.name)}</div>
        <div><h3>${escapeHtml(entry.name)}</h3><p>${escapeHtml(entry.position || roles[entry.role] || entry.role)}</p></div>
        <label class="active-toggle"><input type="checkbox" data-field="active" ${entry.active ? 'checked' : ''} ${disabled}><span>Активен</span></label>
      </header>
      ${locked ? '<div class="access-lock">Главный администратор доступен владельцу только для просмотра.</div>' : ''}
      <div class="identity-grid">
        <label><span>Имя</span><input data-field="name" value="${escapeAttr(entry.name)}" ${disabled}></label>
        <label><span>Логин</span><input data-field="login" value="${escapeAttr(entry.login)}" ${disabled}></label>
        <label><span>Должность</span><input data-field="position" value="${escapeAttr(entry.position)}" ${disabled}></label>
        <label><span>Роль</span><select data-field="role" ${disabled}>${Object.entries(roles).filter(([value]) => user.role === 'admin' || value !== 'admin' || value === entry.role).map(([value, label]) => `<option value="${value}" ${value === entry.role ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      </div>
      <div class="access-grid">
        <fieldset><legend>Филиалы</legend>
          <label><input type="checkbox" data-branch="ayu" ${entry.branches.includes('ayu') ? 'checked' : ''} ${disabled}> Аю-Гранд</label>
          <label><input type="checkbox" data-branch="besh" ${entry.branches.includes('besh') ? 'checked' : ''} ${disabled}> Беш-Сары</label>
        </fieldset>
        <fieldset><legend>Разрешенные разделы</legend><div class="permission-grid">
          ${Object.entries(permissions).map(([value, label]) => `<label><input type="checkbox" data-permission="${value}" ${fullAccess || entry.permissions.includes(value) ? 'checked' : ''} ${fullAccess || locked ? 'disabled' : ''}> ${label}</label>`).join('')}
        </div></fieldset>
      </div>
      <footer>
        <label class="password-field"><span>Новый пароль</span><span class="password-input-row"><input type="password" data-field="password" placeholder="${entry.passwordSet ? 'Оставьте пустым, чтобы не менять' : 'Установите минимум 6 символов'}" autocomplete="new-password" ${disabled}><button class="password-icon" type="button" data-toggle-password title="Показать пароль" aria-label="Показать пароль" ${disabled}>Показать</button></span></label>
        <span class="password-state ${entry.passwordSet ? 'ready' : ''}">${entry.passwordSet ? 'Пароль установлен' : 'Вход заблокирован: пароль не задан'}</span>
        <button class="secondary generate-password" type="button" data-generate-password ${disabled}>Создать временный пароль</button>
        <button type="button" data-save ${disabled}>Сохранить</button>
      </footer>
    </article>`;
  }).join('');

  list.querySelectorAll('[data-field="role"]').forEach((select) => select.addEventListener('change', handleRoleChange));
  list.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', togglePassword));
  list.querySelectorAll('[data-generate-password]').forEach((button) => button.addEventListener('click', generatePassword));
  list.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', saveUser));
}

function togglePassword(event) {
  const input = event.currentTarget.closest('.password-input-row').querySelector('input');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Показать' : 'Скрыть';
}

async function generatePassword(event) {
  const card = event.currentTarget.closest('.user-card');
  const input = card.querySelector('[data-field="password"]');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  input.value = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  input.type = 'text';
  card.querySelector('[data-toggle-password]').textContent = 'Скрыть';
  try {
    await navigator.clipboard.writeText(input.value);
    showToast('Временный пароль создан и скопирован. Нажмите «Сохранить».');
  } catch {
    showToast('Временный пароль создан. Нажмите «Сохранить».');
  }
}

function handleRoleChange(event) {
  const card = event.target.closest('.user-card');
  const fullAccess = ['admin', 'owner'].includes(event.target.value);
  card.querySelectorAll('[data-permission]').forEach((checkbox) => {
    checkbox.disabled = fullAccess;
    if (fullAccess) checkbox.checked = true;
  });
}

async function saveUser(event) {
  const card = event.target.closest('.user-card');
  const button = event.currentTarget;
  const field = (name) => card.querySelector(`[data-field="${name}"]`);
  const payload = {
    name: field('name').value,
    login: field('login').value,
    position: field('position').value,
    role: field('role').value,
    active: field('active').checked,
    password: field('password').value,
    branches: [...card.querySelectorAll('[data-branch]:checked')].map((item) => item.dataset.branch),
    permissions: [...card.querySelectorAll('[data-permission]:checked')].map((item) => item.dataset.permission)
  };
  button.disabled = true;
  button.textContent = 'Сохраняю...';
  try {
    const response = await fetch(`/api/crm/users/${card.dataset.userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось сохранить сотрудника.');
    const index = users.findIndex((item) => item.id === data.user.id);
    if (index >= 0) users[index] = data.user;
    renderUsers();
    showToast(`Доступ сотрудника «${data.user.name}» сохранен.`);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
    button.textContent = 'Сохранить';
  }
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  window.setTimeout(() => toast.classList.add('hidden'), 3200);
}

function initials(value) { return String(value || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value) { return escapeHtml(value); }
