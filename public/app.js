const form = document.querySelector('#orderForm');
const app = document.querySelector('.app');
const branchScreen = document.querySelector('#branchScreen');
const appPreloader = document.querySelector('#appPreloader');
const branchLabel = document.querySelector('#branchLabel');
const paymentTypeSelect = document.querySelector('#paymentType');
const employeeSelect = document.querySelector('#employee');
const storeSelect = document.querySelector('#store');
const existingCustomerSelect = document.querySelector('#existingCustomer');
const addItemButton = document.querySelector('#addItemButton');
const addItemBottomButton = document.querySelector('#addItemBottomButton');
const addMissingCustomerButton = document.querySelector('#addMissingCustomerButton');
const itemsList = document.querySelector('#itemsList');
const submitButton = document.querySelector('#submitButton');
const statusEl = document.querySelector('#status');
const customerDuplicateWarning = document.querySelector('#customerDuplicateWarning');
const loyaltyPanel = document.querySelector('#loyaltyPanel');
const loyaltyBalance = document.querySelector('#loyaltyBalance');
const loyaltyStatus = document.querySelector('#loyaltyStatus');
const loyaltyAccrualPreview = document.querySelector('#loyaltyAccrualPreview');
const loyaltyLimitPreview = document.querySelector('#loyaltyLimitPreview');
const successModal = document.querySelector('#successModal');
const successMessage = document.querySelector('#successMessage');
const printDocumentButton = document.querySelector('#printDocumentButton');
const openMoyskladButton = document.querySelector('#openMoyskladButton');
const closeSuccessModalButton = document.querySelector('#closeSuccessModalButton');
const printReceipt = document.querySelector('#printReceipt');

const fields = {
  productSearch: document.querySelector('#productSearch'),
  productResults: document.querySelector('#productResults'),
  customerSearch: document.querySelector('#customerSearch'),
  customerResults: document.querySelector('#customerResults'),
  customerSearchField: document.querySelector('#customerSearchField'),
  existingCustomerField: document.querySelector('#existingCustomerField'),
  cashPrepaymentField: document.querySelector('#cashPrepaymentField'),
  prepaymentMethodField: document.querySelector('#prepaymentMethodField'),
  transferPrepaymentField: document.querySelector('#transferPrepaymentField'),
  paymentTypeField: document.querySelector('#paymentTypeField'),
  cashPrepayment: document.querySelector('#cashPrepayment'),
  prepaymentMethod: document.querySelector('#prepaymentMethod'),
  transferPrepayment: document.querySelector('#transferPrepayment'),
  loyaltyRedemption: document.querySelector('#loyaltyRedemption'),
  customerName: document.querySelector('#customerName'),
  customerPhone: document.querySelector('#customerPhone'),
  customerAddress: document.querySelector('#customerAddress')
};

const summary = {
  baseTotal: document.querySelector('#baseTotal'),
  productLabel: document.querySelector('#productLabel'),
  paymentTypeLabel: document.querySelector('#paymentTypeLabel'),
  prepaidTotal: document.querySelector('#prepaidTotal'),
  loyaltyRow: document.querySelector('#loyaltySummaryRow'),
  loyaltyRedemption: document.querySelector('#loyaltyRedemptionSummary'),
  installmentBaseLabel: document.querySelector('#installmentBaseLabel'),
  installmentBase: document.querySelector('#installmentBase'),
  commission: document.querySelector('#commission'),
  finalTotal: document.querySelector('#finalTotal'),
  monthlyPaymentLabel: document.querySelector('#monthlyPaymentLabel'),
  monthlyPayment: document.querySelector('#monthlyPayment')
};

const compactSummary = {
  baseTotal: document.querySelector('#compactBaseTotal'),
  productLabel: document.querySelector('#compactProductLabel'),
  paymentTypeLabel: document.querySelector('#compactPaymentTypeLabel'),
  prepaidTotal: document.querySelector('#compactPrepaidTotal'),
  loyaltyRow: document.querySelector('#compactLoyaltyRow'),
  loyaltyRedemption: document.querySelector('#compactLoyaltyRedemption'),
  installmentBaseLabel: document.querySelector('#compactInstallmentBaseLabel'),
  installmentBase: document.querySelector('#compactInstallmentBase'),
  finalTotal: document.querySelector('#compactFinalTotal'),
  monthlyPaymentLabel: document.querySelector('#compactMonthlyPaymentLabel'),
  monthlyPayment: document.querySelector('#compactMonthlyPayment')
};

let config = {};
let products = [];
let paymentTypes = [];
let employees = [];
let stores = [];
let customers = [];
let orderItems = [];
let searchTimer;
let productSearchRequestId = 0;
let customerSearchTimer;
let duplicateCustomerTimer;
let loyaltyCustomerTimer;
let loyaltyRequestId = 0;
let duplicateCustomer = null;
let loyaltyCustomer = null;
let loyaltyLoading = false;
let loyaltyError = '';
let lastCalculation = null;
let submitInProgress = false;
let selectedBranch = '';
let productsLoading = false;
let productsReady = false;
let lastCreatedOrder = null;

const branches = {
  ayu: 'Аю-Гранд',
  besh: 'Беш-Сары'
};

init();

async function init() {
  try {
    setAppPreloader(true, 'Загружаю настройки...');
    const response = await fetch('/api/config');
    config = await response.json();
    await loadPaymentTypes();
    await loadEmployees();
    await loadStores();
    await loadCustomers();
    setAppPreloader(true, 'Загружаю товары...');
    await loadProducts('', { throwOnError: true });
    productsReady = true;
    renderCustomerMode();
    initBranchSelection();
    await updateCalculation();
  } catch (error) {
    setStatus('Не удалось загрузить настройки расчета.', 'error');
  } finally {
    setAppPreloader(false);
  }
}

for (const button of document.querySelectorAll('[data-branch]')) {
  button.addEventListener('click', () => {
    selectBranch(button.dataset.branch);
  });
}

function setAppPreloader(visible, message = 'Загружаю товары...') {
  if (!appPreloader) {
    return;
  }

  const text = appPreloader.querySelector('strong');
  if (text) {
    text.textContent = message;
  }
  appPreloader.classList.toggle('hidden', !visible);
}

