const form = document.querySelector('#orderForm');
const app = document.querySelector('.app');
const branchScreen = document.querySelector('#branchScreen');
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

const fields = {
  productSearch: document.querySelector('#productSearch'),
  productResults: document.querySelector('#productResults'),
  customerSearch: document.querySelector('#customerSearch'),
  customerResults: document.querySelector('#customerResults'),
  customerSearchField: document.querySelector('#customerSearchField'),
  existingCustomerField: document.querySelector('#existingCustomerField'),
  cashPrepaymentField: document.querySelector('#cashPrepaymentField'),
  transferPrepaymentField: document.querySelector('#transferPrepaymentField'),
  paymentTypeField: document.querySelector('#paymentTypeField'),
  cashPrepayment: document.querySelector('#cashPrepayment'),
  transferPrepayment: document.querySelector('#transferPrepayment'),
  customerName: document.querySelector('#customerName'),
  customerPhone: document.querySelector('#customerPhone'),
  customerAddress: document.querySelector('#customerAddress')
};

const summary = {
  baseTotal: document.querySelector('#baseTotal'),
  productLabel: document.querySelector('#productLabel'),
  paymentTypeLabel: document.querySelector('#paymentTypeLabel'),
  prepaidTotal: document.querySelector('#prepaidTotal'),
  installmentBaseLabel: document.querySelector('#installmentBaseLabel'),
  installmentBase: document.querySelector('#installmentBase'),
  commission: document.querySelector('#commission'),
  finalTotal: document.querySelector('#finalTotal'),
  monthlyPaymentLabel: document.querySelector('#monthlyPaymentLabel'),
  monthlyPayment: document.querySelector('#monthlyPayment')
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
let duplicateCustomer = null;
let submitInProgress = false;
let selectedBranch = '';
let productsLoading = false;

const branches = {
  ayu: 'Аю-Гранд',
  besh: 'Беш-Сары'
};

init();

async function init() {
  try {
    const response = await fetch('/api/config');
    config = await response.json();
    await loadPaymentTypes();
    await loadEmployees();
    await loadStores();
    await loadCustomers();
    await loadProducts();
    renderCustomerMode();
    initBranchSelection();
    await updateCalculation();
  } catch (error) {
    setStatus('Не удалось загрузить настройки расчета.', 'error');
  }
}

for (const button of document.querySelectorAll('[data-branch]')) {
  button.addEventListener('click', () => {
    selectBranch(button.dataset.branch);
  });
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
});

for (const radio of document.querySelectorAll('input[name="customerMode"]')) {
  radio.addEventListener('change', () => {
    renderCustomerMode();
    scheduleDuplicateCustomerCheck();
  });
}

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
    setStatus(`Готово. ${documentTitle}${documentName} создан в МойСклад.${paymentText}`, 'success');
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

async function loadProducts(search = '') {
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

    products = data.products;
    refreshItemProductOptions();
    renderProductResults();
    updateCalculation();
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
  applyPaymentScenario();
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
  fields.paymentTypeField.classList.toggle('hidden', scenario === 'cash' || scenario === 'debt');

  if (scenario === 'cash') {
    fields.cashPrepayment.value = '0';
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
  if (!selected || !isBankPaymentType(selected)) {
    selectPaymentType(paymentTypes.find(isBankPaymentType));
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
  const existing = getCustomerMode() === 'existing';
  fields.customerSearchField.classList.toggle('hidden', !existing);
  fields.customerResults.classList.toggle('hidden', !existing);
  fields.existingCustomerField.classList.add('hidden');
  fields.customerName.readOnly = existing;
  fields.customerName.required = !existing;
  renderMissingCustomerAction();
  renderDuplicateCustomerWarning();
  renderCustomerResults();
  if (existing) {
    applySelectedCustomer();
  }
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

async function updateCalculation() {
  clearStatus();
  if (!orderItems.length) {
    renderEmptyCalculation();
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
      throw new Error(data.error || 'Ошибка расчета.');
    }
    renderCalculation(data);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderEmptyCalculation() {
  summary.baseTotal.textContent = formatSom(0);
  summary.productLabel.textContent = 'Добавьте товар';
  summary.paymentTypeLabel.textContent = getSelectedPaymentType()?.name || '';
  summary.prepaidTotal.textContent = formatSom(0);
  summary.installmentBaseLabel.textContent = 'Остаток';
  summary.installmentBase.textContent = formatSom(0);
  summary.commission.textContent = formatSom(0);
  summary.finalTotal.textContent = formatSom(0);
  summary.monthlyPaymentLabel.textContent = 'Платеж в месяц';
  summary.monthlyPayment.textContent = formatSom(0);
}

function renderCalculation(data) {
  summary.baseTotal.textContent = formatSom(data.baseTotal);
  summary.productLabel.textContent = data.items?.length > 1 ? `${data.items.length} товара` : data.items?.[0]?.productName || 'Выберите товар';
  summary.paymentTypeLabel.textContent = data.paymentType;
  summary.prepaidTotal.textContent = formatSom(data.prepaidTotal);
  summary.installmentBaseLabel.textContent = getRemainderLabel(data);
  summary.installmentBase.textContent = formatSom(data.installmentBase);
  summary.commission.textContent = formatSom(data.commission);
  summary.finalTotal.textContent = formatSom(data.finalTotal);
  summary.monthlyPaymentLabel.textContent = isDebtPayment(data) ? 'К оплате потом' : 'Платеж в месяц';
  summary.monthlyPayment.textContent = formatSom(data.monthlyPayment);
}

function getPayload() {
  const selectedPaymentType = getSelectedPaymentType();
  const selectedEmployee = getSelectedEmployee();
  return {
    items: orderItems,
    cashPrepayment: fields.cashPrepayment.value,
    transferPrepayment: fields.transferPrepayment.value,
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
  if (scenario === 'bank' || scenario === 'mixed') {
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

function isCashPaymentType(paymentType) {
  const name = String(paymentType?.name || '').toLowerCase();
  return name.includes('налич') || name.includes('cash') || name.includes('qr') || name.includes('карта');
}

function isDebtPaymentType(paymentType) {
  return String(paymentType?.name || '').toLowerCase().includes('долг');
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

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ''}`;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = 'status';
}
