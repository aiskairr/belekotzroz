import { initCrmShell } from './crm-shell.js';

const PAGE_SIZE = 100;
const LOAD_BATCH_SIZE = 500;
const SETTINGS_KEY = 'ordoPriceFormulaPageV2';

const state = {
  products: [],
  priceTypes: [],
  folders: [],
  selected: new Set(),
  calculated: new Map(),
  skipped: new Map(),
  page: 1,
  total: 0,
  loadingCatalog: false,
  loadGeneration: 0,
  supplyFilter: null,
  supplyName: '',
  productTemplates: new Map()
};

const els = Object.fromEntries([
  'formulaPanel', 'priceType36Select', 'priceType912Select', 'priceTypeWholesaleSelect', 'usdRateInput', 'markupInput',
  'markupModeSelect', 'bank36Input', 'bank912Input', 'calculate36Input', 'calculate912Input', 'roundingSelect', 'searchInput', 'folderSelect', 'folderLabel',
  'supplyProductsButton', 'selectFolderButton', 'reloadButton',
  'calculateButton', 'catalogCount', 'selectedCount', 'changedCount', 'skippedCount', 'catalogStatus',
  'saveButton', 'productRows', 'selectPage', 'prevPage', 'nextPage', 'pageLabel', 'templateSelect',
  'templateNameInput', 'saveTemplateButton', 'deleteTemplateButton', 'assignTemplateButton',
  'groupTemplateStatus', 'tierRows', 'addTierButton', 'wholesaleTierRows', 'addWholesaleTierButton',
  'fallbackMarkupModeSelect', 'fallbackMarkupInput', 'wholesaleFallbackMarkupModeSelect', 'wholesaleFallbackMarkupInput'
].map((id) => [id, document.querySelector(`#${id}`)]));

init();

async function init() {
  bindEvents();
  loadSettings();
  renderTierRows(getTierSettings());
  renderWholesaleTierRows(getWholesaleTierSettings());
  renderTierVisibility();
  const user = await initCrmShell({ page: 'priceFormula', allowedRoles: ['admin', 'owner', 'accountant'] });
  if (user) await showPage();
}

function bindEvents() {
  els.reloadButton.addEventListener('click', loadCatalog);
  els.searchInput.addEventListener('input', resetPageAndRender);
  els.folderSelect.addEventListener('change', handleFolderChange);
  els.supplyProductsButton.addEventListener('click', selectSupplyProducts);
  els.selectFolderButton.addEventListener('click', selectFilteredProducts);
  els.templateSelect.addEventListener('change', applySelectedTemplate);
  els.saveTemplateButton.addEventListener('click', saveCurrentTemplate);
  els.deleteTemplateButton.addEventListener('click', deleteSelectedTemplate);
  els.assignTemplateButton.addEventListener('click', assignCurrentTemplateToFolder);
  els.addTierButton.addEventListener('click', () => addTierRow({ from: '', to: '', amount: '' }));
  els.addWholesaleTierButton.addEventListener('click', () => addWholesaleTierRow({ from: '', to: '', amount: '' }));
  els.tierRows.addEventListener('input', handleTierInput);
  els.tierRows.addEventListener('click', handleTierClick);
  els.wholesaleTierRows.addEventListener('input', handleTierInput);
  els.wholesaleTierRows.addEventListener('click', handleTierClick);

  for (const element of [
    els.priceType36Select,
    els.priceType912Select,
    els.priceTypeWholesaleSelect,
    els.usdRateInput,
    els.markupInput,
    els.markupModeSelect,
    els.bank36Input,
    els.bank912Input,
    els.calculate36Input,
    els.calculate912Input,
    els.roundingSelect,
    els.fallbackMarkupModeSelect,
    els.fallbackMarkupInput,
    els.wholesaleFallbackMarkupModeSelect,
    els.wholesaleFallbackMarkupInput
  ]) {
    element.addEventListener('change', () => {
      saveSettings();
      renderTierVisibility();
      state.calculated.clear();
      state.skipped.clear();
      render();
    });
  }

  els.calculateButton.addEventListener('click', calculateSelected);
  els.saveButton.addEventListener('click', saveChanges);
  els.selectPage.addEventListener('change', selectCurrentPage);
  els.prevPage.addEventListener('click', () => changePage(-1));
  els.nextPage.addEventListener('click', () => changePage(1));
  els.productRows.addEventListener('change', handleTableChange);
  els.productRows.addEventListener('input', syncPriceInputFromEvent);
}

async function showPage() {
  els.formulaPanel.classList.remove('hidden');
  await loadCatalog();
}