form.addEventListener('input', () => {
  updateCalculation();
});

form.addEventListener('change', (event) => {
  if (event.target?.name === 'customerMode') {
    renderCustomerMode();
    scheduleDuplicateCustomerCheck();
  }
});

paymentTypeSelect.addEventListener('change', () => {
  updateCalculation();
});

for (const radio of document.querySelectorAll('input[name="paymentScenario"]')) {
  radio.addEventListener('change', () => {
    applyPaymentScenario();
    updateCalculation();
  });
}

employeeSelect.addEventListener('change', () => {
  updateCalculation();
});

storeSelect.addEventListener('change', () => {
  updateCalculation();
});

fields.prepaymentMethod.addEventListener('change', () => {
  updateCalculation();
});

if (fields.loyaltyRedemption) {
  fields.loyaltyRedemption.addEventListener('input', () => {
    normalizeLoyaltyRedemptionInput();
    updateCalculation();
  });
  fields.loyaltyRedemption.addEventListener('blur', () => {
    normalizeLoyaltyRedemptionInput({ forceZero: true });
    updateCalculation();
  });
}

addItemButton.addEventListener('click', () => {
  addItemRow();
});

if (addItemBottomButton) {
  addItemBottomButton.addEventListener('click', () => {
    addItemRow();
  });
}

existingCustomerSelect.addEventListener('change', () => {
  applySelectedCustomer();
});

addMissingCustomerButton.addEventListener('click', () => {
  const newModeRadio = document.querySelector('input[name="customerMode"][value="new"]');
  newModeRadio.checked = true;
  fields.customerName.value = fields.customerSearch.value.trim();
  fields.customerPhone.value = '';
  fields.customerAddress.value = '';
  renderCustomerMode();
});

fields.productSearch.addEventListener('input', () => {
  renderProductResults('Ищу товары...');
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadProducts(fields.productSearch.value);
  }, 350);
});

fields.productSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  if (products[0]) {
    addProductToOrder(products[0]);
    fields.productSearch.value = '';
    fields.productResults.innerHTML = '';
  }
});

fields.customerSearch.addEventListener('input', () => {
  renderCustomerResults('Ищу клиентов...');
  renderMissingCustomerAction();
  window.clearTimeout(customerSearchTimer);
  customerSearchTimer = window.setTimeout(() => {
    loadCustomers(fields.customerSearch.value);
  }, 350);
});

fields.customerSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  if (customers[0]) {
    existingCustomerSelect.value = customers[0].href;
    applySelectedCustomer();
    renderCustomerResults();
  }
});

fields.customerName.addEventListener('input', () => {
  scheduleDuplicateCustomerCheck();
});

fields.customerPhone.addEventListener('input', () => {
  scheduleDuplicateCustomerCheck();
  scheduleLoyaltyCustomerLoad();
});

for (const radio of document.querySelectorAll('input[name="customerMode"]')) {
  radio.addEventListener('change', () => {
    renderCustomerMode();
    scheduleDuplicateCustomerCheck();
  });
}

printDocumentButton.addEventListener('click', () => {
  if (!lastCreatedOrder) {
    return;
  }
  renderPrintReceipt(lastCreatedOrder);
  window.print();
});

openMoyskladButton.addEventListener('click', () => {
  const url = getMoySkladWebUrl(lastCreatedOrder?.document);
  if (url) {
    window.open(url, '_blank', 'noopener');
  }
});

closeSuccessModalButton.addEventListener('click', () => {
  successModal.classList.add('hidden');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitInProgress) {
    return;
  }

  submitInProgress = true;
  submitButton.disabled = true;
  setStatus('Создаю документ в МойСклад...', '');

  try {
    if (duplicateCustomer && getCustomerMode() === 'new') {
      throw new Error(`Такой клиент уже есть: ${duplicateCustomer.name}. Выберите режим "Старый клиент".`);
    }
    validateLoyaltyBeforeSubmit();

    const payload = getPayload();
    payload.requestKey = crypto.randomUUID();
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(formatApiError(data, 'Ошибка создания документа.'));
    }

    const documentName = data.document?.name ? ` №${data.document.name}` : '';
    const documentTitle = getDocumentTitle(data.document?.type);
    const paymentText = data.document?.payment?.name ? ` Входящий платеж №${data.document.payment.name} создан.` : '';
    const loyaltyText = getLoyaltyResultText(data.loyalty);
    lastCreatedOrder = { ...data, requestPayload: payload };
    showSuccessModal(lastCreatedOrder, `${documentTitle}${documentName} создан в МойСклад.${paymentText}${loyaltyText}`);
    setStatus(`Готово. ${documentTitle}${documentName} создан в МойСклад.${paymentText}${loyaltyText}`, 'success');
    await loadLoyaltyCustomer();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    submitInProgress = false;
    submitButton.disabled = false;
  }
});

async function loadPaymentTypes() {
  const response = await fetch('/api/payment-types');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить типы оплаты.');
  }

  paymentTypes = data.paymentTypes;
  renderPaymentTypes();
}

async function loadEmployees() {
  const response = await fetch('/api/employees');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить сотрудников.');
  }

  employees = data.employees;
  renderEmployees();
}

async function loadStores() {
  const response = await fetch('/api/retail-stores');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить точки продаж.');
  }

  stores = data.retailStores;
  renderStores();
}

async function loadCustomers(search = '') {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await fetch(`/api/customers?${params}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить клиентов.');
  }

  customers = data.customers;
  renderCustomers();
  renderCustomerResults();
}

async function loadProducts(search = '', options = {}) {
  const requestId = ++productSearchRequestId;
  setProductsLoading(true);
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set('search', search.trim());
  }

  try {
    const response = await fetch(`/api/products?${params}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось загрузить товары.');
    }

    if (requestId !== productSearchRequestId) {
      return;
    }

    products = Array.isArray(data.products) ? data.products : [];
    refreshItemProductOptions();
    renderProductResults();
    updateCalculation();
  } catch (error) {
    if (requestId === productSearchRequestId) {
      products = [];
      renderProductResults(error.message || 'Не удалось загрузить товары.');
      setStatus(error.message || 'Не удалось загрузить товары.', 'error');
    }
    if (options.throwOnError) {
      throw error;
    }
  } finally {
    if (requestId === productSearchRequestId) {
      setProductsLoading(false);
    }
  }
}

