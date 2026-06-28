import { initCrmShell } from './crm-shell.js';

const SETTINGS_KEY = 'ordoCustomsCalculatorSettings';
const DRAFT_KEY = 'ordoCustomsCalculatorDraft';
const PAGE_LIMIT = 500;

const DEFAULT_PARTY_EXPENSES = {
  customsClearance: 0,
  temporaryStorage: 0,
  declaration: 0,
  processing: 0,
  seal: 0,
  escort: 0,
  deliveryUsd: 0,
  distributionMode: 'greater'
};

const state = {
  products: [],
  rows: [],
  partyExpenses: { ...DEFAULT_PARTY_EXPENSES },
  history: [],
  user: null,
  loading: false,
  rowSeq: 1
};

const els = Object.fromEntries([
  'customsPanel',
  'usdRateInput',
  'productSearchInput',
  'reloadCatalogButton',
  'addManualRowButton',
  'saveHistoryButton',
  'historyButton',
  'clearRowsButton',
  'historyPanel',
  'historyList',
  'searchResults',
  'catalogStatus',
  'rowsList',
  'rowsCount',
  'unitsCount',
  'weightTotal',
  'tonsTotal',
  'volumeTotal',
  'buyTotal',
  'profitTotal',
  'expensesTotal',
  'landedTotal',
  'partyCustomsClearanceInput',
  'partyTemporaryStorageInput',
  'partyDeclarationInput',
  'partyProcessingInput',
  'partySealInput',
  'partyEscortInput',
  'partyDeliveryUsdInput',
  'partyDistributionModeSelect',
  'partyCommonKgsTotal',
  'partyCommonUsdTotal',
  'partyCommonUsdWithDeliveryTotal',
  'partyWeightFormulaRate',
  'partyRatePerBase',
  'partyRatePerTon',
  'productSummaryTable'
].map((id) => [id, document.querySelector(`#${id}`)]));

init();

async function init() {
  bindEvents();
  loadSettings();
  loadDraft();
  const user = await initCrmShell({ page: 'customsCalculator', allowedRoles: ['admin', 'owner', 'accountant', 'manager'] });
  if (!user) return;
  state.user = user;
  els.customsPanel.classList.remove('hidden');
  renderRows();
  renderSearchResults();
  await loadRemoteHistory();
  await loadCatalog();
}

