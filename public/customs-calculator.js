import { initCrmShell } from './crm-shell.js';

const SETTINGS_KEY = 'ordoCustomsCalculatorSettings';
const DRAFT_KEY = 'ordoCustomsCalculatorDraft';
const PAGE_LIMIT = 500;

const state = {
  products: [],
  rows: [],
  partyExpenses: {
    customsClearance: 0
  },
  loading: false,
  rowSeq: 1
};

const els = Object.fromEntries([
  'customsPanel',
  'usdRateInput',
  'productSearchInput',
  'reloadCatalogButton',
  'addManualRowButton',
  'clearRowsButton',
  'searchResults',
  'catalogStatus',
  'rowsList',
  'rowsCount',
  'unitsCount',
  'weightTotal',
  'volumeTotal',
  'buyTotal',
  'expensesTotal',
  'landedTotal',
  'partyCustomsClearanceInput'
].map((id) => [id, document.querySelector(`#${id}`)]));

init();

async function init() {
  bindEvents();
  loadSettings();
  loadDraft();
  const user = await initCrmShell({ page: 'customsCalculator', allowedRoles: ['admin', 'owner', 'accountant', 'manager'] });
  if (!user) return;
  els.customsPanel.classList.remove('hidden');
  renderRows();
  renderSearchResults();
  await loadCatalog();
}

function bindEvents() {
  els.usdRateInput.addEventListener('change', () => {
    saveSettings();
    renderRows();
  });
  els.partyCustomsClearanceInput.addEventListener('change', () => {
    state.partyExpenses.customsClearance = Number(els.partyCustomsClearanceInput.value || 0);
    saveDraft();
    renderRows();
  });
  els.productSearchInput.addEventListener('input', renderSearchResults);
  els.reloadCatalogButton.addEventListener('click', loadCatalog);
  els.addManualRowButton.addEventListener('click', () => {
    state.rows.push(createRow());
    saveDraft();
    renderRows();
  });
  els.clearRowsButton.addEventListener('click', () => {
    if (!window.confirm('Очистить все строки калькулятора?')) return;
    state.rows = [];
    saveDraft();
    renderRows();
  });
  els.searchResults.addEventListener('click', handleSearchResultsClick);
  els.rowsList.addEventListener('change', handleRowInput);
  els.rowsList.addEventListener('click', handleRowClick);
}

async function loadCatalog() {
  state.loading = true;
  els.reloadCatalogButton.disabled = true;
  els.catalogStatus.textContent = 'Загружаю каталог товаров...';
  try {
    let offset = 0;
    let products = [];
    while (true) {
      const data = await api(`/api/accounting/prices?offset=${offset}&limit=${PAGE_LIMIT}&includePriceTypes=false`);
      products = products.concat(Array.isArray(data.products) ? data.products : []);
      if (!data.hasMore) break;
      offset = Number(data.nextOffset || products.length);
    }
    state.products = products;
    els.catalogStatus.textContent = `Каталог загружен: ${formatNumber(products.length)} товаров.`;
    renderSearchResults();
    hydrateRowsFromCatalog();
    renderRows();
  } catch (error) {
    els.catalogStatus.textContent = error.message;
  } finally {
    state.loading = false;
    els.reloadCatalogButton.disabled = false;
  }
}

function handleSearchResultsClick(event) {
  const button = event.target.closest('[data-product-id]');
  if (!button) return;
  const product = state.products.find((item) => item.id === button.dataset.productId);
  if (!product) return;
  state.rows.push(createRow(product));
  saveDraft();
  renderRows();
}

function handleRowInput(event) {
  const rowElement = event.target.closest('[data-row-id]');
  if (!rowElement) return;
  const row = state.rows.find((item) => item.id === rowElement.dataset.rowId);
  if (!row) return;
  const field = event.target.dataset.field;
  if (!field) return;
  if (['name', 'code', 'article', 'buyPriceCurrency', 'model', 'photoColor', 'specification'].includes(field)) {
    row[field] = event.target.value;
  } else {
    row[field] = Number(event.target.value || 0);
  }
  saveDraft();
  renderRows();
}

function handleRowClick(event) {
  const removeButton = event.target.closest('[data-remove-row]');
  if (!removeButton) return;
  state.rows = state.rows.filter((row) => row.id !== removeButton.dataset.removeRow);
  saveDraft();
  renderRows();
}