function setProductsLoading(loading) {
  productsLoading = loading;
  fields.productSearch.disabled = loading && !fields.productSearch.value.trim();
  addItemButton.disabled = loading;
  addItemButton.textContent = loading ? 'Загружаю товары...' : 'Добавить товар +';
  if (loading) {
    renderProductResults('Загружаю товары...');
  }
}

function renderProductResults(message = '') {
  if (!fields.productResults) {
    return;
  }

  fields.productResults.innerHTML = '';
  const query = fields.productSearch.value.trim();

  if (message) {
    fields.productResults.append(createSearchState(message, 'loading'));
    return;
  }

  if (!query) {
    fields.productResults.append(createSearchState('Начните вводить название или код товара.'));
    return;
  }

  if (!products.length) {
    fields.productResults.append(createSearchState('Товар не найден. Попробуйте код, артикул или другое слово.'));
    return;
  }

  for (const product of products.slice(0, 12)) {
    const button = document.createElement('button');
    button.className = 'search-result';
    button.type = 'button';
    button.addEventListener('click', () => {
      addProductToOrder(product);
      fields.productSearch.value = '';
      fields.productResults.innerHTML = '';
    });

    const title = document.createElement('strong');
    title.textContent = product.name;

    const metaLine = document.createElement('span');
    const parts = [];
    if (product.code) {
      parts.push(`Код: ${product.code}`);
    }
    parts.push(formatSom(product.price || 0));
    metaLine.textContent = parts.join(' · ');

    button.append(title, metaLine);
    fields.productResults.append(button);
  }
}

function createSearchState(text, type = '') {
  const state = document.createElement('div');
  state.className = `search-state ${type}`.trim();
  state.textContent = text;
  return state;
}

function createProductOptions(selectedHref = '') {
  const fragment = document.createDocumentFragment();
  const selectedItem = orderItems.find((item) => item.assortmentHref === selectedHref);
  const selectedProductVisible = products.some((product) => product.href === selectedHref);

  if (selectedItem && selectedHref && !selectedProductVisible) {
    const option = document.createElement('option');
    option.value = selectedHref;
    option.dataset.type = selectedItem.assortmentType;
    option.dataset.name = selectedItem.productName;
    option.dataset.price = String(selectedItem.productPrice || 0);
    option.textContent = selectedItem.productName;
    option.selected = true;
    fragment.append(option);
  }

  if (!products.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Товар не найден';
    fragment.append(option);
    return fragment;
  }

  for (const product of products) {
    const option = document.createElement('option');
    option.value = product.href;
    option.dataset.type = product.type;
    option.dataset.name = product.name;
    option.dataset.price = String(product.price || 0);
    option.textContent = product.code ? `${product.name} (${product.code})` : product.name;
    if (product.href === selectedHref) {
      option.selected = true;
    }
    fragment.append(option);
  }

  return fragment;
}

function addItemRow() {
  if (!productsReady) {
    setStatus('Подождите, товары еще загружаются.', 'error');
    return;
  }

  if (productsLoading) {
    setStatus('Подождите, товары еще загружаются.', 'error');
    return;
  }

  const product = products[0];
  if (!product) {
    setStatus('Сначала найдите товар через поиск.', 'error');
    fields.productSearch.focus();
    return;
  }
  addProductToOrder(product);
}

function addProductToOrder(product) {
  orderItems.push({
    productName: product?.name || '',
    assortmentHref: product?.href || '',
    assortmentType: product?.type || 'product',
    productPrice: product?.price || 0,
    productCost: product?.cost || 0,
    quantity: 1
  });
  renderOrderItems();
  updateCalculation();
}

function renderOrderItems() {
  itemsList.innerHTML = '';
  for (const [index, item] of orderItems.entries()) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const productInfo = document.createElement('div');
    productInfo.className = 'item-product-info';
    const productTitle = document.createElement('span');
    productTitle.textContent = `Товар ${index + 1}`;
    const productName = document.createElement('strong');
    productName.textContent = item.productName || 'Товар не выбран';
    productInfo.append(productTitle, productName);

    const priceLabel = document.createElement('label');
    const priceTitle = document.createElement('span');
    priceTitle.textContent = 'Цена';
    const priceInput = document.createElement('input');
    priceInput.inputMode = 'decimal';
    priceInput.value = item.productPrice || '';
    priceInput.addEventListener('input', () => {
      item.productPrice = parseMoney(priceInput.value);
      updateCalculation();
    });
    priceLabel.append(priceTitle, priceInput);

    const quantityLabel = document.createElement('label');
    const quantityTitle = document.createElement('span');
    quantityTitle.textContent = 'Кол-во';
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.min = '1';
    quantityInput.step = '1';
    quantityInput.value = item.quantity || 1;
    quantityInput.addEventListener('input', () => {
      item.quantity = Number(quantityInput.value || 1);
      updateCalculation();
    });
    quantityLabel.append(quantityTitle, quantityInput);

    const remove = document.createElement('button');
    remove.className = 'remove-item';
    remove.type = 'button';
    remove.textContent = 'x';
    remove.addEventListener('click', () => {
      orderItems.splice(index, 1);
      renderOrderItems();
      updateCalculation();
    });

    row.append(productInfo, priceLabel, quantityLabel, remove);
    itemsList.append(row);
  }
}

function refreshItemProductOptions() {
  renderOrderItems();
}

function renderPaymentTypes() {
  paymentTypeSelect.innerHTML = '';
  for (const paymentType of getVisiblePaymentTypes()) {
    const option = document.createElement('option');
    option.value = paymentType.href;
    option.dataset.name = paymentType.name;
    option.dataset.rate = String(paymentType.rate ?? 0);
    option.textContent = paymentType.name;
    paymentTypeSelect.append(option);
  }
  const defaultType = paymentTypes.find((paymentType) => paymentType.name === 'M+ (6 мес)');
  if (defaultType) {
    paymentTypeSelect.value = defaultType.href;
  }
  renderPrepaymentMethods();
  applyPaymentScenario();
}

