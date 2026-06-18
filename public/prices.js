import { initCrmShell } from './crm-shell.js';

const PAGE_SIZE = 100;
const LOAD_BATCH_SIZE = 500;
const state = {
  products: [],
  priceTypes: [],
  selected: new Set(),
  overrides: new Map(),
  page: 1,
  total: 0,
  loadingCatalog: false,
  loadGeneration: 0
};
const els = Object.fromEntries([
  'pricePanel', 'searchInput',
  'priceTypeSelect', 'showArchived', 'reloadButton', 'operationSelect', 'operationValue',
  'roundingSelect', 'calculateButton', 'clearChangesButton', 'selectionStatus', 'catalogCount',
  'filteredCount', 'selectedCount', 'changedCount', 'catalogStatus', 'saveButton', 'productRows',
  'selectPage', 'prevPage', 'nextPage', 'pageLabel'
].map((id) => [id, document.querySelector(`#${id}`)]));

init();

async function init() {
  bindEvents();
  const user = await initCrmShell({ page: 'prices', allowedRoles: ['admin', 'owner', 'accountant'] });
  if (user) await showPrices();
}

function bindEvents() {
  els.reloadButton.addEventListener('click', loadCatalog);
  els.searchInput.addEventListener('input', resetPageAndRender);
  els.showArchived.addEventListener('change', resetPageAndRender);
  els.priceTypeSelect.addEventListener('change', () => {
    state.overrides.clear();
    render();
  });
  els.calculateButton.addEventListener('click', calculateSelected);
  els.clearChangesButton.addEventListener('click', () => {
    state.overrides.clear();
    render();
  });
  els.selectPage.addEventListener('change', selectCurrentPage);
  els.prevPage.addEventListener('click', () => changePage(-1));
  els.nextPage.addEventListener('click', () => changePage(1));
  els.saveButton.addEventListener('click', saveChanges);
  els.productRows.addEventListener('change', handleTableChange);
}

async function showPrices() {
  els.pricePanel.classList.remove('hidden');
  await loadCatalog();
}

async function loadCatalog() {
  const generation = ++state.loadGeneration;
  state.loadingCatalog = true;
  state.products = [];
  state.priceTypes = [];
  state.total = 0;
  state.selected.clear();
  state.overrides.clear();
  state.page = 1;
  els.productRows.innerHTML = '<tr><td colspan="6">Загружаю первые 500 товаров...</td></tr>';
  els.catalogStatus.textContent = 'Загружаю первые 500 товаров...';
  els.reloadButton.disabled = true;
  try {
    const data = await api(`/api/accounting/prices?offset=0&limit=${LOAD_BATCH_SIZE}`);
    if (generation !== state.loadGeneration) return;
    state.products = mergeProducts([], data.products);
    state.priceTypes = Array.isArray(data.priceTypes) ? data.priceTypes : [];
    state.total = Number(data.total || state.products.length);
    els.priceTypeSelect.innerHTML = state.priceTypes.map((type) =>
      `<option value="${escapeHtml(type.href)}">${escapeHtml(type.name)}</option>`
    ).join('');
    selectDefaultPriceType();
    els.catalogStatus.textContent = data.hasMore
      ? `Показаны первые ${state.products.length} товаров. Остальные загружаются в фоне...`
      : `Каталог загружен: ${state.products.length} товаров.`;
    render();
    if (data.hasMore) {
      loadRemainingCatalog(data.nextOffset, generation);
    } else {
      finishCatalogLoading(generation);
    }
  } catch (error) {
    if (generation !== state.loadGeneration) return;
    els.catalogStatus.textContent = error.message;
    els.productRows.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
    finishCatalogLoading(generation);
  }
}