function createRow(product = null) {
  const buyPrice = normalizeBuyPrice(product?.buyPrice);
  const template = getFirstRowExpenseTemplate();
  return {
    id: `row-${Date.now()}-${state.rowSeq++}`,
    productId: product?.id || '',
    model: product?.article || product?.code || '',
    photoColor: '',
    code: product?.code || '',
    article: product?.article || '',
    name: product?.name || '',
    boxSize: 0,
    boxesCount: 0,
    unitsPerBox: 0,
    buyPriceValue: buyPrice.value,
    buyPriceCurrency: buyPrice.currency || 'USD',
    quantity: 1,
    weightKg: 0,
    volumeM3: 0,
    packageWeightKg: 0,
    specification: '',
    declaration: template.declaration,
    seal: template.seal,
    temporaryStorage: template.temporaryStorage,
    escort: template.escort,
    delivery: template.delivery,
    broker: template.broker,
    other: template.other
  };
}

function hydrateRowsFromCatalog() {
  const byId = new Map(state.products.map((product) => [product.id, product]));
  state.rows = state.rows.map((row) => {
    const product = row.productId ? byId.get(row.productId) : null;
    if (!product) return row;
    const buyPrice = normalizeBuyPrice(product.buyPrice);
    return {
      ...row,
      model: row.model || product.article || product.code || '',
      code: product.code || row.code,
      article: product.article || row.article,
      name: product.name || row.name,
      buyPriceValue: buyPrice.value,
      buyPriceCurrency: buyPrice.currency
    };
  });
  saveDraft();
}

function renderSearchResults() {
  const query = normalizeSearch(els.productSearchInput.value);
  if (!query) {
    els.searchResults.innerHTML = '<div class="customs-empty">Каталог здесь необязателен. Можно сразу нажать «Добавить товар» и заполнить всё вручную.</div>';
    return;
  }
  const results = state.products
    .filter((product) => matchesProduct(product, query))
    .slice(0, 12);
  if (!results.length) {
    els.searchResults.innerHTML = '<div class="customs-empty">Ничего не найдено. Проверьте запрос или обновите каталог.</div>';
    return;
  }
  els.searchResults.innerHTML = results.map((product) => {
    const buyPrice = normalizeBuyPrice(product.buyPrice);
    return `<article class="customs-search-result">
      <div>
        <strong>${escapeHtml(product.name || 'Без названия')}</strong>
        <div class="customs-search-meta">
          <small>Код: ${escapeHtml(product.code || '—')}</small>
          <small>Артикул: ${escapeHtml(product.article || '—')}</small>
          <small>Закупка: ${escapeHtml(formatBuyPriceLabel(buyPrice))}</small>
        </div>
      </div>
      <button type="button" data-product-id="${escapeHtml(product.id)}">Добавить</button>
    </article>`;
  }).join('');
}