function renderPrepaymentMethods() {
  const currentValue = fields.prepaymentMethod.value || 'Наличными';
  const methods = getPrepaymentMethods();
  fields.prepaymentMethod.innerHTML = '';

  for (const method of methods) {
    const option = document.createElement('option');
    option.value = method.name;
    option.textContent = method.name;
    fields.prepaymentMethod.append(option);
  }

  if (methods.some((method) => method.name === currentValue)) {
    fields.prepaymentMethod.value = currentValue;
  }
}

function applyPaymentScenario() {
  if (!paymentTypes.length) {
    return;
  }

  const scenario = getPaymentScenario();
  const currentHref = paymentTypeSelect.value;
  paymentTypeSelect.innerHTML = '';
  for (const paymentType of getVisiblePaymentTypes()) {
    const option = document.createElement('option');
    option.value = paymentType.href;
    option.dataset.name = paymentType.name;
    option.dataset.rate = String(paymentType.rate ?? 0);
    option.textContent = paymentType.name;
    paymentTypeSelect.append(option);
  }
  if (getVisiblePaymentTypes().some((paymentType) => paymentType.href === currentHref)) {
    paymentTypeSelect.value = currentHref;
  }

  fields.transferPrepayment.value = '0';
  fields.transferPrepaymentField.classList.add('hidden');
  fields.cashPrepaymentField.classList.toggle('hidden', scenario !== 'mixed' && scenario !== 'debt');
  fields.prepaymentMethodField.classList.toggle('hidden', scenario !== 'mixed' && scenario !== 'debt');
  fields.paymentTypeField.classList.toggle('hidden', scenario === 'cash' || scenario === 'debt');

  if (scenario === 'cash') {
    fields.cashPrepayment.value = '0';
    fields.prepaymentMethod.value = 'Наличными';
    selectPaymentType(findCashPaymentType());
    return;
  }

  if (scenario === 'debt') {
    selectPaymentType(findDebtPaymentType());
    return;
  }

  if (scenario === 'bank') {
    fields.cashPrepayment.value = '0';
  }

  const selected = getSelectedPaymentType();
  const visiblePaymentTypes = getVisiblePaymentTypes();
  if (!selected || !visiblePaymentTypes.some((paymentType) => paymentType.href === selected.href)) {
    selectPaymentType(visiblePaymentTypes[0]);
  }
}

function renderEmployees() {
  employeeSelect.innerHTML = '';
  for (const employee of employees) {
    const option = document.createElement('option');
    option.value = employee.href;
    option.dataset.name = employee.name;
    option.textContent = employee.name;
    employeeSelect.append(option);
  }
}

function renderStores() {
  storeSelect.innerHTML = '';
  for (const store of stores) {
    const option = document.createElement('option');
    option.value = store.href;
    option.dataset.name = store.name;
    option.dataset.storeHref = store.storeHref || '';
    option.textContent = store.name;
    storeSelect.append(option);
  }

  const defaultStore = stores.find((store) => store.name === 'Аю-Гранд');
  if (defaultStore) {
    storeSelect.value = defaultStore.href;
  }
  if (selectedBranch) {
    applyBranchStore();
  }
}

function initBranchSelection() {
  app.classList.add('hidden');
  const branchFromUrl = new URLSearchParams(window.location.search).get('branch');
  if (branches[branchFromUrl]) {
    selectBranch(branchFromUrl);
  }
}

function selectBranch(branchKey) {
  selectedBranch = branchKey;
  applyBranchStore();
  branchScreen.classList.add('hidden');
  app.classList.remove('hidden');
}

function applyBranchStore() {
  const storeName = branches[selectedBranch];
  const store = stores.find((entry) => entry.name === storeName);
  if (!store) {
    return;
  }

  storeSelect.value = store.href;
  storeSelect.disabled = true;
  branchLabel.textContent = `Точка продаж: ${store.name}`;
}

function renderCustomers() {
  existingCustomerSelect.innerHTML = '';

  if (!customers.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Клиент не найден';
    existingCustomerSelect.append(option);
    existingCustomerSelect.disabled = true;
    renderMissingCustomerAction();
    return;
  }

  existingCustomerSelect.disabled = false;
  addMissingCustomerButton.classList.add('hidden');
  for (const customer of customers) {
    const option = document.createElement('option');
    option.value = customer.href;
    option.dataset.name = customer.name;
    option.dataset.phone = customer.phone || '';
    option.dataset.address = customer.actualAddress || '';
    option.textContent = customer.phone ? `${customer.name} (${customer.phone})` : customer.name;
    existingCustomerSelect.append(option);
  }
  applySelectedCustomer();
}

function renderCustomerResults(message = '') {
  if (!fields.customerResults) {
    return;
  }

  const existing = getCustomerMode() === 'existing';
  fields.customerResults.classList.toggle('hidden', !existing);
  fields.customerResults.innerHTML = '';

  if (!existing) {
    return;
  }

  const query = fields.customerSearch.value.trim();
  if (message) {
    fields.customerResults.append(createSearchState(message));
    return;
  }

  if (!query) {
    fields.customerResults.append(createSearchState('Введите имя или телефон, чтобы найти старого клиента.'));
    return;
  }

  if (!customers.length) {
    fields.customerResults.append(createSearchState('Клиент не найден. Можно добавить как нового.'));
    return;
  }

  for (const customer of customers.slice(0, 12)) {
    const button = document.createElement('button');
    button.className = 'search-result';
    button.type = 'button';
    button.addEventListener('click', () => {
      existingCustomerSelect.value = customer.href;
      applySelectedCustomer();
      fields.customerSearch.value = customer.phone ? `${customer.name} ${customer.phone}` : customer.name;
      fields.customerResults.innerHTML = '';
      renderMissingCustomerAction();
    });

    const title = document.createElement('strong');
    title.textContent = customer.name;

    const metaLine = document.createElement('span');
    metaLine.textContent = [customer.phone, customer.actualAddress].filter(Boolean).join(' · ') || 'Без телефона';

    button.append(title, metaLine);
    fields.customerResults.append(button);
  }
}