async function loadRemainingCatalog(startOffset, generation) {
  let offset = startOffset;
  try {
    while (generation === state.loadGeneration && offset < state.total) {
      const data = await api(`/api/accounting/prices?offset=${offset}&limit=${LOAD_BATCH_SIZE}&includePriceTypes=false`);
      if (generation !== state.loadGeneration) return;
      state.products = mergeProducts(state.products, data.products);
      state.total = Number(data.total || state.total || state.products.length);
      offset = Number(data.nextOffset || state.products.length);
      els.catalogStatus.textContent = `Загружено ${state.products.length} из ${state.total} товаров. Можно продолжать работу.`;
      render();
      if (!data.hasMore) break;
    }
    if (generation === state.loadGeneration) {
      els.catalogStatus.textContent = `Каталог полностью загружен: ${state.products.length} товаров.`;
    }
  } catch (error) {
    if (generation === state.loadGeneration) {
      els.catalogStatus.textContent = `Загружено ${state.products.length} товаров. Фоновая загрузка остановлена: ${error.message}`;
    }
  } finally {
    finishCatalogLoading(generation);
  }
}

function finishCatalogLoading(generation) {
  if (generation !== state.loadGeneration) return;
  state.loadingCatalog = false;
  els.reloadButton.disabled = false;
  render();
}

function mergeProducts(current, incoming) {
  const products = new Map(current.map((product) => [product.id, product]));
  for (const product of Array.isArray(incoming) ? incoming : []) {
    products.set(product.id, product);
  }
  return [...products.values()];
}

function getFilteredProducts() {
  const query = normalizeSearch(els.searchInput.value);
  return state.products.filter((product) => {
    if (!els.showArchived.checked && product.archived) return false;
    if (!query) return true;
    return normalizeSearch([product.name, product.code, product.article].join(' ')).includes(query);
  });
}

function getCurrentPageProducts() {
  const filtered = getFilteredProducts();
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount);
  return filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
}