function renderRows() {
  if (!state.rows.length) {
    els.rowsList.innerHTML = '<div class="customs-empty">Пока нет товаров в расчёте. Нажмите «Добавить товар» и заполните позицию вручную.</div>';
    renderSummary();
    return;
  }
  const totalUnits = getTotalUnits();
  els.rowsList.innerHTML = state.rows.map((row, index) => {
    const calculation = calculateRow(row, totalUnits);
    return `<article class="customs-row-card" data-row-id="${escapeHtml(row.id)}">
      <div class="customs-row-head">
        <div class="customs-row-title">
          <span class="customs-row-badge">Товар ${index + 1}</span>
          <strong>${escapeHtml(row.name || `Новая позиция`)}</strong>
          <p>${row.code || row.article ? `Код: ${escapeHtml(row.code || '—')} · Артикул: ${escapeHtml(row.article || '—')}` : 'Полностью ручная строка товара.'}</p>
        </div>
        <button class="secondary danger customs-remove-button" type="button" data-remove-row="${escapeHtml(row.id)}">Удалить</button>
      </div>
      <div class="customs-row-section">
        <div class="customs-section-caption">Основное</div>
        <div class="customs-row-grid">
        <label>
          <span>Модель</span>
          <input data-field="model" type="text" value="${escapeAttr(row.model || '')}" placeholder="Например: KPA17">
        </label>
        <label>
          <span>Фото / цвет</span>
          <input data-field="photoColor" type="text" value="${escapeAttr(row.photoColor || '')}" placeholder="Например: белый / как на фото">
        </label>
        <label class="wide">
          <span>Название товара</span>
          <input data-field="name" type="text" value="${escapeAttr(row.name)}" placeholder="Например: кондиционер Midea">
        </label>
        <label>
          <span>Код</span>
          <input data-field="code" type="text" value="${escapeAttr(row.code)}" placeholder="Код товара">
        </label>
        <label>
          <span>Артикул</span>
          <input data-field="article" type="text" value="${escapeAttr(row.article || '')}" placeholder="Артикул / модель">
        </label>
        <label>
          <span>Кол-во шт. в партии</span>
          <input data-field="quantity" type="number" min="1" step="1" value="${numberValue(row.quantity, 1)}">
        </label>
        <label>
          <span>Размер внешней коробки, м³</span>
          <input data-field="boxSize" type="number" min="0" step="0.000001" value="${numberValue(row.boxSize)}">
        </label>
        <label>
          <span>Кол-во коробок</span>
          <input data-field="boxesCount" type="number" min="0" step="1" value="${numberValue(row.boxesCount)}">
        </label>
        <label>
          <span>Штук в коробке</span>
          <input data-field="unitsPerBox" type="number" min="0" step="1" value="${numberValue(row.unitsPerBox)}">
        </label>
        <label>
          <span>Общий вес, кг</span>
          <input data-field="weightKg" type="number" min="0" step="0.001" value="${numberValue(row.weightKg)}">
        </label>
        <label>
          <span>Вес за ед., кг</span>
          <input data-field="packageWeightKg" type="number" min="0" step="0.001" value="${numberValue(row.packageWeightKg)}">
        </label>
        <label>
          <span>Общий объем, м³</span>
          <input data-field="volumeM3" type="number" min="0" step="0.001" value="${numberValue(row.volumeM3)}">
        </label>
        <label class="customs-currency-field">
          <span>Валюта закупки</span>
          <select data-field="buyPriceCurrency">
            <option value="USD" ${row.buyPriceCurrency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="KGS" ${row.buyPriceCurrency === 'KGS' ? 'selected' : ''}>KGS</option>
          </select>
        </label>
        <label class="customs-buy-field">
          <span>Закупка за 1 шт (${escapeHtml(row.buyPriceCurrency)})</span>
          <input data-field="buyPriceValue" type="number" min="0" step="0.01" value="${numberValue(row.buyPriceValue)}">
        </label>
        <label class="wide">
          <span>Комплектация</span>
          <input data-field="specification" type="text" value="${escapeAttr(row.specification || '')}" placeholder="Краткое описание комплектации">
        </label>
        </div>
      </div>
      <div class="customs-row-section">
        <div class="customs-section-caption">Таможенные расходы за 1 шт</div>
        <div class="customs-row-grid">
        <label>
          <span>Декларация за 1 шт, сом</span>
          <input data-field="declaration" type="number" min="0" step="0.01" value="${numberValue(row.declaration)}">
        </label>
        <label>
          <span>Пломба за 1 шт, сом</span>
          <input data-field="seal" type="number" min="0" step="0.01" value="${numberValue(row.seal)}">
        </label>
        <label>
          <span>СВХ за 1 шт, сом</span>
          <input data-field="temporaryStorage" type="number" min="0" step="0.01" value="${numberValue(row.temporaryStorage)}">
        </label>
        <label>
          <span>Сопровождение за 1 шт, сом</span>
          <input data-field="escort" type="number" min="0" step="0.01" value="${numberValue(row.escort)}">
        </label>
        <label>
          <span>Доставка Китай → КР за 1 шт, сом</span>
          <input data-field="delivery" type="number" min="0" step="0.01" value="${numberValue(row.delivery)}">
        </label>
        <label>
          <span>Оформление брокера за 1 шт, сом</span>
          <input data-field="broker" type="number" min="0" step="0.01" value="${numberValue(row.broker)}">
        </label>
        <label>
          <span>Прочие расходы за 1 шт, сом</span>
          <input data-field="other" type="number" min="0" step="0.01" value="${numberValue(row.other)}">
        </label>
        </div>
      </div>
      <div class="customs-row-summary">
        <div class="customs-metric"><span>Цена за ед. (USD)</span><strong>${formatUsd(calculation.buyUnitUsd)}</strong></div>
        <div class="customs-metric"><span>Сумма (USD)</span><strong>${formatUsd(calculation.buyTotalUsd)}</strong></div>
        <div class="customs-metric"><span>Вес / объем</span><strong>${formatWeightVolume(row, calculation)}</strong></div>
        <div class="customs-metric"><span>Коробки / штуки</span><strong>${formatBoxes(row)}</strong></div>
        <div class="customs-metric"><span>Закупка партии</span><strong>${formatSom(calculation.buyTotalKgs)}</strong></div>
        <div class="customs-metric"><span>Доп. расходы за 1 шт</span><strong>${formatSom(calculation.expensesPerUnit)}</strong></div>
        <div class="customs-metric"><span>Доля растаможки</span><strong>${formatSom(calculation.customsShareTotal)}</strong></div>
        <div class="customs-metric"><span>Доп. расходы партии</span><strong>${formatSom(calculation.expensesTotal)}</strong></div>
        <div class="customs-metric"><span>Себестоимость 1 шт</span><strong>${formatSom(calculation.landedPerUnit)}</strong></div>
        <div class="customs-metric"><span>Себестоимость партии</span><strong>${formatSom(calculation.landedTotal)}</strong></div>
      </div>
    </article>`;
  }).join('');
  renderSummary();
}