function renderCustomerMode() {
  const mode = getCustomerMode();
  const existing = mode === 'existing';
  const retail = mode === 'retail';
  fields.customerSearchField.classList.toggle('hidden', !existing);
  fields.customerResults.classList.toggle('hidden', !existing);
  fields.existingCustomerField.classList.add('hidden');
  fields.customerName.readOnly = existing;
  fields.customerName.required = mode === 'new';
  fields.customerPhone.required = mode === 'new';
  fields.customerName.closest('label').classList.toggle('hidden', retail);
  fields.customerPhone.closest('label').classList.toggle('hidden', retail);
  fields.customerAddress.closest('label').classList.toggle('hidden', retail);
  renderMissingCustomerAction();
  renderDuplicateCustomerWarning();
  renderCustomerResults();
  if (existing) {
    applySelectedCustomer();
  } else if (retail) {
    fields.customerName.value = '';
    fields.customerPhone.value = '';
    fields.customerAddress.value = '';
  }
  scheduleLoyaltyCustomerLoad();
}

function renderMissingCustomerAction() {
  const canAdd = getCustomerMode() === 'existing' && !customers.length && fields.customerSearch.value.trim();
  addMissingCustomerButton.classList.toggle('hidden', !canAdd);
}

function applySelectedCustomer() {
  if (getCustomerMode() !== 'existing') {
    return;
  }

  const customer = getSelectedCustomer();
  if (!customer) {
    return;
  }

  fields.customerName.value = customer.name || '';
  fields.customerPhone.value = customer.phone || '';
  fields.customerAddress.value = customer.actualAddress || '';
  scheduleLoyaltyCustomerLoad();
}

function scheduleDuplicateCustomerCheck() {
  window.clearTimeout(duplicateCustomerTimer);
  duplicateCustomerTimer = window.setTimeout(() => {
    checkDuplicateCustomer();
  }, 350);
}

async function checkDuplicateCustomer() {
  duplicateCustomer = null;
  renderDuplicateCustomerWarning();

  if (getCustomerMode() !== 'new') {
    return;
  }

  const name = fields.customerName.value.trim();
  const phone = fields.customerPhone.value.trim();
  const query = phone || name;
  if (!query) {
    return;
  }

  try {
    const params = new URLSearchParams({ search: query });
    const response = await fetch(`/api/customers?${params}`);
    const data = await response.json();
    if (!response.ok) {
      return;
    }

    duplicateCustomer = (data.customers || []).find((customer) => {
      const sameName = name && customer.name?.trim().toLowerCase() === name.toLowerCase();
      const samePhone = phone && normalizePhone(customer.phone) === normalizePhone(phone);
      return sameName || samePhone;
    }) || null;
    renderDuplicateCustomerWarning();
  } catch {
    duplicateCustomer = null;
    renderDuplicateCustomerWarning();
  }
}

function renderDuplicateCustomerWarning() {
  const show = duplicateCustomer && getCustomerMode() === 'new';
  customerDuplicateWarning.classList.toggle('hidden', !show);
  customerDuplicateWarning.textContent = show
    ? `Такой клиент уже есть: ${duplicateCustomer.name}${duplicateCustomer.phone ? `, ${duplicateCustomer.phone}` : ''}. Переключитесь на "Старый клиент" и выберите его из списка.`
    : '';
  submitButton.disabled = Boolean(show) || submitInProgress;
}

function scheduleLoyaltyCustomerLoad() {
  renderLoyaltyPanel();
  window.clearTimeout(loyaltyCustomerTimer);
  loyaltyCustomerTimer = window.setTimeout(() => {
    loadLoyaltyCustomer();
  }, 350);
}

async function loadLoyaltyCustomer() {
  const requestId = ++loyaltyRequestId;
  loyaltyCustomer = null;
  loyaltyError = '';
  loyaltyLoading = false;
  renderLoyaltyPanel();

  if (!isLoyaltyVisible()) {
    return;
  }

  const phone = fields.customerPhone.value.trim();
  if (!normalizePhone(phone)) {
    return;
  }

  loyaltyLoading = true;
  renderLoyaltyPanel();

  try {
    const params = new URLSearchParams({ phone });
    const response = await fetch(`/api/loyalty/customer?${params}`);
    const data = await response.json();
    if (requestId !== loyaltyRequestId) {
      return;
    }
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось загрузить бонусы клиента.');
    }
    loyaltyCustomer = data.customer || null;
    loyaltyError = '';
    loyaltyLoading = false;
    renderLoyaltyPanel();
  } catch (error) {
    if (requestId !== loyaltyRequestId) {
      return;
    }
    loyaltyCustomer = null;
    loyaltyError = error.message;
    loyaltyLoading = false;
    renderLoyaltyPanel();
  }
}

function renderLoyaltyPanel() {
  if (!loyaltyPanel || !config.loyalty?.enabled) {
    return;
  }

  const visible = isLoyaltyVisible();
  loyaltyPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    if (fields.loyaltyRedemption) {
      fields.loyaltyRedemption.value = '0';
    }
    return;
  }

  const balance = Number(loyaltyCustomer?.bonus_balance || 0);
  const baseTotal = Number(lastCalculation?.baseTotal || 0);
  const finalTotal = Number(lastCalculation?.finalTotal || baseTotal || 0);
  const maxByPercent = baseTotal * Number(config.loyalty?.maxRedeemPercent || 0) / 100;
  const maxRedeem = Math.floor(Math.max(0, Math.min(balance, maxByPercent)));
  const adjusted = normalizeLoyaltyRedemptionInput({ maxRedeem });
  let redemption = adjusted.value;
  const canRedeem = Boolean(loyaltyCustomer) && maxRedeem > 0 && baseTotal > 0 && !loyaltyLoading && !loyaltyError;
  let changedByDisable = false;
  if (fields.loyaltyRedemption) {
    fields.loyaltyRedemption.disabled = !canRedeem;
    fields.loyaltyRedemption.max = String(maxRedeem);
    if (!canRedeem && redemption > 0) {
      fields.loyaltyRedemption.value = '0';
      redemption = 0;
      changedByDisable = true;
    }
  }
  if ((adjusted.changed || changedByDisable) && orderItems.length) {
    window.setTimeout(() => updateCalculation(), 0);
  }

  const percent = Number(config.loyalty?.accrualPercent || 0);
  const accrualBase = Math.max(0, finalTotal);
  const accrual = redemption > 0 ? 0 : Math.floor(accrualBase * percent / 100);

  loyaltyBalance.textContent = `${formatNumber(balance)} бонусов`;
  loyaltyLimitPreview.textContent = `Максимум списания: ${formatNumber(maxRedeem)} бонусов`;
  loyaltyAccrualPreview.textContent = redemption > 0
    ? 'Начислится: 0 бонусов при списании'
    : `Начислится: ${formatNumber(accrual)} бонусов`;
  if (loyaltyLoading) {
    loyaltyStatus.textContent = 'Проверяю бонусы клиента...';
  } else if (loyaltyError) {
    loyaltyStatus.textContent = loyaltyError;
  } else if (!normalizePhone(fields.customerPhone.value)) {
    loyaltyStatus.textContent = 'Введите телефон клиента.';
  } else if (loyaltyCustomer) {
    loyaltyStatus.textContent = canRedeem
      ? `Клиент найден: ${loyaltyCustomer.name || loyaltyCustomer.phone}`
      : 'Клиент найден. Для списания добавьте товар или проверьте баланс.';
  } else {
    loyaltyStatus.textContent = 'Клиента в бонусной базе пока нет. Можно только начислить бонусы после покупки.';
  }
}