function bindEvents() {
  els.usdRateInput.addEventListener('change', () => {
    saveSettings();
    saveDraft();
    renderRows();
  });
  bindPartyExpenseField(els.partyCustomsClearanceInput, 'customsClearance');
  bindPartyExpenseField(els.partyTemporaryStorageInput, 'temporaryStorage');
  bindPartyExpenseField(els.partyDeclarationInput, 'declaration');
  bindPartyExpenseField(els.partyProcessingInput, 'processing');
  bindPartyExpenseField(els.partySealInput, 'seal');
  bindPartyExpenseField(els.partyEscortInput, 'escort');
  bindPartyExpenseField(els.partyDeliveryUsdInput, 'deliveryUsd');
  els.partyDistributionModeSelect.addEventListener('change', () => {
    state.partyExpenses.distributionMode = els.partyDistributionModeSelect.value || 'greater';
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
  els.saveHistoryButton.addEventListener('click', saveCurrentToHistory);
  els.historyButton.addEventListener('click', () => {
    els.historyPanel.classList.toggle('hidden');
  });
  els.clearRowsButton.addEventListener('click', () => {
    if (!window.confirm('Очистить все строки калькулятора?')) return;
    state.rows = [];
    saveDraft();
    renderRows();
  });
  els.historyList.addEventListener('click', handleHistoryClick);
  els.searchResults.addEventListener('click', handleSearchResultsClick);
  els.rowsList.addEventListener('change', handleRowInput);
  els.rowsList.addEventListener('click', handleRowClick);
}

function bindPartyExpenseField(element, key) {
  element.addEventListener('change', () => {
    state.partyExpenses[key] = Number(element.value || 0);
    saveDraft();
    renderRows();
  });
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
    els.catalogStatus.textContent = `Каталог загружен: ${formatNumber(products.length)} товаров. Каталог нужен только как быстрый помощник.`;
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
  const rowId = rowElement.dataset.rowId;
  const row = state.rows.find((item) => item.id === rowId);
  if (!row) return;
  const field = event.target.dataset.field;
  if (!field) return;
  const nextValue = ['name', 'code', 'article', 'buyPriceCurrency', 'model', 'photoColor', 'specification', 'boxVariant', 'paymentType'].includes(field)
    ? event.target.value
    : Number(event.target.value || 0);
  row[field] = nextValue;
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

function handleHistoryClick(event) {
  const button = event.target.closest('[data-history-id]');
  if (!button) return;
  restoreHistoryItem(button.dataset.historyId);
}

function createRow(product = null) {
  const buyPrice = normalizeBuyPrice(product?.buyPrice);
  return {
    id: `row-${Date.now()}-${state.rowSeq++}`,
    productId: product?.id || '',
    model: product?.article || product?.code || '',
    photoColor: '',
    code: product?.code || '',
    article: product?.article || '',
    name: product?.name || '',
    boxVariant: 'single',
    boxSize: 0,
    boxesCount: 0,
    unitsPerBox: 0,
    masterBoxVolume: 0,
    buyPriceValue: buyPrice.value,
    buyPriceCurrency: buyPrice.currency || 'USD',
    paymentType: 'cashless',
    quantity: 1,
    packageWeightKg: 0,
    profitPerUnitUsd: 0,
    specification: '',
    otherPerUnitUsd: 0
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
    renderProductSummaryTable();
    renderSummary();
    return;
  }
  const context = buildPartyContext();
  els.rowsList.innerHTML = state.rows.map((row, index) => {
    const calculation = calculateRow(row, context);
    return `<article class="customs-row-card" data-row-id="${escapeHtml(row.id)}">
      <div class="customs-row-head">
        <div class="customs-row-title">
          <span class="customs-row-badge">Товар ${index + 1}</span>
          <strong>${escapeHtml(row.name || 'Новая позиция')}</strong>
          <p>Позиция для расчёта себестоимости партии.</p>
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
          <label class="wide">
            <span>Название товара</span>
            <input data-field="name" type="text" value="${escapeAttr(row.name || '')}" placeholder="Например: пылесос Ordo">
          </label>
          <label>
            <span>Кол-во шт. в партии</span>
            <input data-field="quantity" type="number" min="1" step="1" value="${numberValue(calculation.quantity, 1)}">
          </label>
          <label>
            <span>Тип коробки</span>
            <select data-field="boxVariant">
              <option value="single" ${row.boxVariant === 'single' ? 'selected' : ''}>Обычная коробка</option>
              <option value="master" ${row.boxVariant === 'master' ? 'selected' : ''}>Мастер-коробка</option>
            </select>
          </label>
          <label>
            <span>${row.boxVariant === 'master' ? 'Кол-во мастер-коробок' : 'Кол-во коробок'}</span>
            <input data-field="boxesCount" type="number" min="0" step="1" value="${numberValue(row.boxesCount)}">
          </label>
          ${row.boxVariant === 'master' ? `
          <label>
            <span>Штук в коробке</span>
            <input data-field="unitsPerBox" type="number" min="0" step="1" value="${numberValue(row.unitsPerBox)}">
          </label>
          <label>
            <span>Объём 1 мастер-коробки, м³</span>
            <input data-field="masterBoxVolume" type="number" min="0" step="0.000001" value="${numberValue(row.masterBoxVolume)}">
          </label>` : `
          <label>
            <span>Объём 1 коробки, м³</span>
            <input data-field="boxSize" type="number" min="0" step="0.000001" value="${numberValue(row.boxSize)}">
          </label>`}
          <label>
            <span>Вес 1 шт, кг</span>
            <input data-field="packageWeightKg" type="number" min="0" step="0.001" value="${numberValue(row.packageWeightKg)}">
          </label>
          <label class="customs-currency-field">
            <span>Валюта закупки</span>
            <select data-field="buyPriceCurrency">
              <option value="USD" ${row.buyPriceCurrency === 'USD' ? 'selected' : ''}>USD</option>
              <option value="KGS" ${row.buyPriceCurrency === 'KGS' ? 'selected' : ''}>KGS</option>
            </select>
          </label>
          <label>
            <span>Тип оплаты</span>
            <select data-field="paymentType">
              <option value="cashless" ${row.paymentType === 'cashless' ? 'selected' : ''}>Безналичка 2%</option>
              <option value="cash" ${row.paymentType === 'cash' ? 'selected' : ''}>Наличка 4%</option>
            </select>
          </label>
          <label class="customs-buy-field">
            <span>Закупка за 1 шт (${escapeHtml(row.buyPriceCurrency || 'USD')})</span>
            <input data-field="buyPriceValue" type="number" min="0" step="0.01" value="${numberValue(row.buyPriceValue)}">
          </label>
          <label>
            <span>Прибыль за 1 шт, USD</span>
            <input data-field="profitPerUnitUsd" type="number" min="0" step="0.01" value="${numberValue(row.profitPerUnitUsd)}">
          </label>
          <label>
            <span>Прочие расходы за 1 шт, USD</span>
            <input data-field="otherPerUnitUsd" type="number" min="0" step="0.01" value="${numberValue(row.otherPerUnitUsd)}">
          </label>
          <label class="wide">
            <span>Комплектация</span>
            <input data-field="specification" type="text" value="${escapeAttr(row.specification || '')}" placeholder="Описание комплектации">
          </label>
        </div>
      </div>
      <div class="customs-row-summary">
        <div class="customs-metric"><span>Цена за ед. (USD)</span><strong>${formatUsd(calculation.buyUnitUsd)}</strong></div>
        <div class="customs-metric"><span>Сумма закупки (USD)</span><strong>${formatUsd(calculation.buyTotalUsd)}</strong></div>
        <div class="customs-metric"><span>Вес / объём</span><strong>${formatWeightVolume(calculation)}</strong></div>
        <div class="customs-metric"><span>Вес партии</span><strong>${formatMeasure(calculation.totalWeightKg, 'кг')}</strong></div>
        <div class="customs-metric"><span>Коробки / штуки</span><strong>${formatBoxes(row, calculation.quantity)}</strong></div>
        <div class="customs-metric"><span>База распределения</span><strong>${formatMeasureValue(calculation.distributionBaseTotal)}</strong></div>
        <div class="customs-metric"><span>Ставка общих расходов</span><strong>${formatUsd(calculation.sharedRateUsd)}</strong></div>
        <div class="customs-metric"><span>Нагрузка на 1 шт</span><strong>${formatUsd(calculation.sharedPerUnitUsd)}</strong></div>
        <div class="customs-metric"><span>Прибыль по строке</span><strong>${formatUsd(calculation.profitTotalUsd)}</strong></div>
        <div class="customs-metric"><span>Налог ${calculation.taxRateLabel}</span><strong>${formatUsd(calculation.taxTotalUsd)}</strong></div>
        <div class="customs-metric"><span>Доп. на строку</span><strong>${formatUsd(calculation.otherTotalUsd)}</strong></div>
        <div class="customs-metric"><span>Себестоимость 1 шт</span><strong>${formatUsd(calculation.landedPerUnitUsd)}</strong></div>
        <div class="customs-metric"><span>Итог 1 шт с налогом</span><strong>${formatUsd(calculation.finalPerUnitUsd)}</strong></div>
        <div class="customs-metric"><span>Итог партии с налогом</span><strong>${formatUsd(calculation.finalTotalUsd)}</strong></div>
      </div>
    </article>`;
  }).join('');
  renderProductSummaryTable(context);
  renderSummary();
}

function renderHistoryList() {
  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="customs-empty">История пока пустая.</div>';
    return;
  }
  els.historyList.innerHTML = state.history.map((item) => `<article class="customs-history-item">
    <div>
      <strong>${escapeHtml(item.title || 'Без названия')}</strong>
      <small>${escapeHtml(formatDateTime(item.updated_at || item.created_at))}</small>
    </div>
    <button type="button" data-history-id="${escapeHtml(item.id)}">Загрузить</button>
  </article>`).join('');
}

function renderProductSummaryTable(context = buildPartyContext()) {
  if (!state.rows.length) {
    els.productSummaryTable.innerHTML = '<div class="customs-empty">Таблица появится после добавления товаров.</div>';
    return;
  }
  const rows = state.rows.map((row) => {
    const calculation = calculateRow(row, context);
    return `<tr>
      <td>${escapeHtml(row.name || row.model || 'Без названия')}</td>
      <td>${formatNumber(calculation.quantity)}</td>
      <td>${formatUsd(calculation.finalPerUnitUsd)}</td>
      <td>${formatVolumePerUnit(row, calculation)}</td>
      <td>${formatUsd(calculation.finalTotalUsd)}</td>
    </tr>`;
  }).join('');
  els.productSummaryTable.innerHTML = `<table>
    <thead>
      <tr>
        <th>Название товара</th>
        <th>Количество</th>
        <th>Цена за 1 товар</th>
        <th>Объём 1 товара</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderSummary() {
  const context = buildPartyContext();
  els.partyCustomsClearanceInput.value = numberValue(state.partyExpenses.customsClearance);
  els.partyTemporaryStorageInput.value = numberValue(state.partyExpenses.temporaryStorage);
  els.partyDeclarationInput.value = numberValue(state.partyExpenses.declaration);
  els.partyProcessingInput.value = numberValue(state.partyExpenses.processing);
  els.partySealInput.value = numberValue(state.partyExpenses.seal);
  els.partyEscortInput.value = numberValue(state.partyExpenses.escort);
  els.partyDeliveryUsdInput.value = numberValue(state.partyExpenses.deliveryUsd);
  els.partyDistributionModeSelect.value = state.partyExpenses.distributionMode || 'greater';
  els.partyCommonKgsTotal.textContent = formatSom(context.commonKgs);
  els.partyCommonUsdTotal.textContent = formatUsd(context.commonUsd);
  els.partyCommonUsdWithDeliveryTotal.textContent = formatUsd(context.totalCommonUsd);
  els.partyWeightFormulaRate.textContent = `${formatUsd(context.weightFormulaRateUsd)} / 1 кг`;
  els.partyRatePerBase.textContent = `${formatUsd(context.sharedRateUsd)} / ${context.distributionBasis === 'объем' ? '1 м³' : '1 кг'}`;
  els.partyRatePerTon.textContent = formatUsd(context.ratePerTonUsd);

  const totals = state.rows.reduce((acc, row) => {
    const calculation = calculateRow(row, context);
    acc.rows += 1;
    acc.units += calculation.quantity;
    acc.weight += calculation.totalWeightKg;
    acc.volume += calculation.totalVolumeM3;
    acc.buyUsd += calculation.buyTotalUsd;
    acc.profitUsd += calculation.profitTotalUsd;
    acc.expensesUsd += calculation.sharedCostTotalUsd + calculation.otherTotalUsd + calculation.taxTotalUsd + calculation.profitTotalUsd;
    acc.landedUsd += calculation.finalTotalUsd;
    return acc;
  }, { rows: 0, units: 0, weight: 0, volume: 0, buyUsd: 0, profitUsd: 0, expensesUsd: 0, landedUsd: 0 });

  els.rowsCount.textContent = formatNumber(totals.rows);
  els.unitsCount.textContent = formatNumber(totals.units);
  els.weightTotal.textContent = formatMeasure(totals.weight, 'кг');
  els.tonsTotal.textContent = formatMeasure(totals.weight / 1000, 'т');
  els.volumeTotal.textContent = formatMeasure(totals.volume, 'м³');
  els.buyTotal.textContent = formatUsd(totals.buyUsd);
  els.profitTotal.textContent = formatUsd(totals.profitUsd);
  els.expensesTotal.textContent = formatUsd(totals.expensesUsd);
  els.landedTotal.textContent = formatUsd(totals.landedUsd);
}

function buildPartyContext() {
  const rate = Math.max(0, Number(els.usdRateInput.value || 0));
  const commonKgs = roundMoney(
    Number(state.partyExpenses.customsClearance || 0)
    + Number(state.partyExpenses.temporaryStorage || 0)
    + Number(state.partyExpenses.declaration || 0)
    + Number(state.partyExpenses.processing || 0)
    + Number(state.partyExpenses.seal || 0)
    + Number(state.partyExpenses.escort || 0)
  );
  const commonUsd = roundMoney(rate > 0 ? commonKgs / rate : 0);
  const deliveryUsd = roundMoney(Number(state.partyExpenses.deliveryUsd || 0));
  const totalCommonUsd = roundMoney(commonUsd + deliveryUsd);

  const totals = state.rows.reduce((acc, row) => {
    const quantity = getRowQuantity(row);
    const totalWeightKg = getRowTotalWeightKg(row, quantity);
    const totalVolumeM3 = getRowTotalVolumeM3(row);
    acc.units += quantity;
    acc.weight += totalWeightKg;
    acc.volume += totalVolumeM3;
    return acc;
  }, { units: 0, weight: 0, volume: 0 });

  const mode = state.partyExpenses.distributionMode || 'greater';
  let denominator = totals.weight;
  let basis = 'вес';
  if (mode === 'volume') {
    denominator = totals.volume;
    basis = 'объем';
  } else if (mode === 'greater') {
    const useVolume = totals.volume > totals.weight;
    denominator = useVolume ? totals.volume : totals.weight;
    basis = useVolume ? 'объем' : 'вес';
  }

  const sharedRateUsd = denominator > 0 ? roundMoney(totalCommonUsd / denominator) : 0;
  const weightFormulaRateUsd = totals.weight > 0 ? roundMoney(totalCommonUsd / totals.weight) : 0;
  const ratePerTonUsd = totals.weight > 0 ? roundMoney(totalCommonUsd / (totals.weight / 1000)) : 0;
  return {
    rate,
    units: totals.units,
    weight: roundMoney(totals.weight),
    volume: roundMoney(totals.volume),
    commonKgs,
    commonUsd,
    deliveryUsd,
    totalCommonUsd,
    distributionMode: mode,
    distributionBasis: basis,
    distributionDenominator: roundMoney(denominator),
    sharedRateUsd,
    weightFormulaRateUsd,
    ratePerTonUsd
  };
}

function calculateRow(row, context = buildPartyContext()) {
  const quantity = getRowQuantity(row);
  const buyUnit = Math.max(0, Number(row.buyPriceValue || 0));
  const buyUnitUsd = row.buyPriceCurrency === 'USD'
    ? buyUnit
    : (context.rate > 0 ? roundMoney(buyUnit / context.rate) : 0);
  const buyTotalUsd = roundMoney(buyUnitUsd * quantity);
  const totalWeightKg = getRowTotalWeightKg(row, quantity);
  const totalVolumeM3 = getRowTotalVolumeM3(row);

  let distributionBaseTotal = totalWeightKg;
  let distributionBaseUnit = quantity > 0 ? totalWeightKg / quantity : 0;
  if (context.distributionBasis === 'объем') {
    distributionBaseTotal = totalVolumeM3;
    distributionBaseUnit = quantity > 0 ? totalVolumeM3 / quantity : 0;
  }

  const sharedCostTotalUsd = roundMoney(distributionBaseTotal * context.sharedRateUsd);
  const sharedPerUnitUsd = quantity > 0 ? roundMoney(sharedCostTotalUsd / quantity) : 0;
  const otherPerUnitUsd = roundMoney(Number(row.otherPerUnitUsd || 0));
  const otherTotalUsd = roundMoney(otherPerUnitUsd * quantity);
  const profitPerUnitUsd = roundMoney(Number(row.profitPerUnitUsd || 0));
  const profitTotalUsd = roundMoney(profitPerUnitUsd * quantity);
  const landedPerUnitUsd = roundMoney(buyUnitUsd + sharedPerUnitUsd + otherPerUnitUsd);
  const landedTotalUsd = roundMoney(landedPerUnitUsd * quantity);
  const taxRate = row.paymentType === 'cash' ? 0.04 : 0.02;
  const taxRateLabel = row.paymentType === 'cash' ? '4%' : '2%';
  const taxableBasePerUnitUsd = roundMoney(landedPerUnitUsd + profitPerUnitUsd);
  const taxableBaseTotalUsd = roundMoney(taxableBasePerUnitUsd * quantity);
  const taxPerUnitUsd = roundMoney(taxableBasePerUnitUsd * taxRate);
  const taxTotalUsd = roundMoney(taxPerUnitUsd * quantity);
  const finalPerUnitUsd = roundMoney(taxableBasePerUnitUsd + taxPerUnitUsd);
  const finalTotalUsd = roundMoney(finalPerUnitUsd * quantity);

  return {
    quantity,
    buyUnitUsd,
    buyTotalUsd,
    totalWeightKg,
    totalVolumeM3,
    distributionBaseTotal: roundMoney(distributionBaseTotal),
    distributionBaseUnit: roundMoney(distributionBaseUnit),
    sharedRateUsd: context.sharedRateUsd,
    sharedCostTotalUsd,
    sharedPerUnitUsd,
    profitPerUnitUsd,
    profitTotalUsd,
    taxableBasePerUnitUsd,
    taxableBaseTotalUsd,
    taxRate,
    taxRateLabel,
    taxPerUnitUsd,
    taxTotalUsd,
    otherPerUnitUsd,
    otherTotalUsd,
    landedPerUnitUsd,
    landedTotalUsd,
    finalPerUnitUsd,
    finalTotalUsd
  };
}

function getRowQuantity(row) {
  const byBoxes = Number(row.boxesCount || 0) > 0 && Number(row.unitsPerBox || 0) > 0
    ? Number(row.boxesCount || 0) * Number(row.unitsPerBox || 0)
    : Number(row.quantity || 0);
  return Math.max(1, Number(byBoxes || 1));
}

function getRowTotalWeightKg(row, quantity = getRowQuantity(row)) {
  if (Number(row.packageWeightKg || 0) > 0) {
    return roundMoney(Number(row.packageWeightKg || 0) * quantity);
  }
  // Fallback only for old drafts created before per-unit weight became the single source.
  if (Number(row.weightKg || 0) > 0) return roundMoney(Number(row.weightKg || 0));
  return roundMoney(Number(row.packageWeightKg || 0) * quantity);
}

function getRowTotalVolumeM3(row) {
  if (row.boxVariant === 'master') {
    return roundMoney(Number(row.masterBoxVolume || 0) * Math.max(0, Number(row.boxesCount || 0)));
  }
  return roundMoney(Number(row.boxSize || 0) * Math.max(0, Number(row.boxesCount || 0)));
}

function normalizeBuyPrice(buyPrice) {
  if (!buyPrice) {
    return { value: 0, currency: 'USD' };
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
      ...DEFAULT_PARTY_EXPENSES,
      ...(draft.partyExpenses || {})
    };
  } catch {
    state.rows = [];
    state.rowSeq = 1;
    state.partyExpenses = { ...DEFAULT_PARTY_EXPENSES };
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    rows: state.rows,
    rowSeq: state.rowSeq,
    partyExpenses: state.partyExpenses
  }));
}

async function loadRemoteHistory() {
  try {
    const data = await api('/api/customs-calculator/history');
    state.history = Array.isArray(data.rows) ? data.rows : [];
    renderHistoryList();
  } catch {
    state.history = [];
    renderHistoryList();
  }
}

async function saveCurrentToHistory() {
  const title = window.prompt('Название для истории', buildHistoryTitle());
  if (title === null) return;
  const draft = {
    rows: state.rows,
    rowSeq: state.rowSeq,
    partyExpenses: state.partyExpenses
  };
  try {
    const data = await api('/api/customs-calculator/history', {
      method: 'POST',
      body: { title, draft }
    });
    if (data.row) {
      state.history.unshift(data.row);
      state.history = state.history.slice(0, 30);
      renderHistoryList();
      els.historyPanel.classList.remove('hidden');
    }
  } catch (error) {
    window.alert(error.message || 'Не удалось сохранить в историю.');
  }
}

async function restoreHistoryItem(id) {
  try {
    const data = await api(`/api/customs-calculator/history/${encodeURIComponent(id)}`);
    const payload = data.row?.payload || {};
    state.rows = Array.isArray(payload.rows) ? payload.rows : [];
    state.rowSeq = Number(payload.rowSeq || 1);
    state.partyExpenses = {
      ...DEFAULT_PARTY_EXPENSES,
      ...(payload.partyExpenses || {})
    };
    saveDraft();
    renderRows();
  } catch (error) {
    window.alert(error.message || 'Не удалось загрузить запись истории.');
  }
}

function buildHistoryTitle() {
  const first = state.rows.find((row) => String(row.name || row.model || '').trim());
  const base = first ? String(first.name || first.model).trim() : 'Расчет таможни';
  return `${base} • ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`;
}

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
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

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatSom(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`;
}

function formatUsd(value) {
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} USD`;
}

function formatMeasure(value, unit) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: amount > 0 && amount < 1 ? 3 : 0, maximumFractionDigits: 3 }).format(amount)} ${unit}`;
}

function formatMeasureValue(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: amount > 0 && amount < 1 ? 3 : 0, maximumFractionDigits: 3 }).format(amount);
}