function render() {
  const filtered = getFilteredProducts();
  const pageProducts = getCurrentPageProducts();
  const priceTypeHref = els.priceTypeSelect.value;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  els.productRows.innerHTML = pageProducts.map((product) => {
    const current = getPrice(product, priceTypeHref);
    const next = state.overrides.has(product.id) ? state.overrides.get(product.id) : current;
    const delta = roundMoney(next - current);
    return `
      <tr class="${state.overrides.has(product.id) ? 'changed' : ''} ${product.archived ? 'archived' : ''}">
        <td><input type="checkbox" data-select-product="${product.id}" ${state.selected.has(product.id) ? 'checked' : ''}></td>
        <td>${escapeHtml(product.code || '-')}</td>
        <td><strong>${escapeHtml(product.name)}</strong>${product.archived ? '<span class="archive-badge">Архив</span>' : ''}</td>
        <td>${formatSom(current)}</td>
        <td><input class="price-input" data-price-product="${product.id}" type="number" min="0" step="0.01" value="${next.toFixed(2)}"></td>
        <td class="${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}">${formatDelta(delta)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="6">Товары не найдены.</td></tr>';

  els.catalogCount.textContent = state.loadingCatalog && state.total > state.products.length
    ? `${formatNumber(state.products.length)} / ${formatNumber(state.total)}`
    : formatNumber(state.products.length);
  els.filteredCount.textContent = formatNumber(filtered.length);
  els.selectedCount.textContent = formatNumber(state.selected.size);
  els.changedCount.textContent = formatNumber(getSelectedChanges().length);
  els.selectionStatus.textContent = state.selected.size
    ? `Выбрано товаров: ${state.selected.size}`
    : 'Не выбрано ни одного товара';
  els.pageLabel.textContent = `Страница ${state.page} из ${pageCount}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= pageCount;
  els.selectPage.checked = pageProducts.length > 0 && pageProducts.every((product) => state.selected.has(product.id));
  els.saveButton.disabled = getSelectedChanges().length === 0;
}

function handleTableChange(event) {
  const select = event.target.closest('[data-select-product]');
  if (select) {
    if (select.checked) state.selected.add(select.dataset.selectProduct);
    else state.selected.delete(select.dataset.selectProduct);
    render();
    return;
  }

  const priceInput = event.target.closest('[data-price-product]');
  if (priceInput) {
    const value = Number(priceInput.value);
    const product = state.products.find((item) => item.id === priceInput.dataset.priceProduct);
    if (!product || !Number.isFinite(value) || value < 0) return;
    const current = getPrice(product, els.priceTypeSelect.value);
    if (roundMoney(value) === current) state.overrides.delete(product.id);
    else state.overrides.set(product.id, roundMoney(value));
    state.selected.add(product.id);
    render();
  }
}

function selectCurrentPage() {
  for (const product of getCurrentPageProducts()) {
    if (els.selectPage.checked) state.selected.add(product.id);
    else state.selected.delete(product.id);
  }
  render();
}

function calculateSelected() {
  if (!state.selected.size) {
    els.catalogStatus.textContent = 'Сначала выберите товары галочками.';
    return;
  }
  const value = Number(els.operationValue.value);
  if (!Number.isFinite(value) || value < 0) {
    els.catalogStatus.textContent = 'Введите корректное значение операции.';
    return;
  }
  const rounding = Number(els.roundingSelect.value || 0);
  for (const product of state.products) {
    if (!state.selected.has(product.id)) continue;
    const current = getPrice(product, els.priceTypeSelect.value);
    let next = calculatePrice(current, els.operationSelect.value, value);
    if (rounding > 0) next = Math.round(next / rounding) * rounding;
    state.overrides.set(product.id, Math.max(0, roundMoney(next)));
  }
  els.catalogStatus.textContent = 'Расчет готов. Проверьте колонку «Новая цена».';
  render();
}

async function saveChanges() {
  const changes = getSelectedChanges();
  if (!changes.length) return;
  const priceTypeName = els.priceTypeSelect.selectedOptions[0]?.textContent || 'выбранный тип цены';
  if (!confirm(`Изменить «${priceTypeName}» у ${changes.length} товаров в МойСклад?`)) return;

  els.saveButton.disabled = true;
  els.catalogStatus.textContent = `Сохраняю цены: 0 из ${changes.length}...`;
  try {
    const result = await api('/api/accounting/prices/update', {
      method: 'POST',
      body: { priceTypeHref: els.priceTypeSelect.value, changes }
    });
    const failedRows = (result.results || []).filter((item) => !item.ok);
    els.catalogStatus.textContent = failedRows.length
      ? `Обновлено: ${result.updated}. Ошибок: ${result.failed}. ${failedRows[0].error}`
      : `Успешно обновлено товаров: ${result.updated}.`;
    await loadCatalog();
  } catch (error) {
    els.catalogStatus.textContent = error.message;
    els.saveButton.disabled = false;
  }
}

function getSelectedChanges() {
  return [...state.selected].filter((id) => state.overrides.has(id)).map((productId) => ({
    productId,
    value: state.overrides.get(productId)
  }));
}

function getPrice(product, priceTypeHref) {
  const price = (product.prices || []).find((item) => item.priceTypeHref === priceTypeHref);
  return roundMoney(Number(price?.value || 0));
}

function selectDefaultPriceType() {
  const preferred = state.priceTypes.find((type) => normalizeSearch(type.name) === '3-6')
    || state.priceTypes.find((type) => normalizeSearch(type.name).includes('3-6'));
  if (preferred) {
    els.priceTypeSelect.value = preferred.href;
  }
}

function calculatePrice(current, operation, value) {
  if (operation === 'set') return value;
  if (operation === 'increasePercent') return current * (1 + value / 100);
  if (operation === 'decreasePercent') return current * (1 - value / 100);
  if (operation === 'increaseAmount') return current + value;
  if (operation === 'decreaseAmount') return current - value;
  return current;
}

function resetPageAndRender() { state.page = 1; render(); }
function changePage(offset) { state.page += offset; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function normalizeSearch(value) { return String(value || '').trim().toLocaleLowerCase('ru-RU'); }
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(Number(value || 0)); }
function formatSom(value) { return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`; }
function formatDelta(value) { return value === 0 ? '0,00 сом' : `${value > 0 ? '+' : ''}${formatSom(value)}`; }
async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