function isLoyaltyVisible() {
  return Boolean(config.loyalty?.enabled) && getCustomerMode() !== 'retail';
}

function normalizeLoyaltyRedemptionInput(options = {}) {
  if (!fields.loyaltyRedemption) {
    return { value: 0, changed: false };
  }

  const maxRedeem = Number.isFinite(Number(options.maxRedeem))
    ? Math.max(0, Math.floor(Number(options.maxRedeem)))
    : Infinity;
  const raw = String(fields.loyaltyRedemption.value || '').replace(/\D/g, '');
  let value = raw ? Number(raw) : 0;
  if (!Number.isFinite(value) || value < 0) {
    value = 0;
  }
  value = Math.floor(value);
  if (Number.isFinite(maxRedeem)) {
    value = Math.min(value, maxRedeem);
  }
  if (options.forceZero && !raw) {
    value = 0;
  }

  const next = String(value);
  const changed = fields.loyaltyRedemption.value !== next;
  if (changed) {
    fields.loyaltyRedemption.value = next;
  }
  return { value, changed };
}

function validateLoyaltyBeforeSubmit() {
  const redemption = Number(normalizeLoyaltyRedemptionInput({ forceZero: true }).value || 0);
  if (redemption <= 0) {
    return;
  }
  if (!config.loyalty?.enabled) {
    throw new Error('Бонусная система выключена. Уберите списание бонусов.');
  }
  if (getCustomerMode() === 'retail') {
    throw new Error('Для розничного покупателя нельзя списывать бонусы. Выберите старого или нового клиента.');
  }
  if (loyaltyLoading) {
    throw new Error('Подождите, система проверяет бонусы клиента.');
  }
  if (loyaltyError) {
    throw new Error(`Бонусы не проверены: ${loyaltyError}`);
  }
  if (!loyaltyCustomer) {
    throw new Error('Клиент еще не найден в бонусной базе. Можно только начислить бонусы после покупки.');
  }
  const balance = Number(loyaltyCustomer.bonus_balance || 0);
  if (redemption > balance) {
    throw new Error(`У клиента доступно только ${formatNumber(balance)} бонусов.`);
  }
}

async function updateCalculation() {
  clearStatus();
  if (!orderItems.length) {
    lastCalculation = null;
    renderEmptyCalculation();
    renderLoyaltyPanel();
    return;
  }

  try {
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPayload())
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(formatApiError(data, 'Ошибка расчета.'));
    }
    lastCalculation = data;
    renderCalculation(data);
    renderLoyaltyPanel();
  } catch (error) {
    lastCalculation = null;
    setStatus(error.message, 'error');
    renderLoyaltyPanel();
  }
}

function renderEmptyCalculation() {
  const emptyData = {
    baseTotal: 0,
    productLabel: 'Добавьте товар',
    paymentType: getSelectedPaymentType()?.name || '',
    prepaidTotal: 0,
    loyaltyRedemption: 0,
    installmentBaseLabel: 'Остаток',
    installmentBase: 0,
    commission: 0,
    finalTotal: 0,
    monthlyPaymentLabel: 'Платеж в месяц',
    monthlyPayment: 0
  };
  renderSummary(summary, emptyData);
  renderSummary(compactSummary, emptyData);
}

function renderCalculation(data) {
  const summaryData = {
    baseTotal: data.baseTotal,
    productLabel: data.items?.length > 1 ? `${data.items.length} товара` : data.items?.[0]?.productName || 'Выберите товар',
    paymentType: data.paymentType,
    prepaidTotal: data.prepaidTotal,
    loyaltyRedemption: data.loyaltyRedemption || 0,
    installmentBaseLabel: getRemainderLabel(data),
    installmentBase: data.installmentBase,
    commission: data.commission,
    finalTotal: data.finalTotal,
    monthlyPaymentLabel: isDebtPayment(data) ? 'К оплате потом' : 'Платеж в месяц',
    monthlyPayment: data.monthlyPayment
  };
  renderSummary(summary, summaryData);
  renderSummary(compactSummary, summaryData);
}

function renderSummary(target, data) {
  if (!target?.baseTotal) {
    return;
  }

  target.baseTotal.textContent = formatSom(data.baseTotal);
  target.productLabel.textContent = data.productLabel;
  target.paymentTypeLabel.textContent = data.paymentType;
  target.prepaidTotal.textContent = formatSom(data.prepaidTotal);
  if (target.loyaltyRow && target.loyaltyRedemption) {
    const showLoyalty = Number(data.loyaltyRedemption || 0) > 0;
    target.loyaltyRow.classList.toggle('hidden', !showLoyalty);
    target.loyaltyRedemption.textContent = `-${formatSom(data.loyaltyRedemption)}`;
  }
  target.installmentBaseLabel.textContent = data.installmentBaseLabel;
  target.installmentBase.textContent = formatSom(data.installmentBase);
  if (target.commission) {
    target.commission.textContent = formatSom(data.commission);
  }
  target.finalTotal.textContent = formatSom(data.finalTotal);
  target.monthlyPaymentLabel.textContent = data.monthlyPaymentLabel;
  target.monthlyPayment.textContent = formatSom(data.monthlyPayment);
}