function renderSummary() {
  const totalUnits = getTotalUnits();
  els.partyCustomsClearanceInput.value = numberValue(state.partyExpenses.customsClearance);
  const totals = state.rows.reduce((acc, row) => {
    const calculation = calculateRow(row, totalUnits);
    acc.rows += 1;
    acc.units += Math.max(0, Number(row.quantity || 0));
    acc.weight += calculation.totalWeightKg;
    acc.volume += calculation.totalVolumeM3;
    acc.buy += calculation.buyTotalKgs;
    acc.expenses += calculation.expensesTotal;
    acc.landed += calculation.landedTotal;
    acc.buyUsd += calculation.buyTotalUsd;
    return acc;
  }, { rows: 0, units: 0, weight: 0, volume: 0, buy: 0, buyUsd: 0, expenses: 0, landed: 0 });
  els.rowsCount.textContent = formatNumber(totals.rows);
  els.unitsCount.textContent = formatNumber(totals.units);
  els.weightTotal.textContent = formatMeasure(totals.weight, 'кг');
  els.volumeTotal.textContent = formatMeasure(totals.volume, 'м³');
  els.buyTotal.textContent = formatSom(totals.buy);
  els.expensesTotal.textContent = formatSom(totals.expenses);
  els.landedTotal.textContent = formatSom(totals.landed);
}

function calculateRow(row, totalUnits = getTotalUnits()) {
  const rate = Math.max(0, Number(els.usdRateInput.value || 0));
  const derivedQuantity = Number(row.boxesCount || 0) > 0 && Number(row.unitsPerBox || 0) > 0
    ? Number(row.boxesCount || 0) * Number(row.unitsPerBox || 0)
    : Number(row.quantity || 0);
  const quantity = Math.max(1, derivedQuantity || 1);
  const buyUnit = Math.max(0, Number(row.buyPriceValue || 0));
  const buyUnitUsd = row.buyPriceCurrency === 'USD' ? buyUnit : (rate > 0 ? buyUnit / rate : 0);
  const buyUnitKgs = row.buyPriceCurrency === 'USD' ? buyUnit * rate : buyUnit;
  const expensesPerUnit = roundMoney(
    Number(row.declaration || 0)
    + Number(row.seal || 0)
    + Number(row.temporaryStorage || 0)
    + Number(row.escort || 0)
    + Number(row.delivery || 0)
    + Number(row.broker || 0)
    + Number(row.other || 0)
  );
  const partyCustomsTotal = roundMoney(Number(state.partyExpenses.customsClearance || 0));
  const customsSharePerUnit = totalUnits > 0 ? roundMoney(partyCustomsTotal / totalUnits) : 0;
  const customsShareTotal = roundMoney(customsSharePerUnit * quantity);
  const expensesTotal = roundMoney(expensesPerUnit * quantity + customsShareTotal);
  const buyTotalUsd = roundMoney(buyUnitUsd * quantity);
  const buyTotalKgs = roundMoney(buyUnitKgs * quantity);
  const landedPerUnit = roundMoney(buyUnitKgs + expensesPerUnit + customsSharePerUnit);
  const landedTotal = roundMoney(landedPerUnit * quantity);
  const totalVolumeM3 = roundMoney(
    Number(row.volumeM3 || 0) > 0
      ? Number(row.volumeM3 || 0)
      : Number(row.boxSize || 0) * Math.max(0, Number(row.boxesCount || 0))
  );
  const totalWeightKg = roundMoney(
    Number(row.weightKg || 0) > 0
      ? Number(row.weightKg || 0)
      : Number(row.packageWeightKg || 0) * quantity
  );
  return { buyUnitUsd, buyTotalUsd, buyTotalKgs, expensesPerUnit, customsShareTotal, expensesTotal, landedPerUnit, landedTotal, totalVolumeM3, totalWeightKg };
}

