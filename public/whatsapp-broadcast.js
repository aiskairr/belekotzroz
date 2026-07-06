import { initCrmShell } from './crm-shell.js';

const ids = [
  'whatsappApp', 'refreshButton', 'selectVisibleButton', 'filtersForm', 'searchInput', 'customerTypeFilter',
  'customersStatus', 'customersList', 'messageText', 'videoLinks', 'buildQueueButton', 'exportCsvButton',
  'clearSelectionButton', 'messagePreview', 'queueStatus', 'batchSize', 'openBatchButton', 'openNextButton', 'queueList'
];
const els = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
const selectedIds = new Set();
const sentIds = new Set(JSON.parse(localStorage.getItem('ordoWhatsappSentIds') || '[]'));
let customers = [];
let queue = [];
let searchTimer = null;

init();

async function init() {
  const user = await initCrmShell({ page: 'whatsappBroadcast', allowedRoles: ['admin', 'owner', 'manager'] });
  if (!user) return;
  els.whatsappApp.classList.remove('hidden');
  els.messageText.value = 'Здравствуйте, {name}! Мы сняли новые видео по товарам. Посмотрите, пожалуйста:\n\n{videos}\n\nЕсли интересно, напишите нам в ответ.';
  bindEvents();
  updatePreview();
  await loadCustomers();
}

function bindEvents() {
  els.refreshButton.addEventListener('click', loadCustomers);
  els.selectVisibleButton.addEventListener('click', () => {
    customers.forEach((customer) => selectedIds.add(customer.id));
    renderCustomers();
    buildQueue();
  });
  els.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadCustomers();
  });
  els.searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadCustomers, 250);
  });
  els.customerTypeFilter.addEventListener('change', loadCustomers);
  els.customersList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-customer-id]');
    if (!checkbox) return;
    if (checkbox.checked) selectedIds.add(checkbox.dataset.customerId);
    else selectedIds.delete(checkbox.dataset.customerId);
    buildQueue();
  });
  els.messageText.addEventListener('input', () => {
    updatePreview();
    buildQueue();
  });
  els.videoLinks.addEventListener('input', () => {
    updatePreview();
    buildQueue();
  });
  els.buildQueueButton.addEventListener('click', buildQueue);
  els.clearSelectionButton.addEventListener('click', () => {
    selectedIds.clear();
    queue = [];
    renderCustomers();
    renderQueue();
  });
  els.exportCsvButton.addEventListener('click', exportCsv);
  els.openNextButton.addEventListener('click', openNext);
  els.openBatchButton.addEventListener('click', openBatch);
  els.queueList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mark-sent]');
    if (!button) return;
    sentIds.add(button.dataset.markSent);
    localStorage.setItem('ordoWhatsappSentIds', JSON.stringify([...sentIds]));
    renderQueue();
  });
}

async function loadCustomers() {
  els.customersStatus.textContent = 'Загружаю клиентов с номерами...';
  const params = new URLSearchParams({ limit: '500' });
  if (els.searchInput.value.trim()) params.set('search', els.searchInput.value.trim());
  if (els.customerTypeFilter.value) params.set('customerType', els.customerTypeFilter.value);
  try {
    const data = await api(`/api/whatsapp/customers?${params}`);
    customers = Array.isArray(data.customers) ? data.customers : [];
    renderCustomers();
    buildQueue();
    els.customersStatus.textContent = `${formatNumber(customers.length)} клиентов · всего с номерами ${formatNumber(data.total || customers.length)}`;
  } catch (error) {
    customers = [];
    renderCustomers();
    buildQueue();
    els.customersStatus.textContent = error.message;
  }
}

function renderCustomers() {
  els.customersList.innerHTML = customers.map((customer) => `
    <label class="wa-customer">
      <input type="checkbox" data-customer-id="${escapeAttr(customer.id)}" ${selectedIds.has(customer.id) ? 'checked' : ''}>
      <span>
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.phone)}${customer.inn ? ` · ИНН ${escapeHtml(customer.inn)}` : ''}</span>
      </span>
      <b class="wa-badge">${escapeHtml(customer.customerTypeLabel || 'Клиент')}</b>
    </label>
  `).join('') || '<div class="empty">Клиенты с номерами не найдены.</div>';
}

function buildQueue() {
  queue = customers
    .filter((customer) => selectedIds.has(customer.id))
    .map((customer) => {
      const message = buildMessage(customer);
      return {
        ...customer,
        message,
        url: `https://wa.me/${encodeURIComponent(customer.whatsappPhone)}?text=${encodeURIComponent(message)}`
      };
    });
  updatePreview();
  renderQueue();
}

function renderQueue() {
  els.queueStatus.textContent = `Выбрано ${formatNumber(queue.length)} клиентов`;
  const hasPending = queue.some((item) => !sentIds.has(item.id));
  els.openNextButton.disabled = !hasPending;
  els.openBatchButton.disabled = !hasPending;
  els.queueList.innerHTML = queue.map((item) => {
    const sent = sentIds.has(item.id);
    return `<article class="wa-queue-item ${sent ? 'sent' : ''}">
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.phone)} · ${sent ? 'отмечено отправленным' : 'ожидает отправки'}</span></div>
      <a class="wa-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">WhatsApp</a>
      <button class="secondary" type="button" data-mark-sent="${escapeAttr(item.id)}">${sent ? 'Готово' : 'Отправлено'}</button>
    </article>`;
  }).join('') || '<div class="empty">Выберите клиентов и сформируйте очередь.</div>';
}

function openNext() {
  const next = queue.find((item) => !sentIds.has(item.id));
  if (!next) return;
  openQueueItem(next);
}

async function openBatch() {
  const batchSize = Math.max(1, Math.min(30, Number(els.batchSize.value || 10)));
  const items = queue.filter((item) => !sentIds.has(item.id)).slice(0, batchSize);
  els.openBatchButton.disabled = true;
  els.openBatchButton.textContent = 'Открываю...';
  for (const item of items) {
    openQueueItem(item, false);
    await wait(650);
  }
  persistSentIds();
  renderQueue();
  els.openBatchButton.textContent = 'Открыть пачку';
}

function openQueueItem(item, shouldRender = true) {
  window.open(item.url, '_blank', 'noopener,noreferrer');
  sentIds.add(item.id);
  persistSentIds();
  if (shouldRender) renderQueue();
}

function persistSentIds() {
  localStorage.setItem('ordoWhatsappSentIds', JSON.stringify([...sentIds]));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildMessage(customer) {
  const videos = getVideoLinks().join('\n');
  return els.messageText.value
    .replaceAll('{name}', customer.name || '')
    .replaceAll('{phone}', customer.phone || '')
    .replaceAll('{videos}', videos);
}

function getVideoLinks() {
  return els.videoLinks.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function updatePreview() {
  const sample = customers.find((customer) => selectedIds.has(customer.id)) || customers[0] || { name: 'Клиент', phone: '+996...' };
  els.messagePreview.textContent = buildMessage(sample);
}

function exportCsv() {
  const rows = [['name', 'phone', 'whatsapp_phone', 'message', 'wa_link'], ...queue.map((item) => [
    item.name,
    item.phone,
    item.whatsappPhone,
    item.message,
    item.url
  ])];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `whatsapp-broadcast-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные.');
  return data;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