function getPayload() {
  const selectedPaymentType = getSelectedPaymentType();
  const selectedEmployee = getSelectedEmployee();
  return {
    items: orderItems,
    cashPrepayment: fields.cashPrepayment.value,
    prepaymentMethodName: fields.prepaymentMethod.value,
    transferPrepayment: fields.transferPrepayment.value,
    loyaltyRedemption: fields.loyaltyRedemption?.value || '0',
    paymentTypeName: selectedPaymentType?.name || '',
    paymentTypeHref: selectedPaymentType?.href || '',
    paymentTypeRate: selectedPaymentType?.rate ?? 0,
    employeeName: selectedEmployee?.name || '',
    employeeHref: selectedEmployee?.href || '',
    retailStoreName: getSelectedStore()?.name || '',
    retailStoreHref: getSelectedStore()?.href || '',
    storeHref: getSelectedStore()?.storeHref || '',
    customerMode: getCustomerMode(),
    customerHref: getSelectedCustomer()?.href || '',
    customerName: fields.customerName.value.trim(),
    customerPhone: fields.customerPhone.value.trim(),
    customerAddress: fields.customerAddress.value.trim()
  };
}

function parseMoney(value) {
  if (typeof value === 'string') {
    return Number(value.replace(/\s/g, '').replace(',', '.'));
  }
  return Number(value);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getSelectedPaymentType() {
  return paymentTypes.find((paymentType) => paymentType.href === paymentTypeSelect.value);
}

function getVisiblePaymentTypes() {
  const scenario = getPaymentScenario();
  if (scenario === 'bank') {
    return paymentTypes.filter(isBankScenarioPaymentType);
  }
  if (scenario === 'mixed') {
    return paymentTypes.filter(isBankPaymentType);
  }
  if (scenario === 'cash') {
    return paymentTypes.filter(isCashPaymentType);
  }
  if (scenario === 'debt') {
    return paymentTypes.filter(isDebtPaymentType);
  }
  return paymentTypes;
}

function selectPaymentType(paymentType) {
  if (paymentType) {
    paymentTypeSelect.value = paymentType.href;
  }
}

function findCashPaymentType() {
  return paymentTypes.find(isCashPaymentType) || paymentTypes[0];
}

function findDebtPaymentType() {
  return paymentTypes.find(isDebtPaymentType) || paymentTypes[0];
}

function getPrepaymentMethods() {
  const methods = [{ name: 'Наличными' }];
  for (const paymentType of paymentTypes.filter(isQrPaymentType)) {
    if (!methods.some((method) => method.name === paymentType.name)) {
      methods.push({ name: paymentType.name });
    }
  }
  return methods;
}

function isCashPaymentType(paymentType) {
  const name = String(paymentType?.name || '').toLowerCase();
  return name.includes('налич') || name.includes('cash') || name.includes('qr') || name.includes('карта');
}

function isQrPaymentType(paymentType) {
  const name = String(paymentType?.name || '').toLowerCase();
  return name.includes('qr');
}

function isDebtPaymentType(paymentType) {
  return String(paymentType?.name || '').toLowerCase().includes('долг');
}

function isBankScenarioPaymentType(paymentType) {
  return !isDebtPaymentType(paymentType) && !isCashOnlyPaymentType(paymentType);
}

function isCashOnlyPaymentType(paymentType) {
  const name = String(paymentType?.name || '').toLowerCase();
  return name.includes('налич') || name.includes('cash') || name.includes('карта');
}

function isBankPaymentType(paymentType) {
  return !isCashPaymentType(paymentType) && !isDebtPaymentType(paymentType);
}

function getSelectedEmployee() {
  return employees.find((employee) => employee.href === employeeSelect.value);
}

function getSelectedStore() {
  return stores.find((store) => store.href === storeSelect.value);
}

function getSelectedCustomer() {
  return customers.find((customer) => customer.href === existingCustomerSelect.value);
}

function getCustomerMode() {
  return document.querySelector('input[name="customerMode"]:checked')?.value || 'new';
}

function getPaymentScenario() {
  return document.querySelector('input[name="paymentScenario"]:checked')?.value || 'cash';
}

function getDocumentTitle(type) {
  if (type === 'retaildemand') {
    return 'Продажа';
  }
  if (type === 'customerorder') {
    return 'Заказ покупателя';
  }
  if (type === 'demand') {
    return 'Отгрузка';
  }
  return 'Документ';
}

function showSuccessModal(data, message) {
  successMessage.textContent = message;
  openMoyskladButton.disabled = !getMoySkladWebUrl(data.document);
  successModal.classList.remove('hidden');
  renderPrintReceipt(data);
}

function getLoyaltyResultText(loyalty) {
  if (!loyalty?.enabled) {
    return '';
  }
  if (loyalty.error) {
    return ` Бонусы не обновились: ${loyalty.error}`;
  }
  const parts = [];
  if (loyalty.redeemed > 0) {
    parts.push(`списано ${formatNumber(loyalty.redeemed)}`);
  }
  if (loyalty.accrued > 0) {
    parts.push(`начислено ${formatNumber(loyalty.accrued)}`);
  }
  if (loyalty.balance !== null && loyalty.balance !== undefined) {
    parts.push(`остаток ${formatNumber(loyalty.balance)}`);
  }
  return parts.length ? ` Бонусы: ${parts.join(', ')}.` : '';
}

function getMoySkladWebUrl(document) {
  if (!document?.id || !document?.type) {
    return '';
  }

  return `https://online.moysklad.ru/app/#${document.type}/edit?id=${encodeURIComponent(document.id)}`;
}

function renderPrintReceipt(data) {
  const calculation = data?.calculation || {};
  const document = data?.document || {};
  const payload = data?.requestPayload || {};
  const rows = Array.isArray(calculation.items) ? calculation.items : [];
  const total = Number(calculation.finalTotal || calculation.baseTotal || 0);
  const buyer = getPrintBuyer(payload);
  const storeName = payload.retailStoreName || payload.storeName || '';
  const employeeName = payload.employeeName || '';
  const paymentType = calculation.paymentType || payload.paymentTypeName || '';
  const paid = Number(calculation.prepaidTotal || calculation.finalTotal || 0);
  const unpaid = Math.max(0, total - paid);
  const loyalty = data?.loyalty || {};
  const baseTotal = Number(calculation.baseTotal || total || 0);
  const loyaltyRedemption = Number(calculation.loyaltyRedemption || 0);

  printReceipt.innerHTML = `
    <div class="thermal-receipt">
      <h1>ТОВАРНЫЙ ЧЕК</h1>
      <div class="receipt-center">ИП Матаев Женишбек Камилович</div>
      <div class="receipt-line"></div>

      <div class="receipt-row"><span>Документ:</span><b>№ ${escapeHtml(document.name || '')}</b></div>
      <div class="receipt-row"><span>Дата:</span><b>${formatReceiptDate(document.moment || new Date())}</b></div>
      <div class="receipt-row"><span>Склад:</span><b>${escapeHtml(storeName || '-')}</b></div>
      <div class="receipt-row"><span>Кассир:</span><b>${escapeHtml(employeeName || '-')}</b></div>
      <div class="receipt-row"><span>Покупатель:</span><b>${escapeHtml(buyer || '-')}</b></div>

      <div class="receipt-line"></div>
      <div class="receipt-items">
        ${rows.map((item, index) => `
          <div class="receipt-item">
            <div class="receipt-item-name">${index + 1}. ${escapeHtml(item.productName || '')}</div>
            <div class="receipt-item-calc">
              <span>${formatReceiptMoney(item.productPrice || 0)} x ${escapeHtml(String(item.quantity || 1))}</span>
              <b>${formatReceiptMoney(item.lineTotal || 0)}</b>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="receipt-line"></div>
      <div class="receipt-row"><span>Сумма товаров:</span><b>${formatReceiptMoney(baseTotal)} сом</b></div>
      ${loyaltyRedemption > 0 ? `<div class="receipt-row"><span>Бонусами:</span><b>-${formatReceiptMoney(loyaltyRedemption)} сом</b></div>` : ''}
      <div class="receipt-total"><span>К ОПЛАТЕ</span><b>${formatReceiptMoney(total)} сом</b></div>
      <div class="receipt-row"><span>Тип оплаты:</span><b>${escapeHtml(paymentType || '-')}</b></div>
      ${loyaltyRedemption > 0 ? `<div class="receipt-row"><span>Списано бонусов:</span><b>${formatNumber(loyaltyRedemption)}</b></div>` : ''}
      <div class="receipt-row"><span>Оплачено:</span><b>${formatReceiptMoney(paid)} сом</b></div>
      ${unpaid > 0 ? `<div class="receipt-row"><span>Не оплачено:</span><b>${formatReceiptMoney(unpaid)} сом</b></div>` : ''}
      ${loyalty.accrued > 0 ? `<div class="receipt-row"><span>Бонусы начислено:</span><b>${formatNumber(loyalty.accrued)}</b></div>` : ''}
      ${loyalty.balance !== null && loyalty.balance !== undefined ? `<div class="receipt-row"><span>Баланс бонусов:</span><b>${formatNumber(loyalty.balance)}</b></div>` : ''}

      <div class="receipt-line"></div>
      <div class="receipt-count">Позиций: ${rows.length}</div>
      <div class="receipt-thanks">Спасибо за покупку!</div>
      <div class="receipt-cut"></div>
    </div>
  `;
}

function getPrintBuyer(payload) {
  if (payload.customerMode === 'retail') {
    return 'Розничный покупатель';
  }

  const parts = [payload.customerName, payload.customerPhone].filter(Boolean);
  return parts.join(', ') || 'Розничный покупатель';
}

function formatReceiptDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatReceiptMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberToRussianSom(value) {
  const amount = Math.round(Number(value || 0) * 100);
  const soms = Math.floor(amount / 100);
  const tyiyn = amount % 100;
  const words = integerToRussianWords(soms);
  const result = `${words} ${plural(soms, ['сом', 'сома', 'сомов'])} ${String(tyiyn).padStart(2, '0')} ${plural(tyiyn, ['тыйын', 'тыйына', 'тыйынов'])}`;
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function integerToRussianWords(number) {
  if (!number) {
    return 'ноль';
  }

  const units = [
    ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  ];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const scales = [
    ['', '', '', 0],
    ['тысяча', 'тысячи', 'тысяч', 1],
    ['миллион', 'миллиона', 'миллионов', 0]
  ];

  const parts = [];
  let rest = Math.floor(number);
  let scaleIndex = 0;

  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) {
      const gender = scales[scaleIndex]?.[3] || 0;
      const chunkWords = [];
      chunkWords.push(hundreds[Math.floor(chunk / 100)]);
      const lastTwo = chunk % 100;
      if (lastTwo >= 10 && lastTwo < 20) {
        chunkWords.push(teens[lastTwo - 10]);
      } else {
        chunkWords.push(tens[Math.floor(lastTwo / 10)]);
        chunkWords.push(units[gender][lastTwo % 10]);
      }
      const scale = scales[scaleIndex];
      if (scaleIndex > 0) {
        chunkWords.push(plural(chunk, [scale[0], scale[1], scale[2]]));
      }
      parts.unshift(chunkWords.filter(Boolean).join(' '));
    }
    rest = Math.floor(rest / 1000);
    scaleIndex += 1;
  }

  return parts.join(' ');
}

function plural(number, forms) {
  const abs = Math.abs(number) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return forms[2];
  }
  if (last > 1 && last < 5) {
    return forms[1];
  }
  if (last === 1) {
    return forms[0];
  }
  return forms[2];
}

function getRemainderLabel(data) {
  if (isDebtPayment(data)) {
    return 'В долг';
  }
  if (Number(data?.commission || 0) > 0) {
    return 'В рассрочку';
  }
  return 'Остаток';
}

function isDebtPayment(data) {
  return String(data?.paymentType || '').toLowerCase().includes('долг');
}

function formatApiError(data, fallback) {
  const details = data?.details?.errors;
  if (Array.isArray(details) && details.length) {
    return details.map((item) => item.error || item.message).filter(Boolean).join(' ');
  }
  return data?.error || fallback;
}

function formatSom(value) {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)} сом`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ''}`;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'status';
}
