import { initCrmShell } from '/crm-shell.js';

const app = document.querySelector('#deliveriesApp');
const list = document.querySelector('#deliveryList');
const statusText = document.querySelector('#deliveryStatus');
const toast = document.querySelector('#toast');
const els = {
  dateFrom: document.querySelector('#dateFrom'), dateTo: document.querySelector('#dateTo'),
  status: document.querySelector('#statusFilter'), search: document.querySelector('#searchInput'),
  total: document.querySelector('#totalCount'), newCount: document.querySelector('#newCount'),
  transit: document.querySelector('#transitCount'), delivered: document.querySelector('#deliveredCount')
};
const statusLabels = { new: 'Новая', assigned: 'Назначена', in_transit: 'В пути', delivered: 'Доставлена', cancelled: 'Отменена' };
let deliveries = [];

const user = await initCrmShell({ page: 'deliveries', allowedRoles: ['admin', 'owner', 'manager', 'seller', 'logistics', 'employee'] });
if (user) {
  const today = new Date();
  const week = new Date(Date.now() + 7 * 86400000);
  els.dateFrom.value = toDateInput(today);
  els.dateTo.value = toDateInput(week);
  document.querySelector('#deliveryFilters').addEventListener('submit', (event) => { event.preventDefault(); loadDeliveries(); });
  document.querySelector('#refreshButton').addEventListener('click', loadDeliveries);
  els.search.addEventListener('input', render);
  app.classList.remove('hidden');
  await loadDeliveries();
}

async function loadDeliveries() {
  statusText.textContent = 'Загрузка...';
  list.innerHTML = '<div class="empty">Загружаю доставки...</div>';
  try {
    const params = new URLSearchParams({ dateFrom: els.dateFrom.value, dateTo: els.dateTo.value });
    if (els.status.value) params.set('status', els.status.value);
    const response = await fetch(`/api/deliveries?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить доставки.');
    deliveries = data.deliveries || [];
    statusText.textContent = `${deliveries.length} доставок`;
    render();
  } catch (error) {
    statusText.textContent = error.message;
    list.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
  }
}

function render() {
  const query = els.search.value.trim().toLocaleLowerCase('ru');
  const rows = query ? deliveries.filter((delivery) => JSON.stringify([delivery.customer_name, delivery.customer_phone, delivery.delivery_address, delivery.employee_name, delivery.items]).toLocaleLowerCase('ru').includes(query)) : deliveries;
  els.total.textContent = deliveries.length;
  els.newCount.textContent = deliveries.filter((item) => item.status === 'new').length;
  els.transit.textContent = deliveries.filter((item) => item.status === 'in_transit').length;
  els.delivered.textContent = deliveries.filter((item) => item.status === 'delivered').length;
  if (!rows.length) { list.innerHTML = '<div class="empty">Подходящих доставок нет.</div>'; return; }
  list.innerHTML = rows.map(renderCard).join('');
  list.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', updateStatus));
}

function renderCard(delivery) {
  const items = Array.isArray(delivery.items) ? delivery.items : [];
  return `<article class="delivery-card status-${delivery.status}">
    <header><div><span>${formatDateTime(delivery.scheduled_at)}</span><h3>${escapeHtml(delivery.customer_name)}</h3></div><span class="status-badge">${statusLabels[delivery.status] || delivery.status}</span></header>
    <div class="delivery-info">
      <div><span>Телефон</span><a href="tel:${escapeAttr(delivery.customer_phone)}">${escapeHtml(delivery.customer_phone)}</a></div>
      <div><span>Адрес</span><strong>${escapeHtml(delivery.delivery_address)}</strong></div>
      <div><span>Филиал</span><strong>${escapeHtml(delivery.branch_name)}</strong></div>
      <div><span>Продал</span><strong>${escapeHtml(delivery.employee_name || '-')}</strong></div>
    </div>
    <div class="delivery-items"><span>Позиции на доставку</span>${items.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><b>${formatQuantity(item.quantity)} шт</b></div>`).join('')}</div>
    ${delivery.notes ? `<p class="notes">${escapeHtml(delivery.notes)}</p>` : ''}
    <footer>
      <label><span>Статус</span><select data-status="${delivery.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === delivery.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      ${delivery.document_url ? `<a href="${escapeAttr(delivery.document_url)}" target="_blank" rel="noopener">Открыть документ №${escapeHtml(delivery.document_name)}</a>` : ''}
    </footer>
  </article>`;
}

async function updateStatus(event) {
  const select = event.currentTarget;
  select.disabled = true;
  try {
    const response = await fetch(`/api/deliveries/${select.dataset.status}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось изменить статус.');
    const index = deliveries.findIndex((item) => item.id === data.delivery.id);
    if (index >= 0) deliveries[index] = data.delivery;
    render();
    showToast('Статус доставки обновлен.');
  } catch (error) { showToast(error.message, true); select.disabled = false; }
}

function showToast(message, error = false) { toast.textContent = message; toast.classList.toggle('error', error); toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 2800); }
function toDateInput(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function formatDateTime(value) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function formatQuantity(value) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value) { return escapeHtml(value); }