function normalizeBuyPrice(buyPrice) {
  if (!buyPrice) {
    return {
      value: 0,
      currency: 'USD'
    };
  }
  const currencyText = normalizeSearch(`${buyPrice?.currencyIsoCode || ''} ${buyPrice?.currencyName || ''}`);
  const currency = currencyText.includes('usd') || currencyText.includes('доллар') ? 'USD' : 'KGS';
  return {
    value: roundMoney(Number(buyPrice?.value || 0)),
    currency
  };
}

function matchesProduct(product, query) {
  const haystack = normalizeSearch([
    product.name,
    product.code,
    product.article,
    product.pathName
  ].filter(Boolean).join(' '));
  return haystack.includes(query);
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    els.usdRateInput.value = String(Number(settings.usdRate || 89));
  } catch {
    els.usdRateInput.value = '89';
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    usdRate: Number(els.usdRateInput.value || 89)
  }));
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    state.rows = Array.isArray(draft.rows) ? draft.rows : [];
    state.rowSeq = Number(draft.rowSeq || 1);
    state.partyExpenses = {
      customsClearance: Number(draft.partyExpenses?.customsClearance || 0)
    };
  } catch {
    state.rows = [];
    state.rowSeq = 1;
    state.partyExpenses = { customsClearance: 0 };
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    rows: state.rows,
    rowSeq: state.rowSeq,
    partyExpenses: state.partyExpenses
  }));
}

function getTotalUnits() {
  return state.rows.reduce((sum, row) => {
    const derivedQuantity = Number(row.boxesCount || 0) > 0 && Number(row.unitsPerBox || 0) > 0
      ? Number(row.boxesCount || 0) * Number(row.unitsPerBox || 0)
      : Number(row.quantity || 0);
    return sum + Math.max(0, Number(derivedQuantity || 0));
  }, 0);
}

function getFirstRowExpenseTemplate() {
  const firstRow = state.rows[0];
  if (!firstRow) {
    return {
      declaration: 0,
      seal: 0,
      temporaryStorage: 0,
      escort: 0,
      delivery: 0,
      broker: 0,
      other: 0
    };
  }
  return {
    declaration: Number(firstRow.declaration || 0),
    seal: Number(firstRow.seal || 0),
    temporaryStorage: Number(firstRow.temporaryStorage || 0),
    escort: Number(firstRow.escort || 0),
    delivery: Number(firstRow.delivery || 0),
    broker: Number(firstRow.broker || 0),
    other: Number(firstRow.other || 0)
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса.');
  return data;
}

function formatSom(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function formatBuyPriceLabel(buyPrice) {
  if (!Number(buyPrice.value || 0)) return 'нет закупки';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(buyPrice.value || 0))} ${buyPrice.currency}`;
}

function formatWeightVolume(row, calculation = null) {
  const totalWeight = calculation?.totalWeightKg ?? Number(row.weightKg || 0);
  const totalVolume = calculation?.totalVolumeM3 ?? Number(row.volumeM3 || 0);
  return `${formatMeasure(totalWeight, 'кг')} / ${formatMeasure(totalVolume, 'м³')}`;
}

function formatMeasure(value, unit) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: amount > 0 && amount < 1 ? 3 : 0, maximumFractionDigits: 3 }).format(amount)} ${unit}`;
}

function formatBoxes(row) {
  const boxes = Number(row.boxesCount || 0);
  const unitsPerBox = Number(row.unitsPerBox || 0);
  if (boxes > 0 && unitsPerBox > 0) {
    return `${formatNumber(boxes)} короб. × ${formatNumber(unitsPerBox)} шт`;
  }
  return `${formatNumber(boxes)} короб.`;
}

function formatUsd(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} USD`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function numberValue(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : String(fallback);
}
