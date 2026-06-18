const roleLabels = {
  admin: 'Администратор',
  owner: 'Владелец',
  accountant: 'Бухгалтер',
  employee: 'Сотрудник'
};

const navigation = [
  { id: 'sales', href: '/sales.html', label: 'Продажи', roles: ['admin', 'owner', 'employee'] },
  { id: 'reports', href: '/report.html', label: 'Отчетность', roles: ['admin', 'owner', 'accountant', 'employee'] },
  { id: 'prices', href: '/prices.html', label: 'Бухгалтерия', roles: ['admin', 'owner', 'accountant'] },
  { id: 'priceFormula', href: '/price-formula.html', label: 'Расчет цен', roles: ['admin', 'owner', 'accountant'] },
  { id: 'audit', href: '/audit.html', label: 'Журнал действий', roles: ['admin', 'owner'] },
  { id: 'about', href: '/about.html', label: 'О системе', roles: ['admin', 'owner', 'accountant', 'employee'] }
];

export async function initCrmShell({ page, allowedRoles }) {
  const response = await fetch('/api/crm/session');
  const session = await response.json().catch(() => ({ user: null }));
  const user = session.user;

  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/?next=${next}`);
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    window.location.replace(getDefaultPage(user.role));
    return null;
  }

  document.body.dataset.role = user.role;
  document.body.classList.add('crm-page');
  applySharedUiSettings();
  renderShell(user, page);
  return user;
}

function renderShell(user, page) {
  const initials = String(user.name || user.login || 'OR')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const links = navigation
    .filter((item) => item.roles.includes(user.role))
    .map((item) => `<a class="${item.id === page ? 'active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <aside class="shared-crm-sidebar">
      <a class="shared-crm-brand" href="/sales.html"><span>O</span><div><strong>Ordo CRM</strong><small>МойСклад</small></div></a>
      <nav>${links}</nav>
      <div class="shared-crm-sidebar-foot">
        <button id="sharedCrmSettings" class="shared-crm-settings" type="button">Настройки</button>
        <div class="shared-crm-user">
          <span>${escapeHtml(initials)}</span>
          <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(roleLabels[user.role] || user.role)}</small></div>
        </div>
      </div>
    </aside>
    <header class="shared-crm-topbar">
      <button id="sharedCrmMenu" type="button" aria-label="Открыть меню">☰</button>
      <div><strong>${escapeHtml(navigation.find((item) => item.id === page)?.label || 'Ordo CRM')}</strong><small>Ordo CRM</small></div>
      <span>${escapeHtml(user.name)}</span>
    </header>
    ${renderSettingsModal()}
  `);

  document.querySelector('#sharedCrmMenu').addEventListener('click', () => document.body.classList.toggle('crm-menu-open'));
  document.querySelector('#sharedCrmSettings').addEventListener('click', () => {
    syncSharedSettingsControls();
    document.querySelector('#sharedSettingsModal').classList.remove('hidden');
  });
  document.querySelector('#sharedCloseSettings').addEventListener('click', closeSharedSettings);
  document.querySelector('#sharedSettingsModal').addEventListener('click', (event) => {
    if (event.target.id === 'sharedSettingsModal') closeSharedSettings();
  });
  document.querySelector('#sharedCrmLogout').addEventListener('click', async () => {
    await fetch('/api/crm/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/');
  });
  document.querySelectorAll('[data-shared-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      const settings = getSharedUiSettings();
      settings.theme = button.dataset.sharedTheme;
      saveSharedUiSettings(settings);
      applySharedUiSettings();
      syncSharedSettingsControls();
    });
  });
  document.querySelectorAll('[data-shared-density]').forEach((button) => {
    button.addEventListener('click', () => {
      const settings = getSharedUiSettings();
      settings.density = button.dataset.sharedDensity;
      saveSharedUiSettings(settings);
      applySharedUiSettings();
      syncSharedSettingsControls();
    });
  });
  document.querySelector('#sharedResetSettings').addEventListener('click', () => {
    localStorage.removeItem('mysrsUiSettings');
    applySharedUiSettings();
    syncSharedSettingsControls();
  });
  document.querySelector('#sharedSaveSettings').addEventListener('click', closeSharedSettings);
}

function renderSettingsModal() {
  return `
    <section id="sharedSettingsModal" class="shared-settings-modal hidden" aria-modal="true" role="dialog">
      <div class="shared-settings-card">
        <div class="shared-settings-head">
          <div><p>Персонализация</p><h2>Настройки CRM</h2></div>
          <button id="sharedCloseSettings" class="shared-modal-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <section class="shared-settings-section">
          <div><h3>Цвет интерфейса</h3><span>Единый цвет активных элементов на всех страницах.</span></div>
          <div class="shared-color-swatches">
            <button type="button" data-shared-theme="blue" style="--swatch:#2563eb" aria-label="Синий"></button>
            <button type="button" data-shared-theme="green" style="--swatch:#16805b" aria-label="Зеленый"></button>
            <button type="button" data-shared-theme="violet" style="--swatch:#6d5bd0" aria-label="Фиолетовый"></button>
            <button type="button" data-shared-theme="red" style="--swatch:#c2414b" aria-label="Красный"></button>
          </div>
        </section>
        <section class="shared-settings-section">
          <div><h3>Плотность</h3><span>Компактный режим делает таблицы и поля плотнее.</span></div>
          <div class="shared-segmented-control">
            <button type="button" data-shared-density="comfortable">Обычная</button>
            <button type="button" data-shared-density="compact">Компактная</button>
          </div>
        </section>
        <div class="shared-settings-actions">
          <button id="sharedCrmLogout" class="shared-danger-button" type="button">Выйти из CRM</button>
          <button id="sharedResetSettings" class="shared-secondary-button" type="button">Сбросить</button>
          <button id="sharedSaveSettings" type="button">Готово</button>
        </div>
      </div>
    </section>`;
}

function closeSharedSettings() {
  document.querySelector('#sharedSettingsModal').classList.add('hidden');
}

function getSharedUiSettings() {
  try {
    return {
      theme: 'blue',
      density: 'comfortable',
      ...JSON.parse(localStorage.getItem('mysrsUiSettings') || '{}')
    };
  } catch {
    return { theme: 'blue', density: 'comfortable' };
  }
}

function saveSharedUiSettings(settings) {
  localStorage.setItem('mysrsUiSettings', JSON.stringify(settings));
}

function applySharedUiSettings() {
  const settings = getSharedUiSettings();
  document.body.dataset.theme = settings.theme || 'blue';
  document.body.classList.toggle('density-compact', settings.density === 'compact');
}

function syncSharedSettingsControls() {
  const settings = getSharedUiSettings();
  document.querySelectorAll('[data-shared-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sharedTheme === settings.theme);
  });
  document.querySelectorAll('[data-shared-density]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sharedDensity === settings.density);
  });
}

function getDefaultPage(role) {
  if (role === 'accountant') return '/prices.html';
  return '/sales.html';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