async function loadCatalog() {
  const generation = ++state.loadGeneration;
  state.loadingCatalog = true;
  state.products = [];
  state.priceTypes = [];
  state.folders = [];
  state.selected.clear();
  state.calculated.clear();
  state.skipped.clear();
  state.productTemplates.clear();
  state.supplyFilter = null;
  state.supplyName = '';
  state.total = 0;
  state.page = 1;
  els.productRows.innerHTML = '<tr><td colspan="13">Загружаю первые 500 товаров...</td></tr>';
  els.catalogStatus.textContent = 'Загружаю первые 500 товаров...';
  els.reloadButton.disabled = true;

  try {
    const data = await api(`/api/accounting/prices?offset=0&limit=${LOAD_BATCH_SIZE}`);
    if (generation !== state.loadGeneration) return;
    state.products = mergeProducts([], data.products);
    state.priceTypes = Array.isArray(data.priceTypes) ? data.priceTypes : [];
    state.folders = Array.isArray(data.folders) ? data.folders : [];
    state.total = Number(data.total || state.products.length);
    renderPriceTypes();
    renderFolders();
    renderTemplates();
    renderGroupTemplateStatus();
    els.catalogStatus.textContent = data.hasMore
      ? `Показаны первые ${state.products.length} товаров. Остальные загружаются в фоне.`
      : `Каталог загружен: ${state.products.length} товаров.`;
    render();
    if (data.hasMore) await loadRemainingCatalog(data.nextOffset, generation);
    else finishCatalogLoading(generation);
  } catch (error) {
    if (generation !== state.loadGeneration) return;
    els.catalogStatus.textContent = error.message;
    els.productRows.innerHTML = `<tr><td colspan="13">${escapeHtml(error.message)}</td></tr>`;
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
      const supplyMatched = selectProductsFromSupplyFilter();
      state.total = Number(data.total || state.total || state.products.length);
      offset = Number(data.nextOffset || state.products.length);
      els.catalogStatus.textContent = state.supplyFilter
        ? `Приемка ${state.supplyName}: выбрано ${supplyMatched} товаров. Каталог загружен ${state.products.length} из ${state.total}.`
        : `Загружено ${state.products.length} из ${state.total} товаров. Уже можно считать цены.`;
      renderFolders();
      render();
      if (!data.hasMore) break;
    }
    if (generation === state.loadGeneration) {
      const supplyMatched = selectProductsFromSupplyFilter();
      els.catalogStatus.textContent = state.supplyFilter
        ? `Приемка ${state.supplyName}: выбрано ${supplyMatched} товаров. Каталог полностью загружен.`
        : `Каталог полностью загружен: ${state.products.length} товаров.`;
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

function renderPriceTypes() {
  const options = state.priceTypes.map((type) =>
    `<option value="${escapeHtml(type.href)}">${escapeHtml(type.name)}</option>`
  ).join('');
  els.priceType36Select.innerHTML = options;
  els.priceType912Select.innerHTML = options;
  els.priceTypeWholesaleSelect.innerHTML = options;

  const type36 = findPriceType(['3-6', '3 6', '3-6м', '3 6м']);
  const type912 = findPriceType(['9-12', '9 12', '9-12м', '9 12м']);
  const wholesale = findPriceType(['оптов', 'wholesale']);
  if (type36) els.priceType36Select.value = type36.href;
  if (type912) els.priceType912Select.value = type912.href;
  if (wholesale) els.priceTypeWholesaleSelect.value = wholesale.href;
}

function renderFolders() {
  const current = els.folderSelect.value;
  const folders = getAvailableFolders();
  els.folderSelect.innerHTML = '<option value="">Все группы</option>' + folders.map((folder) =>
    `<option value="${escapeHtml(folder.href)}">${escapeHtml(getFolderDisplayName(folder))}</option>`
  ).join('');
  if (current && folders.some((folder) => folder.href === current)) {
    els.folderSelect.value = current;
  }
  updateFolderLabel();
  renderGroupTemplateStatus();
}

function getAvailableFolders() {
  const folders = new Map();
  for (const folder of state.folders) {
    if (folder?.href) folders.set(folder.href, folder);
  }
  for (const product of state.products) {
    const folder = product.folder;
    if (folder?.href && !folders.has(folder.href)) {
      folders.set(folder.href, folder);
    }
  }
  return [...folders.values()].sort((left, right) =>
    getFolderDisplayName(left).localeCompare(getFolderDisplayName(right), 'ru')
  );
}

function getFolderDisplayName(folder) {
  if (!folder) return 'Без названия';
  return [folder.pathName, folder.name].filter(Boolean).join(' / ') || folder.name || 'Без названия';
}

function renderTemplates() {
  const templates = getTemplates();
  const current = els.templateSelect.value;
  els.templateSelect.innerHTML = '<option value="">Выберите готовый шаблон</option>' + templates.map((template) =>
    `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)} — ${escapeHtml(template.folderName)}</option>`
  ).join('');
  if (current && templates.some((template) => template.id === current)) {
    els.templateSelect.value = current;
  }
  renderGroupTemplateStatus();
}

function applySelectedTemplate() {
  const template = getTemplates().find((item) => item.id === els.templateSelect.value);
  if (!template) return;
  applyTemplate(template);
  els.catalogStatus.textContent = `Шаблон применен: ${template.name}.`;
  render();
}

function applyTemplate(template) {
  els.templateNameInput.value = template.name || '';
  els.usdRateInput.value = String(template.usdRate ?? 89);
  els.markupInput.value = '0';
  els.markupModeSelect.value = 'tiers';
  renderTierRows(normalizeTiers(template.tiers));
  renderWholesaleTierRows(normalizeTiers(template.wholesaleTiers || template.tiers));
  renderTierVisibility();
  els.fallbackMarkupModeSelect.value = 'none';
  els.fallbackMarkupInput.value = '0';
  els.wholesaleFallbackMarkupModeSelect.value = 'none';
  els.wholesaleFallbackMarkupInput.value = '0';
  els.bank36Input.value = String(template.bank36 ?? 10);
  els.bank912Input.value = String(template.bank912 ?? 20);
  els.calculate36Input.checked = template.calculate36 !== false;
  els.calculate912Input.checked = template.calculate912 !== false;
  els.roundingSelect.value = String(template.rounding ?? 10);
  saveSettings();
  state.calculated.clear();
  state.skipped.clear();
}

async function saveCurrentTemplate() {
  const folderHref = els.folderSelect.value;
  const name = String(els.templateNameInput.value || '').trim();
  if (!folderHref) {
    els.catalogStatus.textContent = 'Сначала выберите группу или подгруппу для шаблона.';
    return;
  }
  if (!name) {
    els.catalogStatus.textContent = 'Введите название шаблона.';
    return;
  }

  const template = {
    id: folderHref,
    name,
    usdRate: Number(els.usdRateInput.value || 0),
    markup: 0,
    markupMode: 'tiers',
    tiers: getTierSettings(),
    wholesaleTiers: getWholesaleTierSettings(),
    fallbackMarkupMode: 'none',
    fallbackMarkup: 0,
    wholesaleFallbackMarkupMode: 'none',
    wholesaleFallbackMarkup: 0,
    bank36: Number(els.bank36Input.value || 0),
    bank912: Number(els.bank912Input.value || 0),
    calculate36: els.calculate36Input.checked,
    calculate912: els.calculate912Input.checked,
    rounding: Number(els.roundingSelect.value || 0)
  };
  await saveFolderTemplate(folderHref, template, `Шаблон «${template.name}» сохранен в выбранную группу.`);
}

async function deleteSelectedTemplate() {
  const template = getSelectedOrCurrentFolderTemplate();
  if (!template?.folderHref) {
    els.catalogStatus.textContent = 'Выберите группу или шаблон для удаления.';
    return;
  }
  await saveFolderTemplate(template.folderHref, null, `Шаблон удален из группы «${template.folderName}».`);
  els.templateNameInput.value = '';
}

async function assignCurrentTemplateToFolder() {
  const folderHref = els.folderSelect.value;
  const template = getTemplates().find((item) => item.id === els.templateSelect.value);
  if (!folderHref) return setStatus('Сначала выберите группу или подгруппу.');
  if (!template) return setStatus('Выберите готовый шаблон, который нужно скопировать.');
  await saveFolderTemplate(folderHref, { ...template, id: folderHref }, `Шаблон «${template.name}» скопирован в выбранную группу.`);
}

function getBoundTemplateForCurrentFolder() {
  const folderHref = els.folderSelect.value;
  if (!folderHref) return null;
  return getFolderByHref(folderHref)?.template || null;
}

function renderGroupTemplateStatus() {
  if (!els.groupTemplateStatus) return;
  const folderHref = els.folderSelect.value;
  if (!folderHref) {
    els.groupTemplateStatus.textContent = 'Выберите группу, чтобы назначить ей шаблон.';
    return;
  }
  const folder = getAvailableFolders().find((item) => item.href === folderHref);
  const template = getBoundTemplateForCurrentFolder();
  els.groupTemplateStatus.textContent = template
    ? `В группе «${getFolderDisplayName(folder)}» сохранен шаблон «${template.name}». При выборе группы он считается автоматически.`
    : `В группе «${getFolderDisplayName(folder)}» шаблон пока не сохранен. Настройте формулу сверху и нажмите «Сохранить в группу».`;
}

function getTemplates() {
  return getAvailableFolders()
    .filter((folder) => folder.template)
    .map((folder) => ({
      ...folder.template,
      id: folder.href,
      folderHref: folder.href,
      folderName: getFolderDisplayName(folder)
    }));
}

function getSelectedOrCurrentFolderTemplate() {
  const selected = getTemplates().find((item) => item.id === els.templateSelect.value);
  if (selected) return selected;
  const folder = getFolderByHref(els.folderSelect.value);
  return folder?.template ? {
    ...folder.template,
    id: folder.href,
    folderHref: folder.href,
    folderName: getFolderDisplayName(folder)
  } : null;
}

async function saveFolderTemplate(folderHref, template, successMessage) {
  els.saveTemplateButton.disabled = true;
  els.assignTemplateButton.disabled = true;
  els.deleteTemplateButton.disabled = true;
  els.catalogStatus.textContent = 'Сохраняю шаблон в МойСклад...';
  try {
    const result = await api('/api/accounting/price-formula/folder-template', {
      method: 'POST',
      body: { folderHref, template }
    });
    updateFolderTemplate(result.href || folderHref, result.template);
    renderTemplates();
    renderGroupTemplateStatus();
    els.templateSelect.value = result.template ? (result.href || folderHref) : '';
    els.catalogStatus.textContent = successMessage;
    return true;
  } catch (error) {
    els.catalogStatus.textContent = error.message;
    return false;
  } finally {
    els.saveTemplateButton.disabled = false;
    els.assignTemplateButton.disabled = false;
    els.deleteTemplateButton.disabled = false;
  }
}

function updateFolderTemplate(folderHref, template) {
  for (const folder of state.folders) {
    if (folder.href === folderHref) {
      folder.template = template;
    }
  }
  for (const product of state.products) {
    if (product.folder?.href === folderHref) {
      product.folder.template = template;
    }
  }
}

function getFolderByHref(folderHref) {
  return getAvailableFolders().find((folder) => folder.href === folderHref) || null;
}

function updateFolderLabel() {
  if (!els.folderLabel) return;
  const folder = getFolderByHref(els.folderSelect.value);
  els.folderLabel.value = folder ? getFolderDisplayName(folder) : 'Все группы';
}

function renderTierVisibility() {
  els.markupModeSelect.value = 'tiers';
}

function renderTierRows(tiers) {
  els.tierRows.innerHTML = '';
  for (const tier of normalizeTiers(tiers)) {
    addTierRow(tier, { persist: false });
  }
}

function renderWholesaleTierRows(tiers) {
  els.wholesaleTierRows.innerHTML = '';
  for (const tier of normalizeTiers(tiers)) {
    addWholesaleTierRow(tier, { persist: false });
  }
}

function addTierRow(tier = {}, options = { persist: true }) {
  addTierRowTo(els.tierRows, tier, options);
}

function addWholesaleTierRow(tier = {}, options = { persist: true }) {
  addTierRowTo(els.wholesaleTierRows, tier, options);
}

function addTierRowTo(container, tier = {}, options = { persist: true }) {
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.innerHTML = `
    <input data-tier-field="from" type="number" min="0" step="0.01" placeholder="20" value="${escapeHtml(tier.from ?? '')}">
    <input data-tier-field="to" type="number" min="0" step="0.01" placeholder="40" value="${escapeHtml(tier.to ?? '')}">
    <input data-tier-field="amount" type="number" min="0" step="0.01" placeholder="1500" value="${escapeHtml(tier.amount ?? '')}">
    <select data-tier-field="currency">
      <option value="kgs" ${normalizeTierCurrency(tier.currency) === 'kgs' ? 'selected' : ''}>сом</option>
      <option value="usd" ${normalizeTierCurrency(tier.currency) === 'usd' ? 'selected' : ''}>USD</option>
    </select>
    <button class="secondary danger" data-remove-tier type="button">Удалить</button>
  `;
  container.append(row);
  if (options.persist) saveSettings();
}

function handleTierInput() {
  saveSettings();
  state.calculated.clear();
  state.skipped.clear();
  render();
}

function handleTierClick(event) {
  const removeButton = event.target.closest('[data-remove-tier]');
  if (!removeButton) return;
  const container = removeButton.closest('#wholesaleTierRows') || removeButton.closest('#tierRows');
  removeButton.closest('.tier-row')?.remove();
  if (container === els.wholesaleTierRows && !getWholesaleTierSettings().length) {
    renderWholesaleTierRows(getDefaultTiers());
  } else if (container === els.tierRows && !getTierSettings().length) {
    renderTierRows(getDefaultTiers());
  }
  saveSettings();
  state.calculated.clear();
  state.skipped.clear();
  render();
}

function getTierSettings() {
  return getTierSettingsFrom(els.tierRows);
}

function getWholesaleTierSettings() {
  return getTierSettingsFrom(els.wholesaleTierRows);
}

function getTierSettingsFrom(container) {
  return [...container.querySelectorAll('.tier-row')].map((row) => ({
    from: row.querySelector('[data-tier-field="from"]')?.value || '',
    to: row.querySelector('[data-tier-field="to"]')?.value || '',
    amount: row.querySelector('[data-tier-field="amount"]')?.value || '',
    currency: normalizeTierCurrency(row.querySelector('[data-tier-field="currency"]')?.value)
  })).filter((tier) => tier.from !== '' || tier.to !== '' || tier.amount !== '');
}

function getParsedTiers() {
  return parseTiers(getTierSettings());
}

function getParsedWholesaleTiers() {
  return parseTiers(getWholesaleTierSettings());
}

function parseTiers(tiers) {
  return normalizeTiers(tiers).map((tier) => ({
    from: toOptionalNumber(tier.from, 0),
    to: toOptionalNumber(tier.to, Infinity),
    amount: Number(tier.amount),
    currency: normalizeTierCurrency(tier.currency)
  })).filter((tier) =>
    Number.isFinite(tier.from)
      && tier.to > tier.from
      && Number.isFinite(tier.amount)
      && tier.amount >= 0
  ).sort((left, right) => left.from - right.from);
}

function normalizeTiers(tiers) {
  const normalized = Array.isArray(tiers) && tiers.length ? tiers : getDefaultTiers();
  return normalized.map((tier) => ({
    from: tier.from ?? '',
    to: tier.to ?? '',
    amount: tier.amount ?? '',
    currency: normalizeTierCurrency(tier.currency)
  }));
}

function getDefaultTiers() {
  return [
    { from: 20, to: 40, amount: 1500, currency: 'kgs' },
    { from: 40, to: 100, amount: 2000, currency: 'kgs' }
  ];
}

function normalizeTierCurrency(value) {
  return String(value || '').toLowerCase() === 'usd' ? 'usd' : 'kgs';
}

function toOptionalNumber(value, fallback) {
  if (String(value ?? '').trim() === '') return fallback;
  return Number(value);
}

function getTierMarkupUsd(buyPriceUsd, tiers = getParsedTiers()) {
  const tier = tiers.find((item) => buyPriceUsd >= item.from && buyPriceUsd < item.to);
  return tier || null;
}

function findPriceType(keys) {
  return state.priceTypes.find((type) => keys.some((key) => normalizeSearch(type.name).includes(key)));
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
  const folderHref = els.folderSelect.value;
  const allowedFolderHrefs = getAllowedFolderHrefs(folderHref);
  return state.products.filter((product) => {
    if (state.supplyFilter && !state.supplyFilter.has(product.href)) return false;
    if (!state.supplyFilter && product.archived) return false;
    if (folderHref && !allowedFolderHrefs.has(product.folder?.href)) return false;
    if (!query) return true;
    return normalizeSearch([product.name, product.code, product.article].join(' ')).includes(query);
  });
}

function getAllowedFolderHrefs(folderHref) {
  if (!folderHref) return new Set();
  const folders = getAvailableFolders();
  const folder = folders.find((item) => item.href === folderHref);
  if (!folder) return new Set([folderHref]);
  const basePath = getFolderDisplayName(folder);
  return new Set(folders
    .filter((item) => item.href === folderHref || getFolderDisplayName(item).startsWith(`${basePath} / `))
    .map((item) => item.href));
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
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const type36Href = els.priceType36Select.value;
  const type912Href = els.priceType912Select.value;
  const wholesaleHref = els.priceTypeWholesaleSelect.value;

  els.productRows.innerHTML = pageProducts.map((product) => {
    const currentMin = roundMoney(Number(product.minPrice?.value || 0));
    const currentWholesale = getPrice(product, wholesaleHref);
    const current36 = getPrice(product, type36Href);
    const current912 = getPrice(product, type912Href);
    const next = state.calculated.get(product.id) || null;
    const skippedReason = state.skipped.get(product.id);
    return `
      <tr class="${next ? 'changed' : ''} ${skippedReason ? 'skipped' : ''} ${product.archived ? 'archived' : ''}">
        <td><input type="checkbox" data-select-product="${product.id}" ${state.selected.has(product.id) ? 'checked' : ''}></td>
        <td>${escapeHtml(product.code || '-')}</td>
        <td><strong>${escapeHtml(product.name)}</strong>${product.archived ? '<span class="archive-badge">Архив</span>' : ''}${skippedReason ? `<div class="muted">${escapeHtml(skippedReason)}</div>` : ''}</td>
        <td>${renderProductTemplateSelect(product)}</td>
        <td>${formatBuyPrice(product.buyPrice)}</td>
        <td>${formatWholesale(currentWholesale, product, wholesaleHref)}</td>
        <td>${next ? renderUsdPriceInput(product.id, 'wholesalePrice', next.wholesalePrice) : '<span class="muted">не рассчитано</span>'}</td>
        <td>${formatSom(currentMin)}</td>
        <td>${next ? renderPriceInput(product.id, 'minPrice', next.minPrice) : '<span class="muted">не рассчитано</span>'}</td>
        <td>${formatSom(current36)}</td>
        <td>${next ? renderOptionalPriceInput(product.id, 'price36', next.price36) : '<span class="muted">не рассчитано</span>'}</td>
        <td>${formatSom(current912)}</td>
        <td>${next ? renderOptionalPriceInput(product.id, 'price912', next.price912) : '<span class="muted">не рассчитано</span>'}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="13">Товары не найдены.</td></tr>';

  els.catalogCount.textContent = state.loadingCatalog && state.total > state.products.length
    ? `${formatNumber(state.products.length)} / ${formatNumber(state.total)}`
    : formatNumber(state.products.length);
  els.selectedCount.textContent = formatNumber(state.selected.size);
  els.changedCount.textContent = formatNumber(getSelectedChanges().length);
  els.skippedCount.textContent = formatNumber([...state.selected].filter((id) => state.skipped.has(id)).length);
  els.pageLabel.textContent = `Страница ${state.page} из ${pageCount}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= pageCount;
  els.selectPage.checked = pageProducts.length > 0 && pageProducts.every((product) => state.selected.has(product.id));
  els.saveButton.disabled = getSelectedChanges().length === 0;
}

function renderPriceInput(productId, field, value) {
  return `<input class="price-input" data-price-product="${productId}" data-price-field="${field}" type="number" min="0" step="0.01" value="${Number(value).toFixed(2)}">`;
}

function renderUsdPriceInput(productId, field, value) {
  return `${renderPriceInput(productId, field, value)} <span class="price-currency">USD</span>`;
}

function renderOptionalPriceInput(productId, field, value) {
  return value === null || value === undefined
    ? '<span class="muted">не считать</span>'
    : renderPriceInput(productId, field, value);
}

function renderProductTemplateSelect(product) {
  const templates = getApplicableTemplatesForProduct(product);
  const folderHref = product.folder?.href || '';
  const savedTemplateId = state.productTemplates.get(product.id) || (product.folder?.template ? folderHref : '');
  const currentTemplateId = templates.some((template) => template.id === savedTemplateId) ? savedTemplateId : '';
  const disabled = !folderHref || !templates.length;
  const options = [
    `<option value="">${product.folder?.template ? 'Шаблон подгруппы' : 'Выберите шаблон'}</option>`,
    ...templates.map((template) =>
      `<option value="${escapeHtml(template.id)}" ${template.id === currentTemplateId ? 'selected' : ''}>${escapeHtml(template.name)} — ${escapeHtml(template.folderName)}</option>`
    )
  ].join('');

  return `
    <div class="row-template-cell">
      <select data-product-template="${escapeHtml(product.id)}" ${disabled ? 'disabled' : ''}>
        ${options}
      </select>
      <small>${escapeHtml(product.folder?.name || 'Без группы')}</small>
    </div>
  `;
}

function handleTableChange(event) {
  const templateSelect = event.target.closest('[data-product-template]');
  if (templateSelect) {
    applyTemplateToProduct(templateSelect.dataset.productTemplate, templateSelect.value);
    return;
  }

  const select = event.target.closest('[data-select-product]');
  if (select) {
    if (select.checked) state.selected.add(select.dataset.selectProduct);
    else state.selected.delete(select.dataset.selectProduct);
    render();
    return;
  }

  const priceInput = event.target.closest('[data-price-product]');
  if (priceInput) {
    syncPriceInput(priceInput);
    render();
  }
}

function syncPriceInputFromEvent(event) {
  const priceInput = event.target.closest('[data-price-product]');
  if (priceInput) syncPriceInput(priceInput);
}

function syncPriceInput(priceInput) {
  const productId = priceInput.dataset.priceProduct;
  const field = priceInput.dataset.priceField;
  const value = Number(priceInput.value);
  if (!Number.isFinite(value) || value < 0) return false;
  const product = state.products.find((item) => item.id === productId);
  const current = state.calculated.get(productId) || {
    productId,
    wholesaleCurrencyHref: product ? getWholesaleCurrencyHref(product) : '',
    wholesalePrice: 0,
    minPrice: 0,
    price36: null,
    price912: null
  };
  current[field] = roundMoney(value);
  state.calculated.set(productId, current);
  state.selected.add(productId);
  state.skipped.delete(productId);
  return true;
}

function applyTemplateToProduct(productId, templateId) {
  const product = state.products.find((item) => item.id === productId);
  const template = getTemplates().find((item) => item.id === templateId);
  if (!product) return setStatus('Товар не найден.');
  if (!template) return setStatus('Выберите готовый шаблон.');
  if (!isTemplateApplicableToProduct(template, product)) {
    return setStatus('Этот шаблон не относится к группе выбранного товара.');
  }

  const sameFolderProducts = getFilteredProducts().filter((item) => item.folder?.href === product.folder?.href);
  const settings = getFormulaSettingsFromTemplate(template);
  let calculated = 0;
  let skipped = 0;
  for (const item of sameFolderProducts) {
    const result = calculateProductPrices(item, settings);
    if (result.error) {
      state.skipped.set(item.id, result.error);
      state.calculated.delete(item.id);
      skipped += 1;
      continue;
    }
    state.productTemplates.set(item.id, templateId);
    state.calculated.set(item.id, result);
    state.skipped.delete(item.id);
    state.selected.add(item.id);
    calculated += 1;
  }

  els.catalogStatus.textContent = skipped
    ? `Шаблон «${template.name}» применен к подгруппе: ${calculated}. Пропущено: ${skipped}.`
    : `Шаблон «${template.name}» применен к товарам этой подгруппы: ${calculated}.`;
  render();
}

function getApplicableTemplatesForProduct(product) {
  return getTemplates().filter((template) => isTemplateApplicableToProduct(template, product));
}

function isTemplateApplicableToProduct(template, product) {
  const productFolderHref = product.folder?.href || '';
  if (!productFolderHref) return false;
  return template.folderHref === productFolderHref;
}

function selectCurrentPage() {
  for (const product of getCurrentPageProducts()) {
    if (els.selectPage.checked) state.selected.add(product.id);
    else state.selected.delete(product.id);
  }
  render();
}

function selectFilteredProducts(options = {}) {
  const filtered = getFilteredProducts();
  for (const product of filtered) {
    state.selected.add(product.id);
  }
  if (!options.silent) {
    els.catalogStatus.textContent = `Выбрано товаров в группе/фильтре: ${filtered.length}.`;
  }
  render();
}

async function selectSupplyProducts() {
  const query = window.prompt('Введите номер приемки или вставьте ссылку на приемку из МойСклад');
  if (!query || !query.trim()) return;

  els.supplyProductsButton.disabled = true;
  els.catalogStatus.textContent = 'Загружаю товары из приемки...';
  try {
    const data = await api(`/api/accounting/supply-products?query=${encodeURIComponent(query.trim())}`);
    const hrefs = new Set((data.products || []).map((product) => product.href).filter(Boolean));
    if (!hrefs.size) {
      state.supplyFilter = null;
      state.supplyName = '';
      return setStatus('В этой приемке не найдены товары.');
    }

    state.supplyFilter = hrefs;
    state.supplyName = data.name || query.trim();
    els.searchInput.value = '';
    state.selected.clear();
    state.calculated.clear();
    state.skipped.clear();
    const matched = selectProductsFromSupplyFilter();
    state.page = 1;
    const folderText = els.folderSelect.value
      ? ` с учетом выбранной группы`
      : '';
    els.catalogStatus.textContent = `Приемка ${state.supplyName}: выбрано ${matched} товаров${folderText}.`;
    render();
  } catch (error) {
    els.catalogStatus.textContent = error.message;
  } finally {
    els.supplyProductsButton.disabled = false;
  }
}

function selectProductsFromSupplyFilter() {
  if (!state.supplyFilter) return 0;
  const filtered = getFilteredProducts();
  for (const product of filtered) {
    state.selected.add(product.id);
  }
  return filtered.length;
}

function calculateSelected(options = {}) {
  if (!state.selected.size) {
    els.catalogStatus.textContent = 'Сначала выберите товары галочками.';
    return;
  }

  const settings = getFormulaSettingsFromForm();
  const validationError = validateFormulaSettings(settings);
  if (validationError) return setStatus(validationError);

  saveSettings();
  state.skipped.clear();
  const selectedProducts = state.products.filter((product) => state.selected.has(product.id));
  const { calculated, skipped } = calculateProductList(selectedProducts, settings);

  if (options.status) {
    els.catalogStatus.textContent = options.status(calculated, skipped);
  } else {
    els.catalogStatus.textContent = skipped
    ? `Расчет готов: ${calculated}. Пропущено: ${skipped}.`
    : `Расчет готов: ${calculated}. Проверьте цены перед сохранением.`;
  }
  render();
}

function getFormulaSettingsFromForm() {
  return {
    rate: Number(els.usdRateInput.value || 0),
    markup: 0,
    markupMode: 'tiers',
    tiers: getParsedTiers(),
    wholesaleTiers: getParsedWholesaleTiers(),
    fallbackMarkupMode: 'none',
    fallbackMarkup: 0,
    wholesaleFallbackMarkupMode: 'none',
    wholesaleFallbackMarkup: 0,
    bank36: Number(els.bank36Input.value || 0),
    bank912: Number(els.bank912Input.value || 0),
    calculate36: els.calculate36Input.checked,
    calculate912: els.calculate912Input.checked,
    rounding: Number(els.roundingSelect.value || 0)
  };
}

function getFormulaSettingsFromTemplate(template) {
  return {
    rate: Number(template.usdRate ?? 89),
    markup: 0,
    markupMode: 'tiers',
    tiers: parseTiers(template.tiers),
    wholesaleTiers: parseTiers(template.wholesaleTiers || template.tiers),
    fallbackMarkupMode: 'none',
    fallbackMarkup: 0,
    wholesaleFallbackMarkupMode: 'none',
    wholesaleFallbackMarkup: 0,
    bank36: Number(template.bank36 ?? 10),
    bank912: Number(template.bank912 ?? 20),
    calculate36: template.calculate36 !== false,
    calculate912: template.calculate912 !== false,
    rounding: Number(template.rounding ?? 10)
  };
}

function validateFormulaSettings(settings) {
  if (!Number.isFinite(settings.rate) || settings.rate <= 0) return 'Введите корректный курс доллара.';
  if (!settings.tiers.length) return 'Добавьте хотя бы один корректный диапазон наценки.';
  if (!settings.wholesaleTiers.length) return 'Добавьте хотя бы один корректный диапазон для оптовой цены.';
  if (settings.calculate36 && (!Number.isFinite(settings.bank36) || settings.bank36 < 0)) return 'Введите корректный процент банка 3-6.';
  if (settings.calculate912 && (!Number.isFinite(settings.bank912) || settings.bank912 < 0)) return 'Введите корректный процент банка 9-12.';
  return '';
}

function calculateProductList(products, settings) {
  const validationError = validateFormulaSettings(settings);
  if (validationError) {
    setStatus(validationError);
    return { calculated: 0, skipped: products.length };
  }

  let calculated = 0;
  let skipped = 0;
  for (const product of products) {
    const result = calculateProductPrices(product, settings);
    if (result.error) {
      state.skipped.set(product.id, result.error);
      state.calculated.delete(product.id);
      skipped += 1;
      continue;
    }
    state.calculated.set(product.id, result);
    state.skipped.delete(product.id);
    calculated += 1;
  }
  return { calculated, skipped };
}

function calculateProductPrices(product, settings) {
  const buyPrice = Number(product.buyPrice?.value || 0);
  if (buyPrice <= 0) return { error: 'Нет закупочной цены' };
  const buyCurrency = getBuyPriceCurrency(product.buyPrice);
  if (buyCurrency === 'unknown') return { error: 'Валюта закупки не USD и не KGS' };

  const buyPriceUsd = buyCurrency === 'kgs' ? buyPrice / settings.rate : buyPrice;
  const baseKgs = buyCurrency === 'kgs' ? buyPrice : buyPrice * settings.rate;
  const tier = getTierMarkupUsd(buyPriceUsd, settings.tiers);
  if (!tier) return { error: 'Закупочная цена вне диапазонов минимальной цены' };
  const tierMarkup = tier ? convertTierMarkupToKgs(tier, settings.rate) : null;
  const wholesaleTier = getTierMarkupUsd(buyPriceUsd, settings.wholesaleTiers);
  if (!wholesaleTier) return { error: 'Закупочная цена вне диапазонов оптовой цены' };
  const wholesaleTierMarkupUsd = convertTierMarkupToUsd(wholesaleTier, settings.rate);

  const minRaw = baseKgs + tierMarkup;
  const wholesaleRaw = buyPriceUsd + wholesaleTierMarkupUsd;
  const minPrice = roundBy(minRaw, settings.rounding);
  const wholesalePrice = roundMoney(wholesaleRaw);
  const price36 = settings.calculate36 ? roundBy(minPrice * (1 + settings.bank36 / 100), settings.rounding) : null;
  const price912 = settings.calculate912 ? roundBy(minPrice * (1 + settings.bank912 / 100), settings.rounding) : null;

  return {
    productId: product.id,
    wholesaleCurrencyHref: getWholesaleCurrencyHref(product),
    wholesalePrice: Math.max(0, roundMoney(wholesalePrice)),
    minPrice: Math.max(0, roundMoney(minPrice)),
    price36: price36 === null ? null : Math.max(0, roundMoney(price36)),
    price912: price912 === null ? null : Math.max(0, roundMoney(price912))
  };
}

function getWholesaleCurrencyHref(product) {
  const wholesalePrice = getPriceRecord(product, els.priceTypeWholesaleSelect.value);
  const wholesaleCurrency = normalizeSearch(`${wholesalePrice?.currencyIsoCode || ''} ${wholesalePrice?.currencyName || ''}`);
  if (wholesaleCurrency.includes('usd') || wholesaleCurrency.includes('доллар')) {
    return wholesalePrice?.currencyHref || '';
  }
  return getBuyPriceCurrency(product.buyPrice) === 'usd' ? (product.buyPrice?.currencyHref || '') : '';
}

function convertTierMarkupToKgs(tier, rate) {
  return normalizeTierCurrency(tier.currency) === 'usd'
    ? tier.amount * rate
    : tier.amount;
}

function convertTierMarkupToUsd(tier, rate) {
  return normalizeTierCurrency(tier.currency) === 'usd'
    ? tier.amount
    : tier.amount / rate;
}

async function saveChanges() {
  document.querySelectorAll('[data-price-product]').forEach(syncPriceInput);
  const changes = getSelectedChanges();
  if (!changes.length) return;
  if (changes.length > 200) return setStatus('За один раз можно сохранить не более 200 товаров. Выберите меньше товаров.');
  if (!els.priceTypeWholesaleSelect.value) return setStatus('Тип цены «Оптовая цена» не найден в МойСклад.');
  const save36 = changes.some((change) => change.price36 !== null && change.price36 !== undefined);
  const save912 = changes.some((change) => change.price912 !== null && change.price912 !== undefined);
  if (save36 && !els.priceType36Select.value) return setStatus('Тип цены 3-6 не найден в МойСклад.');
  if (save912 && !els.priceType912Select.value) return setStatus('Тип цены 9-12 не найден в МойСклад.');

  const name36 = els.priceType36Select.selectedOptions[0]?.textContent || '3-6';
  const name912 = els.priceType912Select.selectedOptions[0]?.textContent || '9-12';
  const nameWholesale = els.priceTypeWholesaleSelect.selectedOptions[0]?.textContent || 'Оптовая цена';
  const priceNames = ['минимальную цену', `«${nameWholesale}»`];
  if (save36) priceNames.push(`«${name36}»`);
  if (save912) priceNames.push(`«${name912}»`);
  if (!confirm(`Сохранить ${priceNames.join(', ')} у ${changes.length} товаров?`)) return;

  els.saveButton.disabled = true;
  els.catalogStatus.textContent = `Сохраняю цены: ${changes.length} товаров...`;
  try {
    const result = await api('/api/accounting/prices/formula-update', {
      method: 'POST',
      body: {
        priceType36Href: save36 ? els.priceType36Select.value : '',
        priceType912Href: save912 ? els.priceType912Select.value : '',
        priceTypeWholesaleHref: els.priceTypeWholesaleSelect.value,
        changes
      }
    });
    const failedRows = (result.results || []).filter((item) => !item.ok);
    els.catalogStatus.textContent = failedRows.length
      ? `Обновлено: ${result.updated}. Ошибок: ${result.failed}. ${failedRows[0].error}`
      : `Успешно сохранено: ${result.updated}.`;
    state.calculated.clear();
    state.skipped.clear();
    await loadCatalog();
  } catch (error) {
    els.catalogStatus.textContent = error.message;
    els.saveButton.disabled = false;
  }
}

function getSelectedChanges() {
  return [...state.selected].filter((id) => state.calculated.has(id)).map((productId) => state.calculated.get(productId));
}

function getPrice(product, priceTypeHref) {
  const price = getPriceRecord(product, priceTypeHref);
  return roundMoney(Number(price?.value || 0));
}

function getPriceRecord(product, priceTypeHref) {
  return (product.prices || []).find((item) => item.priceTypeHref === priceTypeHref) || null;
}

function setStatus(message) { els.catalogStatus.textContent = message; }
function handleFolderChange() {
  state.page = 1;
  state.selected.clear();
  state.calculated.clear();
  state.skipped.clear();
  updateFolderLabel();
  renderGroupTemplateStatus();

  const template = getBoundTemplateForCurrentFolder();
  if (template) {
    els.templateSelect.value = els.folderSelect.value;
    applyTemplate(template);
    selectFilteredProducts({ silent: true });
    calculateSelected({
      status: (calculated, skipped) => skipped
        ? `Применен шаблон «${template.name}». Рассчитано: ${calculated}. Пропущено: ${skipped}.`
        : `Применен шаблон «${template.name}». Рассчитано товаров: ${calculated}.`
    });
    return;
  }

  if (state.supplyFilter) {
    const matched = selectProductsFromSupplyFilter();
    els.catalogStatus.textContent = `Приемка ${state.supplyName}: выбрано ${matched} товаров с учетом текущей группы.`;
  }
  render();
}
function resetPageAndRender() {
  state.page = 1;
  if (state.supplyFilter) {
    state.selected.clear();
    const matched = selectProductsFromSupplyFilter();
    els.catalogStatus.textContent = `Приемка ${state.supplyName}: выбрано ${matched} товаров с учетом текущего фильтра.`;
  }
  render();
}
function changePage(offset) { state.page += offset; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function normalizeSearch(value) { return String(value || '').trim().toLocaleLowerCase('ru-RU'); }
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function roundBy(value, rounding) {
  const step = Number(rounding || 0);
  return step > 0 ? roundMoney(Math.round(value / step) * step) : value;
}
function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(Number(value || 0)); }
function formatSom(value) { return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} сом`; }

function formatBuyPrice(buyPrice) {
  const value = Number(buyPrice?.value || 0);
  const currency = buyPrice?.currencyIsoCode || buyPrice?.currencyName || 'USD';
  if (value <= 0) return '<span class="muted">нет закупки</span>';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${escapeHtml(currency)}`.trim();
}

function formatWholesale(value, product, priceTypeHref) {
  const price = getPriceRecord(product, priceTypeHref);
  const currency = price?.currencyIsoCode || price?.currencyName || product.buyPrice?.currencyIsoCode || product.buyPrice?.currencyName || 'USD';
  if (Number(value || 0) <= 0) return '<span class="muted">0,00</span>';
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ${escapeHtml(currency)}`.trim();
}

function getBuyPriceCurrency(buyPrice) {
  const currency = normalizeSearch(`${buyPrice?.currencyIsoCode || ''} ${buyPrice?.currencyName || ''}`);
  if (!currency || currency.includes('usd') || currency.includes('доллар')) return 'usd';
  if (currency.includes('kgs') || currency.includes('сом')) return 'kgs';
  return 'unknown';
}

function loadSettings() {
  try {
    const settings = {
      usdRate: 89,
      markupPercent: 0,
      markupMode: 'tiers',
      tiers: getDefaultTiers(),
      wholesaleTiers: getDefaultTiers(),
      fallbackMarkupMode: 'none',
      fallbackMarkup: 0,
      wholesaleFallbackMarkupMode: 'none',
      wholesaleFallbackMarkup: 0,
      bank36Percent: 10,
      bank912Percent: 20,
      calculate36: true,
      calculate912: true,
      rounding: 10,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    };
    els.usdRateInput.value = String(settings.usdRate);
    els.markupInput.value = '0';
    els.markupModeSelect.value = 'tiers';
    renderTierRows(normalizeTiers(settings.tiers));
    renderWholesaleTierRows(normalizeTiers(settings.wholesaleTiers || settings.tiers));
    els.fallbackMarkupModeSelect.value = 'none';
    els.fallbackMarkupInput.value = '0';
    els.wholesaleFallbackMarkupModeSelect.value = 'none';
    els.wholesaleFallbackMarkupInput.value = '0';
    els.bank36Input.value = String(settings.bank36Percent);
    els.bank912Input.value = String(settings.bank912Percent);
    els.calculate36Input.checked = settings.calculate36 !== false;
    els.calculate912Input.checked = settings.calculate912 !== false;
    els.roundingSelect.value = String(settings.rounding);
  } catch {
    els.usdRateInput.value = '89';
    els.markupInput.value = '0';
    els.markupModeSelect.value = 'tiers';
    renderTierRows(getDefaultTiers());
    renderWholesaleTierRows(getDefaultTiers());
    els.fallbackMarkupModeSelect.value = 'none';
    els.fallbackMarkupInput.value = '0';
    els.wholesaleFallbackMarkupModeSelect.value = 'none';
    els.wholesaleFallbackMarkupInput.value = '0';
    els.bank36Input.value = '10';
    els.bank912Input.value = '20';
    els.calculate36Input.checked = true;
    els.calculate912Input.checked = true;
    els.roundingSelect.value = '10';
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    usdRate: Number(els.usdRateInput.value || 0),
    markupPercent: 0,
    markupMode: 'tiers',
    tiers: getTierSettings(),
    wholesaleTiers: getWholesaleTierSettings(),
    fallbackMarkupMode: 'none',
    fallbackMarkup: 0,
    wholesaleFallbackMarkupMode: 'none',
    wholesaleFallbackMarkup: 0,
    bank36Percent: Number(els.bank36Input.value || 0),
    bank912Percent: Number(els.bank912Input.value || 0),
    calculate36: els.calculate36Input.checked,
    calculate912: els.calculate912Input.checked,
    rounding: Number(els.roundingSelect.value || 0)
  }));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.details?.errors?.[0]?.error || data.details?.error || '';
    throw new Error(detail || data.error || 'Ошибка запроса');
  }
  return data;
}

function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