function formatBuyPriceLabel(buyPrice) {
  if (!Number(buyPrice.value || 0)) return 'нет закупки';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(buyPrice.value || 0))} ${buyPrice.currency}`;
}

function formatWeightVolume(calculation) {
  return `${formatMeasure(calculation.totalWeightKg, 'кг')} / ${formatMeasure(calculation.totalVolumeM3, 'м³')}`;
}

function formatVolumePerUnit(row, calculation) {
  const quantity = Math.max(1, Number(calculation?.quantity || 1));
  const totalVolume = Number(calculation?.totalVolumeM3 || 0);
  const perUnit = totalVolume > 0 ? roundMoney(totalVolume / quantity) : 0;
  if (perUnit > 0) return formatMeasure(perUnit, 'м³');
  if (row.boxVariant === 'master') return formatMeasure(Number(row.masterBoxVolume || 0), 'м³');
  return formatMeasure(Number(row.boxSize || 0), 'м³');
}

function formatBoxes(row, quantity) {
  const boxes = Number(row.boxesCount || 0);
  const unitsPerBox = Number(row.unitsPerBox || 0);
  if (row.boxVariant === 'master' && boxes > 0 && unitsPerBox > 0) {
    return `${formatNumber(boxes)} мастер × ${formatNumber(unitsPerBox)} шт = ${formatNumber(quantity)} шт`;
  }
  if (boxes > 0 && unitsPerBox > 0) {
    return `${formatNumber(boxes)} короб. × ${formatNumber(unitsPerBox)} шт = ${formatNumber(quantity)} шт`;
  }
  return `${formatNumber(quantity)} шт`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
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
