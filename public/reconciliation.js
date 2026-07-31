import { initCrmShell } from './crm-shell.js';

const ids = [
  'reconciliationApp', 'filtersForm', 'searchInput', 'customerTypeFilter', 'refreshButton',
  'totalDebt', 'debtorCount', 'documentCount', 'totalPaid', 'status', 'loadedAt', 'debtorRows',
  'debtorModal', 'modalMeta', 'modalTitle', 'modalBody', 'closeModal', 'printButton'
];
const els = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
let debtors = [];
let searchTimer = null;

init();

async function init() {
  const user = await initCrmShell({ page: 'reconciliation', allowedRoles: ['admin', 'owner', 'manager', 'accountant'] });
  if (!user) return;
  els.reconciliationApp.classList.remove('hidden');
  bindEvents();
  await loadDebtors();
}

function bindEvents() {
  els.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadDebtors();
  });
  els.searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadDebtors, 280);
  });
  els.customerTypeFilter.addEventListener('change', loadDebtors);
  els.refreshButton.addEventListener('click', loadDebtors);
  els.debtorRows.addEventListener('click', (event) => {
    const row = event.target.closest('[data-debtor-id]');
    if (row) openDebtor(row.dataset.debtorId);
  });
  els.closeModal.addEventListener('click', closeModal);
  els.debtorModal.addEventListener('click', (event) => {
    if (event.target === els.debtorModal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
  els.printButton.addEventListener('click', () => window.print());
}

async function loadDebtors() {
  els.status.textContent = 'Загружаю долги из МойСклада...';
  const params = new URLSearchParams({ limit: '300' });
  if (els.searchInput.value.trim()) params.set('search', els.searchInput.value.trim());
  if (els.customerTypeFilter.value) params.set('customerType', els.customerTypeFilter.value);

  try {
    const data = await api(`/api/reconciliation/debtors?${params}`);
    debtors = Array.isArray(data.debtors) ? data.debtors : [];
    renderSummary(data.totals || {});
    renderRows();
    els.status.textContent = data.truncated
      ? `Показаны долги из последних ${formatNumber(2000)} документов каждого типа.`
      : `${formatNumber(debtors.length)} должников`;
    els.loadedAt.textContent = data.loadedAt ? `Обновлено: ${formatDateTime(data.loadedAt)}` : '';
  } catch (error) {
    debtors = [];
    renderSummary({});
    renderRows();
    els.status.textContent = error.message;
    els.loadedAt.textContent = '';
  }
}

function renderSummary(totals) {
  els.totalDebt.textContent = formatMoney(totals.debt || 0);
  els.debtorCount.textContent = formatNumber(totals.debtors || debtors.length);
  els.documentCount.textContent = formatNumber(totals.documents || 0);
  els.totalPaid.textContent = formatMoney(totals.paid || 0);
}

function renderRows() {
  els.debtorRows.innerHTML = debtors.map((debtor) => `
    <tr data-debtor-id="${escapeAttr(debtor.id)}">
      <td>
        <div class="debtor-main">
          <strong>${escapeHtml(debtor.name || 'Без имени')}</strong>
          <span>${escapeHtml(debtor.actualAddress || 'Адрес не указан')}</span>
        </div>
      </td>
      <td><span class="type-badge ${getTypeBadgeClass(debtor.customerType)}">${escapeHtml(debtor.customerTypeLabel || 'Клиент')}</span></td>
      <td>${escapeHtml([debtor.phone, debtor.inn].filter(Boolean).join(' / ') || '-')}</td>
      <td>
        <strong>${escapeHtml(debtor.lastDocumentName || '-')}</strong>
        <div class="muted">${escapeHtml(formatDateTime(debtor.lastMoment))}</div>
      </td>
      <td class="num">${formatNumber(debtor.documentCount || 0)}</td>
      <td class="num">${formatMoney(debtor.paid || 0)}</td>
      <td class="num debt-value">${formatMoney(debtor.debt || 0)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty">Долгов нет.</td></tr>';
}

async function openDebtor(id) {
  const local = debtors.find((debtor) => debtor.id === id);
  els.modalTitle.textContent = local?.name || 'Акт сверки';
  els.modalMeta.textContent = local ? `${local.customerTypeLabel || 'Контрагент'} · долг ${formatMoney(local.debt || 0)}` : 'Загрузка';
  els.modalBody.innerHTML = '<div class="empty">Загружаю документы и оплаты...</div>';
  els.debtorModal.classList.remove('hidden');

  try {
    const data = await api(`/api/reconciliation/debtors/${encodeURIComponent(id)}`);
    renderModal(data);
  } catch (error) {
    els.modalBody.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderModal(data) {
  const debtor = data.debtor || {};
  const totals = data.totals || {};
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const act = data.act || {};

  els.modalTitle.textContent = debtor.name || 'Акт сверки';
  els.modalMeta.textContent = `${debtor.customerTypeLabel || 'Контрагент'}${debtor.phone ? ` · ${debtor.phone}` : ''}${debtor.inn ? ` · ИНН ${debtor.inn}` : ''}`;
  els.modalBody.innerHTML = `
    ${renderActDocument(act, debtor)}

    <section class="rc-detail-grid">
      <article><span>Итого долг</span><strong class="debt-value">${formatMoney(totals.debt || 0)}</strong></article>
      <article><span>Сумма документов</span><strong>${formatMoney(totals.amount || 0)}</strong></article>
      <article><span>Оплачено</span><strong>${formatMoney(totals.paid || 0)}</strong></article>
      <article><span>Документов</span><strong>${formatNumber(totals.documents || 0)}</strong></article>
    </section>

    <section class="rc-section">
      <h3>Документы с долгом</h3>
      <div class="rc-list">
        ${documents.map(renderDocument).join('') || '<div class="empty">Документы с долгом не найдены.</div>'}
      </div>
    </section>

    <section class="rc-section">
      <h3>Оплаты</h3>
      <div class="rc-list">
        ${payments.map(renderPayment).join('') || '<div class="empty">Отдельные входящие платежи по клиенту не найдены.</div>'}
      </div>
    </section>
  `;
}

function renderActDocument(act, debtor) {
  const rows = Array.isArray(act.rows) ? act.rows : [];
  const totals = act.totals || {};
  const rowsHtml = rows.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(row.operation || '')}</td>
      <td class="num">${row.debit ? formatPlainMoney(row.debit) : ''}</td>
      <td class="num">${row.credit ? formatPlainMoney(row.credit) : ''}</td>
      <td class="center">${index + 1}</td>
      <td></td>
      <td class="num"></td>
      <td class="num"></td>
    </tr>
  `).join('');

  return `<section class="rc-act-document">
    <h3>АКТ СВЕРКИ</h3>
    <p class="rc-act-subtitle">взаимных расчетов по состоянию на ${escapeHtml(act.date || '')} между Ordo CRM и ${escapeHtml(debtor.name || act.customerName || 'контрагентом')}</p>
    <p class="rc-act-text">Мы, нижеподписавшиеся, с одной стороны Ordo CRM, с другой стороны ${escapeHtml(debtor.name || act.customerName || 'контрагент')}, составили настоящий акт сверки в том, что состояние взаимных расчетов по данным учета следующее:</p>
    <table class="rc-act-table">
      <thead>
        <tr>
          <th colspan="4">По данным Ordo CRM, сом</th>
          <th colspan="4">По данным ${escapeHtml(debtor.name || act.customerName || 'контрагента')}, сом</th>
        </tr>
        <tr>
          <th>№ п/п</th>
          <th>Наименование операции, документы</th>
          <th>Дебет</th>
          <th>Кредит</th>
          <th>№ п/п</th>
          <th>Наименование операции, документы</th>
          <th>Дебет</th>
          <th>Кредит</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="8" class="center">Операций нет</td></tr>'}
        <tr class="rc-act-total">
          <td></td>
          <td>Обороты за период</td>
          <td class="num">${formatPlainMoney(totals.debit || 0)}</td>
          <td class="num">${formatPlainMoney(totals.credit || 0)}</td>
          <td></td><td></td><td></td><td></td>
        </tr>
        <tr class="rc-act-total">
          <td></td>
          <td>Сальдо на ${escapeHtml(act.date || '')}</td>
          <td class="num">${formatPlainMoney(totals.saldo || 0)}</td>
          <td></td>
          <td></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>
  </section>`;
}

function renderDocument(document) {
  return `<article class="rc-doc">
    <div>
      <a href="${escapeAttr(document.webUrl)}" target="_blank" rel="noreferrer">${escapeHtml(document.typeLabel)} №${escapeHtml(document.name || '')}</a>
      <small>${escapeHtml(formatDateTime(document.moment))} · ${escapeHtml(document.storeName || document.organizationName || '-')}</small>
      ${document.paymentType ? `<small>Оплата: ${escapeHtml(document.paymentType)}</small>` : ''}
      ${Array.isArray(document.appliedPayments) && document.appliedPayments.length
        ? `<small>Зачтено из оплат клиента: ${escapeHtml(document.appliedPayments.map((payment) => `${payment.name || 'оплата'} · ${formatMoney(payment.amount || 0)}`).join(', '))}</small>`
        : ''}
    </div>
    <div class="num"><span class="muted">Сумма</span><strong>${formatMoney(document.amount || 0)}</strong></div>
    <div class="num"><span class="muted">Оплачено</span><strong>${formatMoney(document.paid || 0)}</strong></div>
    <div class="num"><span class="muted">Долг</span><strong class="debt-value">${formatMoney(document.debt || 0)}</strong></div>
  </article>`;
}

function renderPayment(payment) {
  return `<article class="rc-payment">
    <div>
      <a href="${escapeAttr(payment.webUrl)}" target="_blank" rel="noreferrer">Оплата №${escapeHtml(payment.name || '')}</a>
      <small>${escapeHtml(formatDateTime(payment.moment))} · ${escapeHtml(payment.organizationName || '-')}</small>
      ${payment.description ? `<small>${escapeHtml(payment.description)}</small>` : ''}
    </div>
    <div class="num"><span class="muted">Сумма</span><strong>${formatMoney(payment.amount || 0)}</strong></div>
  </article>`;
}

function closeModal() {
  els.debtorModal.classList.add('hidden');
}

function getTypeBadgeClass(type) {
  if (type === 'legal') return 'legal';
  if (type === 'entrepreneur') return 'entrepreneur';
  return '';
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные.');
  return data;
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`;
}

function formatPlainMoney(value) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
