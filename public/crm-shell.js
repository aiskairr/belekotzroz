const roleLabels = {
  admin: 'Главный администратор',
  owner: 'Владелец',
  manager: 'Менеджер',
  seller: 'Продавец',
  logistics: 'Логистика',
  accountant: 'Бухгалтер',
  employee: 'Сотрудник'
};

const navigation = [
  { id: 'sales', href: '/sales.html', label: 'Продажи', permission: 'sales' },
  { id: 'debtSale', href: '/debt-sale.html', label: 'Продать в долг', permission: 'debtSale' },
  { id: 'deliveries', href: '/deliveries.html', label: 'Доставки', permission: 'deliveries' },
  { id: 'reports', href: '/report.html', label: 'Отчетность', permission: 'reports' },
  { id: 'bankCommissions', href: '/bank-commissions.html', label: 'Банковские комиссии', permission: 'bankCommissions' },
  { id: 'expenses', href: '/expenses.html', label: 'Расходы', permission: 'expenses' },
  { id: 'payroll', href: '/payroll.html', label: 'Зарплаты', permission: 'payroll' },
  { id: 'commercialDocuments', href: '/commercial-documents.html', label: 'Счета юрлицам', permission: 'commercialDocuments' },
  { id: 'reconciliation', href: '/reconciliation.html', label: 'Акт сверки', permission: 'reconciliation' },
  { id: 'whatsappBroadcast', href: '/whatsapp-broadcast.html', label: 'WhatsApp рассылка', permission: 'whatsappBroadcast' },
  { id: 'priceFormula', href: '/price-formula.html', label: 'Расчет цен', permission: 'priceFormula' },
  { id: 'customsCalculator', href: '/customs-calculator.html', label: 'Калькулятор таможни', permission: 'customsCalculator' },
  { id: 'audit', href: '/audit.html', label: 'Журнал действий', permission: 'audit' },
  { id: 'users', href: '/users.html', label: 'Сотрудники и доступ', permission: 'users' },
  { id: 'about', href: '/about.html', label: 'О системе', permission: 'about' }
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

  const requiredPermission = page === 'prices'
    ? 'priceFormula'
    : navigation.find((item) => item.id === page)?.permission || page;
  if (!hasPermission(user, requiredPermission)) {
    window.location.replace(getDefaultPage(user));
    return null;
  }

  document.body.dataset.role = user.role;
  document.body.classList.add('crm-page');
  await loadSharedUiSettings();
  applySharedUiSettings();
  renderShell(user, page);
  initMoySkladMonitor(user);
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
    .filter((item) => hasPermission(user, item.permission))
    .map((item) => `<a class="${item.id === page ? 'active' : ''}" href="${item.href}">${item.label}</a>`)
    .join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <aside class="shared-crm-sidebar">
      <button id="sharedCrmClose" class="shared-crm-close" type="button" aria-label="Закрыть меню">×</button>
      <a class="shared-crm-brand" href="/sales.html"><img src="/ordo-logo-light.svg?v=20260702-sidebar-colors" alt="Ordo CRM"></a>
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
    <aside id="moyskladMonitor" class="moysklad-monitor hidden" aria-live="polite">
      <strong>МойСклад</strong>
      <span id="moyskladMonitorRpm">0 / 120 в мин</span>
      <span id="moyskladMonitorQueue">Очередь: 0</span>
      <span id="moyskladMonitorActive">Активно: 0</span>
    </aside>
    ${renderSettingsModal()}
  `);

  const menuButton = document.querySelector('#sharedCrmMenu');
  const closeMenu = () => {
    document.body.classList.remove('crm-menu-open');
    menuButton.setAttribute('aria-expanded', 'false');
  };
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.addEventListener('click', () => {
    const opened = document.body.classList.toggle('crm-menu-open');
    menuButton.setAttribute('aria-expanded', String(opened));
  });
  document.querySelector('#sharedCrmClose').addEventListener('click', closeMenu);
  document.querySelectorAll('.shared-crm-sidebar nav a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
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
      persistSharedUiSettings(settings);
      applySharedUiSettings();
      syncSharedSettingsControls();
    });
  });
  document.querySelectorAll('[data-shared-density]').forEach((button) => {
    button.addEventListener('click', () => {
      const settings = getSharedUiSettings();
      settings.density = button.dataset.sharedDensity;
      persistSharedUiSettings(settings);
      applySharedUiSettings();
      syncSharedSettingsControls();
    });
  });
  document.querySelectorAll('[data-shared-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const settings = getSharedUiSettings();
      settings.mode = button.dataset.sharedMode;
      persistSharedUiSettings(settings);
      applySharedUiSettings();
      syncSharedSettingsControls();
    });
  });
  document.querySelector('#sharedAccentColor').addEventListener('input', (event) => {
    const settings = getSharedUiSettings();
    settings.accentColor = normalizeHexColor(event.target.value);
    syncAccentControls(settings.accentColor);
    applySharedUiSettings();
  });
  document.querySelectorAll('[data-accent-channel]').forEach((input) => {
    input.addEventListener('input', () => {
      const color = rgbToHex(
        Number(document.querySelector('[data-accent-channel="r"]').value || 0),
        Number(document.querySelector('[data-accent-channel="g"]').value || 0),
        Number(document.querySelector('[data-accent-channel="b"]').value || 0)
      );
      const settings = getSharedUiSettings();
      settings.accentColor = color;
      syncAccentControls(color);
      applySharedUiSettings();
    });
    input.addEventListener('change', () => {
      persistSharedUiSettings(getSharedUiSettings());
    });
  });
  document.querySelector('#sharedAccentColor').addEventListener('change', (event) => {
    const settings = getSharedUiSettings();
    settings.accentColor = normalizeHexColor(event.target.value);
    persistSharedUiSettings(settings);
  });
  document.querySelector('#sharedResetSettings').addEventListener('click', () => {
    const defaults = getDefaultSharedUiSettings();
    saveSharedUiSettings(defaults);
    applySharedUiSettings();
    syncSharedSettingsControls();
    persistSharedUiSettings(defaults);
  });
  document.querySelector('#sharedSaveSettings').addEventListener('click', closeSharedSettings);
}

function shouldShowMoySkladMonitor(user) {
  return user?.role === 'admin' || user?.role === 'owner';
}

function initMoySkladMonitor(user) {
  const widget = document.querySelector('#moyskladMonitor');
  if (!widget || !shouldShowMoySkladMonitor(user)) {
    widget?.classList.add('hidden');
    return;
  }
  widget.classList.remove('hidden');

  const rpm = document.querySelector('#moyskladMonitorRpm');
  const queue = document.querySelector('#moyskladMonitorQueue');
  const active = document.querySelector('#moyskladMonitorActive');

  const loadStats = async () => {
    try {
      const response = await fetch('/api/crm/moysklad-monitor');
      const data = await response.json().catch(() => ({ stats: null }));
      if (!response.ok || !data?.stats) {
        widget.classList.add('hidden');
        return;
      }
      widget.classList.remove('hidden');
      rpm.textContent = `${data.stats.requestsLastMinute} / ${data.stats.limitPerMinute} в мин`;
      queue.textContent = `Очередь: ${data.stats.waiting}${data.stats.nextDelayMs ? ` · ${Math.ceil(data.stats.nextDelayMs / 100) / 10}с` : ''}`;
      active.textContent = `Активно: ${data.stats.active}`;
      widget.classList.toggle('warning', data.stats.requestsLastMinute >= 100 || data.stats.waiting > 0);
    } catch {
      widget.classList.add('hidden');
    }
  };

  loadStats();
  window.setInterval(loadStats, 3000);
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
          <div><h3>Персональный RGB</h3><span>Индивидуальный цвет кнопок и активных элементов для вашего аккаунта.</span></div>
          <div class="shared-accent-editor">
            <input id="sharedAccentColor" type="color" value="#2563eb" aria-label="Выбрать цвет">
            <div class="shared-accent-rgb">
              <label><span>R</span><input data-accent-channel="r" type="range" min="0" max="255" value="37"></label>
              <label><span>G</span><input data-accent-channel="g" type="range" min="0" max="255" value="99"></label>
              <label><span>B</span><input data-accent-channel="b" type="range" min="0" max="255" value="235"></label>
            </div>
          </div>
        </section>
        <section class="shared-settings-section">
          <div><h3>Режим</h3><span>Светлый или ночной интерфейс для CRM.</span></div>
          <div class="shared-segmented-control">
            <button type="button" data-shared-mode="light">Light</button>
            <button type="button" data-shared-mode="dark">Night</button>
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
      ...getDefaultSharedUiSettings(),
      ...JSON.parse(localStorage.getItem('mysrsUiSettings') || '{}')
    };
  } catch {
    return getDefaultSharedUiSettings();
  }
}

function saveSharedUiSettings(settings) {
  localStorage.setItem('mysrsUiSettings', JSON.stringify(settings));
}

async function loadSharedUiSettings() {
  try {
    const response = await fetch('/api/crm/ui-settings');
    const data = await response.json().catch(() => ({ settings: null }));
    if (!response.ok || !data?.settings) return;
    saveSharedUiSettings({ ...getSharedUiSettings(), ...data.settings });
  } catch {}
}

async function persistSharedUiSettings(settings) {
  const normalized = { ...getDefaultSharedUiSettings(), ...settings, accentColor: normalizeHexColor(settings.accentColor) };
  saveSharedUiSettings(normalized);
  try {
    await fetch('/api/crm/ui-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized)
    });
  } catch {}
}

function getDefaultSharedUiSettings() {
  return {
    theme: 'blue',
    mode: 'light',
    density: 'comfortable',
    accentColor: '#2563eb'
  };
}

function applySharedUiSettings() {
  const settings = getSharedUiSettings();
  document.body.dataset.theme = settings.theme || 'blue';
  document.body.dataset.mode = settings.mode === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = document.body.dataset.theme;
  document.documentElement.dataset.mode = document.body.dataset.mode;
  document.body.classList.toggle('density-compact', settings.density === 'compact');
  const accentColor = normalizeHexColor(settings.accentColor);
  const accentSoft = mixHex(accentColor, '#ffffff', 0.88);
  const accentDark = mixHex(accentColor, '#0f172a', 0.2);
  document.body.style.setProperty('--ordo-accent', accentColor);
  document.body.style.setProperty('--ordo-accent-soft', accentSoft);
  document.body.style.setProperty('--ordo-accent-dark', accentDark);
  document.body.style.setProperty('--crm-accent', accentColor);
  document.body.style.setProperty('--crm-accent-soft', accentSoft);
  document.body.style.setProperty('--crm-accent-dark', accentDark);
  document.documentElement.style.setProperty('--ordo-accent', accentColor);
  document.documentElement.style.setProperty('--ordo-accent-soft', accentSoft);
  document.documentElement.style.setProperty('--ordo-accent-dark', accentDark);
  document.documentElement.style.setProperty('--crm-accent', accentColor);
  document.documentElement.style.setProperty('--crm-accent-soft', accentSoft);
  document.documentElement.style.setProperty('--crm-accent-dark', accentDark);
}

function syncSharedSettingsControls() {
  const settings = getSharedUiSettings();
  document.querySelectorAll('[data-shared-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sharedTheme === settings.theme);
  });
  document.querySelectorAll('[data-shared-density]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sharedDensity === settings.density);
  });
  document.querySelectorAll('[data-shared-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sharedMode === (settings.mode || 'light'));
  });
  syncAccentControls(settings.accentColor || '#2563eb');
}

function syncAccentControls(color) {
  const hex = normalizeHexColor(color);
  const { r, g, b } = hexToRgb(hex);
  const picker = document.querySelector('#sharedAccentColor');
  if (picker) picker.value = hex;
  const red = document.querySelector('[data-accent-channel="r"]');
  const green = document.querySelector('[data-accent-channel="g"]');
  const blue = document.querySelector('[data-accent-channel="b"]');
  if (red) red.value = String(r);
  if (green) green.value = String(g);
  if (blue) blue.value = String(b);
}

function normalizeHexColor(value) {
  const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : '#2563eb';
}

function hexToRgb(hex) {
  const value = normalizeHexColor(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Number(value) || 0)).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(baseHex, targetHex, targetWeight) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const weight = Math.max(0, Math.min(1, Number(targetWeight) || 0));
  return rgbToHex(
    Math.round(base.r * (1 - weight) + target.r * weight),
    Math.round(base.g * (1 - weight) + target.g * weight),
    Math.round(base.b * (1 - weight) + target.b * weight)
  );
}

function getDefaultPage(user) {
  return navigation.find((item) => hasPermission(user, item.permission))?.href || '/';
}

function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
