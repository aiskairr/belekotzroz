import { navigation } from './crm-shell.js';

const form = document.querySelector('#orderForm');
const app = document.querySelector('.app');
const branchScreen = document.querySelector('#branchScreen');
const appPreloader = document.querySelector('#appPreloader');
const branchLabel = document.querySelector('#branchLabel');
const paymentTypeSelect = document.querySelector('#paymentType');
const secondPaymentTypeSelect = document.querySelector('#secondPaymentType');
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
const fiscalStatusCard = document.querySelector('#fiscalStatusCard');
const fiscalStatusBadge = document.querySelector('#fiscalStatusBadge');
const fiscalStatusTitle = document.querySelector('#fiscalStatusTitle');
const fiscalStatusText = document.querySelector('#fiscalStatusText');
const fiscalStatusChecklist = document.querySelector('#fiscalStatusChecklist');
const retryFiscalizationButton = document.querySelector('#retryFiscalizationButton');
const printDocumentButton = document.querySelector('#printDocumentButton');
const printPkoButton = document.querySelector('#printPkoButton');
const openMoyskladButton = document.querySelector('#openMoyskladButton');
const closeSuccessModalButton = document.querySelector('#closeSuccessModalButton');
const printReceipt = document.querySelector('#printReceipt');
const receiptPhotoInput = document.querySelector('#receiptPhoto');
const receiptPhotoPreview = document.querySelector('#receiptPhotoPreview');
const receiptPhotoImage = document.querySelector('#receiptPhotoImage');
const receiptPhotoName = document.querySelector('#receiptPhotoName');
const clearReceiptPhotoButton = document.querySelector('#clearReceiptPhoto');
const openReceiptCameraButton = document.querySelector('#openReceiptCamera');
const receiptCameraPanel = document.querySelector('#receiptCameraPanel');
const receiptCameraVideo = document.querySelector('#receiptCameraVideo');
const receiptCameraCanvas = document.querySelector('#receiptCameraCanvas');
const captureReceiptPhotoButton = document.querySelector('#captureReceiptPhoto');
const closeReceiptCameraButton = document.querySelector('#closeReceiptCamera');
const receiptCameraStatus = document.querySelector('#receiptCameraStatus');
const crmLoginScreen = document.querySelector('#crmLoginScreen');
const crmLoginForm = document.querySelector('#crmLoginForm');
const crmLoginStatus = document.querySelector('#crmLoginStatus');
const draftStatus = document.querySelector('#draftStatus');
const clearDraftButton = document.querySelector('#clearDraftButton');
const crmSidebar = document.querySelector('#crmSidebar');
const crmTopbar = document.querySelector('#crmTopbar');
const crmBranchLabel = document.querySelector('#crmBranchLabel');
const switchBranchButton = document.querySelector('#switchBranchButton');
const switchBranchName = document.querySelector('#switchBranchName');
const branchCancelButton = document.querySelector('#branchCancelButton');
const settingsModal = document.querySelector('#settingsModal');
const openSettingsButton = document.querySelector('#openSettingsButton');
const topSettingsButton = document.querySelector('#topSettingsButton');
const closeSettingsButton = document.querySelector('#closeSettingsButton');
const sidebarToggle = document.querySelector('#sidebarToggle');
const processSteps = [...document.querySelectorAll('.process-steps span')];
const debtSaleMode = window.location.pathname === '/debt-sale.html';
const moyskladMonitor = document.querySelector('#moyskladMonitor');
const moyskladMonitorRpm = document.querySelector('#moyskladMonitorRpm');
const moyskladMonitorQueue = document.querySelector('#moyskladMonitorQueue');
const moyskladMonitorActive = document.querySelector('#moyskladMonitorActive');
let moyskladMonitorTimer = 0;

form.noValidate = true;

const defaultUiSettings = {
  theme: 'blue',
  mode: 'light',
  density: 'comfortable',
  confirmBeforeSubmit: true,
  focusProductSearch: true,
  stickySummary: true,
  accentColor: '#2563eb'
};
let uiSettings = loadUiSettings();

function normalizeKyrgyzPhoneInput(rawValue) {
  const value = String(rawValue || '');
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('996')) return `+${digits.slice(0, 12)}`;
  if (digits.startsWith('0')) return `+996${digits.slice(1, 10)}`;
  return `+996${digits.slice(0, 9)}`;
}

function bindAutoKyrgyzPhonePrefix(input) {
  if (!input) return;
  input.addEventListener('focus', () => {
    if (!String(input.value || '').trim()) {
      input.value = '+996';
    }
  });
  input.addEventListener('input', () => {
    const normalized = normalizeKyrgyzPhoneInput(input.value);
    if (!normalized) return;
    if (input.value !== normalized) {
      input.value = normalized;
    }
  });
  input.addEventListener('blur', () => {
    if (String(input.value || '').trim() === '+996') {
      input.value = '';
    }
  });
}

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
  paymentTypeFieldLabel: document.querySelector('#paymentTypeFieldLabel'),
  secondPaymentTypeField: document.querySelector('#secondPaymentTypeField'),
  secondBankAmountField: document.querySelector('#secondBankAmountField'),
  secondPaymentType: secondPaymentTypeSelect,
  secondBankAmount: document.querySelector('#secondBankAmount'),
  mixedBankSplit: document.querySelector('#mixedBankSplit'),
  primaryBankPreviewLabel: document.querySelector('#primaryBankPreviewLabel'),
  primaryBankAmountPreview: document.querySelector('#primaryBankAmountPreview'),
  secondBankPreviewLabel: document.querySelector('#secondBankPreviewLabel'),
  secondBankAmountPreview: document.querySelector('#secondBankAmountPreview'),
  cashPrepayment: document.querySelector('#cashPrepayment'),
  prepaymentMethod: document.querySelector('#prepaymentMethod'),
  transferPrepayment: document.querySelector('#transferPrepayment'),
  loyaltyRedemption: document.querySelector('#loyaltyRedemption'),
  customerName: document.querySelector('#customerName'),
  customerPhone: document.querySelector('#customerPhone'),
  customerAddressField: document.querySelector('#customerAddressField'),
  customerAddress: document.querySelector('#customerAddress'),
  deliveryEnabled: document.querySelector('#deliveryEnabled'),
  deliveryFields: document.querySelector('#deliveryFields'),
  deliveryDate: document.querySelector('#deliveryDate'),
  deliveryTime: document.querySelector('#deliveryTime'),
  deliveryAddress: document.querySelector('#deliveryAddress'),
  deliveryNotes: document.querySelector('#deliveryNotes')
};

bindAutoKyrgyzPhonePrefix(fields.customerPhone);

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
let productSearchController = null;
const productSearchCache = new Map();
const MIN_PRODUCT_SEARCH_LENGTH = 2;
const PRODUCT_CACHE_LIMIT = 60;
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
let receiptCameraStream = null;
let lastCreatedOrder = null;
let currentCrmUser = null;
let appInitialized = false;
let draftSaveTimer = 0;
let draftRestored = false;

const branches = {
  ayu: 'Аю-Гранд',
  besh: 'Беш-Сары'
};

boot();

applyUiSettings();
bindCrmShell();
configureSaleMode();

function configureSaleMode() {
  if (!debtSaleMode) return;

  document.body.classList.add('debt-sale-mode');
  document.querySelector('#paymentScenarioField')?.classList.add('hidden');
  document.querySelector('#salesNavLink')?.classList.remove('active');
  document.querySelector('#debtSaleNavLink')?.classList.add('active');
  const debtTopbarLink = document.querySelector('.debts-topbar-button');
  if (debtTopbarLink) {
    debtTopbarLink.href = '/sales.html';
    debtTopbarLink.textContent = 'Обычная продажа';
  }
  const debtRadio = document.createElement('input');
  debtRadio.type = 'radio';
  debtRadio.name = 'paymentScenario';
  debtRadio.value = 'debt';
  debtRadio.checked = true;
  debtRadio.className = 'hidden';
  form.append(debtRadio);
  const title = document.querySelector('#crmPageTitle');
  const eyebrow = document.querySelector('#saleOverviewEyebrow');
  const overviewTitle = document.querySelector('#saleOverviewTitle');
  const overviewText = document.querySelector('#saleOverviewText');
  if (title) title.textContent = 'Продажа в долг';
  if (eyebrow) eyebrow.textContent = 'Отдельный режим';
  if (overviewTitle) overviewTitle.textContent = 'Оформление продажи в долг';
  if (overviewText) overviewText.textContent = 'Используйте этот раздел только в исключительных случаях.';
  receiptPhotoInput.required = false;
  const receiptLabel = receiptPhotoInput.closest('label')?.querySelector('span');
  if (receiptLabel) receiptLabel.innerHTML = 'Фото чека <small>(необязательно)</small>';
}

function renderCrmNavigation() {
  const nav = document.querySelector('#crmNav');
  if (!nav) return;
  const activePage = debtSaleMode ? 'debtSale' : 'sales';
  nav.innerHTML = navigation
    .filter((item) => hasCrmPermission(item.permission))
    .map((item) => `<a id="${item.id}NavLink" class="${item.id === activePage ? 'active' : ''}" href="${item.href}" data-permission="${item.permission}">${escapeHtml(item.label)}</a>`)
    .join('');
}

async function boot() {
  bindLogin();
  const session = await fetch('/api/crm/session').then((response) => response.json()).catch(() => ({ user: null }));
  if (!session.user) {
    await loadLoginUsers();
    crmLoginScreen.classList.remove('hidden');
    appPreloader.classList.add('hidden');
    return;
  }
  await enterCrm(session.user);
}

async function enterCrm(user) {
  currentCrmUser = user;
  document.body.dataset.role = user.role;
  await loadUserUiSettings();
  applyUiSettings();
  syncSettingsControls();
  renderCrmNavigation();
  applyRoleAccess(user);
  startMoySkladMonitor();
  crmLoginScreen.classList.add('hidden');
  const requestedPage = getRequestedPage();
  const requiredPermission = debtSaleMode ? 'debtSale' : 'sales';
  if (!hasCrmPermission(requiredPermission)) {
    window.location.href = requestedPage || getDefaultCrmPage(user);
    return;
  }
  if (requestedPage && requestedPage !== '/' && requestedPage !== '/sales.html') {
    window.location.href = requestedPage;
    return;
  }
  if (!appInitialized) {
    appInitialized = true;
    await initializeSalesApp();
  }
}

async function loadLoginUsers() {
  const select = document.querySelector('#crmLogin');
  try {
    const response = await fetch('/api/crm/login-users');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить сотрудников.');
    select.innerHTML = '<option value="">Выберите сотрудника</option>';
    for (const user of data.users || []) {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.name}${user.passwordSet ? '' : ' (пароль не задан)'}`;
      option.disabled = !user.passwordSet;
      select.append(option);
    }
  } catch (error) {
    select.innerHTML = '<option value="">Сотрудники недоступны</option>';
    crmLoginStatus.textContent = error.message;
  }
}

function getRequestedPage() {
  const value = new URLSearchParams(window.location.search).get('next') || '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
}

function bindLogin() {
  crmLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    crmLoginStatus.textContent = 'Проверяю доступ...';
    try {
      const response = await fetch('/api/crm/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: document.querySelector('#crmLogin').value.trim(),
          password: document.querySelector('#crmPassword').value
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось войти.');
      crmLoginStatus.textContent = '';
      await enterCrm(data.user);
    } catch (error) {
      crmLoginStatus.textContent = error.message;
    }
  });
}

async function initializeSalesApp() {
  try {
    setAppPreloader(true, 'Загружаю настройки...');
    const response = await fetch('/api/config');
    config = await response.json();
    await loadPaymentTypes();
    await loadEmployees();
    await loadStores();
    await loadCustomers();
    productsReady = true;
    renderProductResults();
    renderCustomerMode();
    initBranchSelection();
    restoreDraft();
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
  scheduleDraftSave();
});

form.addEventListener('change', (event) => {
  if (event.target?.name === 'customerMode') {
    renderCustomerMode();
    scheduleDuplicateCustomerCheck();
  }
  scheduleDraftSave();
});

paymentTypeSelect.addEventListener('change', () => {
  renderSecondPaymentTypes();
  updateCalculation();
  renderProductResults();
  scheduleDraftSave();
});

secondPaymentTypeSelect.addEventListener('change', () => {
  updateCalculation();
  scheduleDraftSave();
});

for (const radio of document.querySelectorAll('input[name="paymentScenario"]')) {
  radio.addEventListener('change', () => {
    applyPaymentScenario();
    updateCalculation();
    renderProductResults();
  });
}

employeeSelect.addEventListener('change', () => {
  updateCalculation();
});

storeSelect.addEventListener('change', () => {
  loadProducts(fields.productSearch.value);
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
  window.clearTimeout(searchTimer);
  const search = fields.productSearch.value.trim();
  if (search.length < MIN_PRODUCT_SEARCH_LENGTH) {
    productSearchController?.abort();
    productSearchController = null;
    products = [];
    refreshItemProductOptions();
    renderProductResults();
    return;
  }

  renderProductResults('Ищу товары...');
  searchTimer = window.setTimeout(() => {
    loadProducts(search);
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

fields.deliveryEnabled.addEventListener('change', () => {
  if (fields.deliveryEnabled.checked) {
    setDefaultDeliverySchedule();
    if (!fields.deliveryAddress.value.trim()) fields.deliveryAddress.value = fields.customerAddress.value.trim();
  }
  renderDeliveryFields();
  renderCustomerMode();
  renderOrderItems();
  scheduleDraftSave();
});

fields.customerAddress.addEventListener('input', () => {
  if (fields.deliveryEnabled.checked && !fields.deliveryAddress.dataset.edited) {
    fields.deliveryAddress.value = fields.customerAddress.value;
  }
});
fields.deliveryAddress.addEventListener('input', () => { fields.deliveryAddress.dataset.edited = 'true'; });

receiptPhotoInput.addEventListener('change', renderReceiptPhotoPreview);
openReceiptCameraButton?.addEventListener('click', openReceiptCamera);
captureReceiptPhotoButton?.addEventListener('click', captureReceiptPhoto);
closeReceiptCameraButton?.addEventListener('click', closeReceiptCamera);
clearReceiptPhotoButton.addEventListener('click', () => {
  receiptPhotoInput.value = '';
  closeReceiptCamera();
  renderReceiptPhotoPreview();
});

window.addEventListener('pagehide', () => closeReceiptCamera());

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

printPkoButton?.addEventListener('click', () => {
  if (!lastCreatedOrder) {
    return;
  }
  printPko(lastCreatedOrder);
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

submitButton.addEventListener('click', (event) => {
  event.preventDefault();
  if (!submitButton.disabled) {
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitInProgress) {
    return;
  }

  try {
    validateBeforeSubmit();
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }

  if (uiSettings.confirmBeforeSubmit) {
    const total = lastCalculation?.finalTotal || lastCalculation?.baseTotal || 0;
    const confirmed = window.confirm(`Создать документ в МойСклад на сумму ${formatSom(total)}?`);
    if (!confirmed) return;
  }

  submitInProgress = true;
  updateSubmitButtonState();
  setStatus('Создаю документ в МойСклад...', '');

  try {
    if (duplicateCustomer && getCustomerMode() === 'new') {
      throw new Error(`Такой клиент уже есть: ${duplicateCustomer.name}. Выберите режим "Старый клиент".`);
    }
    validateLoyaltyBeforeSubmit();

    const payload = getPayload();
    const hasReceiptPhoto = Boolean(receiptPhotoInput.files?.[0]);
    if (hasReceiptPhoto || !debtSaleMode) {
      setStatus('Подготавливаю фото чека...', '');
      payload.receiptPhoto = await prepareReceiptPhoto();
    }
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
    const deliveryText = data.delivery ? ' Доставка добавлена в расписание.' : '';
    const deliveryErrorText = data.deliveryError ? ` Внимание: доставка не сохранена (${data.deliveryError}).` : '';
    const fiscalizationText = data.fiscalization?.success
      ? ' Чек отправлен на автофискализацию.'
      : data.fiscalization?.attempted && data.fiscalization?.error
        ? ` Внимание: автофискализация не ушла (${data.fiscalization.error}).`
        : '';
    const telegramText = data.telegramReceipt?.sent ? ' Фото чека отправлено в Telegram.' : '';
    const telegramErrorText = data.telegramReceipt?.error ? ` Внимание: фото не отправлено (${data.telegramReceipt.error}).` : '';
    const loyaltyText = getLoyaltyResultText(data.loyalty);
    lastCreatedOrder = { ...data, requestPayload: payload };
    clearDraft();
    showSuccessModal(lastCreatedOrder, `${documentTitle}${documentName} создан в МойСклад.${paymentText}${deliveryText}${deliveryErrorText}${fiscalizationText}${telegramText}${telegramErrorText}${loyaltyText}`);
    setStatus(`Готово. ${documentTitle}${documentName} создан в МойСклад.${paymentText}${deliveryText}${deliveryErrorText}${fiscalizationText}${telegramText}${telegramErrorText}${loyaltyText}`, data.deliveryError || data.fiscalization?.error || data.telegramReceipt?.error ? 'error' : 'success');
    receiptPhotoInput.value = '';
    closeReceiptCamera();
    renderReceiptPhotoPreview();
    await loadLoyaltyCustomer();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    submitInProgress = false;
    updateSubmitButtonState();
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
  const params = new URLSearchParams();
  if (selectedBranch) params.set('branchName', branches[selectedBranch] || '');
  const response = await fetch(`/api/retail-stores?${params}`);
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
  if (selectedBranch) {
    params.set('branchName', branches[selectedBranch] || '');
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
  const normalizedSearch = search.trim();
  if (normalizedSearch.length < MIN_PRODUCT_SEARCH_LENGTH) {
    products = [];
    refreshItemProductOptions();
    renderProductResults();
    return;
  }

  const requestId = ++productSearchRequestId;
  const params = new URLSearchParams();
  params.set('search', normalizedSearch);
  const selectedStore = getSelectedStore();
  if (selectedStore?.storeHref) {
    params.set('storeHref', selectedStore.storeHref);
  }
  if (selectedBranch) {
    params.set('branchName', branches[selectedBranch] || '');
  }
  const cacheKey = params.toString();
  if (productSearchCache.has(cacheKey)) {
    products = productSearchCache.get(cacheKey);
    refreshItemProductOptions();
    renderProductResults();
    updateCalculation();
    return;
  }

  productSearchController?.abort();
  productSearchController = new AbortController();
  setProductsLoading(true);

  try {
    const response = await fetch(`/api/products?${params}`, { signal: productSearchController.signal });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось загрузить товары.');
    }

    if (requestId !== productSearchRequestId) {
      return;
    }

    products = Array.isArray(data.products) ? data.products : [];
    productSearchCache.set(cacheKey, products);
    if (productSearchCache.size > PRODUCT_CACHE_LIMIT) {
      productSearchCache.delete(productSearchCache.keys().next().value);
    }
    refreshItemProductOptions();
    renderProductResults();
    updateCalculation();
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
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
  if (query.length < MIN_PRODUCT_SEARCH_LENGTH) {
    fields.productResults.append(createSearchState(`Введите минимум ${MIN_PRODUCT_SEARCH_LENGTH} символа для поиска.`));
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
    parts.push(`Цена 3-6: ${formatSom(product.price || 0)}`);
    if (Number.isFinite(Number(product.stock))) {
      const stock = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(product.stock));
      parts.push(`Остаток в ${branches[selectedBranch] || getSelectedStore()?.name || 'складе'}: ${stock} шт`);
    }
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
    priceManual: false,
    productCost: product?.cost || 0,
    productCode: product?.code || '',
    deliverySelected: true,
    isGift: false,
    quantity: 1
  });
  renderOrderItems();
  updateCalculation();
  updateCrmProgress();
  scheduleDraftSave();
  if (uiSettings.focusProductSearch) {
    fields.productSearch.value = '';
    fields.productResults.innerHTML = '';
    window.setTimeout(() => fields.productSearch.focus(), 0);
  }
}

function renderOrderItems() {
  itemsList.innerHTML = '';
  for (const [index, item] of orderItems.entries()) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.classList.toggle('delivery-active', fields.deliveryEnabled.checked);

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
    priceInput.disabled = item.isGift === true;
    priceInput.addEventListener('input', () => {
      item.productPrice = parseMoney(priceInput.value);
      item.priceManual = true;
      updateCalculation();
      scheduleDraftSave();
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
      scheduleDraftSave();
    });
    quantityLabel.append(quantityTitle, quantityInput);

    const giftLabel = document.createElement('label');
    giftLabel.className = 'item-gift';
    const giftInput = document.createElement('input');
    giftInput.type = 'checkbox';
    giftInput.checked = item.isGift === true;
    giftInput.addEventListener('change', () => {
      item.isGift = giftInput.checked;
      if (item.isGift) {
        item.regularPrice = Number(item.productPrice || item.regularPrice || 0);
        item.productPrice = 0;
      } else {
        item.productPrice = Number(item.regularPrice || 0);
      }
      renderOrderItems();
      updateCalculation();
      scheduleDraftSave();
    });
    const giftTitle = document.createElement('span');
    giftTitle.textContent = 'Подарок';
    giftLabel.append(giftInput, giftTitle);

    const deliveryLabel = document.createElement('label');
    deliveryLabel.className = `item-delivery${fields.deliveryEnabled.checked ? '' : ' hidden'}`;
    const deliveryInput = document.createElement('input');
    deliveryInput.type = 'checkbox';
    deliveryInput.checked = item.deliverySelected !== false;
    deliveryInput.addEventListener('change', () => {
      item.deliverySelected = deliveryInput.checked;
      scheduleDraftSave();
    });
    const deliveryTitle = document.createElement('span');
    deliveryTitle.textContent = 'Доставка';
    deliveryLabel.append(deliveryInput, deliveryTitle);

    const remove = document.createElement('button');
    remove.className = 'remove-item';
    remove.type = 'button';
    remove.textContent = 'x';
    remove.addEventListener('click', () => {
      orderItems.splice(index, 1);
      renderOrderItems();
      updateCalculation();
      scheduleDraftSave();
    });

    row.append(productInfo, priceLabel, quantityLabel, giftLabel, deliveryLabel, remove);
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

function renderSecondPaymentTypes() {
  const currentHref = secondPaymentTypeSelect.value;
  const primaryHref = paymentTypeSelect.value;
  const options = paymentTypes.filter((paymentType) =>
    isBankScenarioPaymentType(paymentType) && paymentType.href !== primaryHref
  );
  secondPaymentTypeSelect.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Выберите второй банк';
  secondPaymentTypeSelect.append(emptyOption);
  for (const paymentType of options) {
    const option = document.createElement('option');
    option.value = paymentType.href;
    option.textContent = paymentType.name;
    secondPaymentTypeSelect.append(option);
  }
  if (options.some((paymentType) => paymentType.href === currentHref)) {
    secondPaymentTypeSelect.value = currentHref;
  }
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
  fields.secondPaymentTypeField.classList.toggle('hidden', scenario !== 'mixed');
  fields.secondBankAmountField.classList.toggle('hidden', scenario !== 'mixed');
  fields.paymentTypeFieldLabel.textContent = scenario === 'mixed' ? 'Банк №1 (оставшаяся сумма)' : 'Тип оплаты';

  if (scenario === 'cash') {
    fields.cashPrepayment.value = '0';
    fields.prepaymentMethod.value = 'Наличными';
    selectPaymentType(findCashPaymentType());
    fields.secondBankAmount.value = '0';
    secondPaymentTypeSelect.value = '';
    return;
  }

  if (scenario === 'debt') {
    selectPaymentType(findDebtPaymentType());
    fields.secondBankAmount.value = '0';
    secondPaymentTypeSelect.value = '';
    return;
  }

  if (scenario === 'bank') {
    fields.cashPrepayment.value = '0';
    fields.secondBankAmount.value = '0';
    secondPaymentTypeSelect.value = '';
  }

  const selected = getSelectedPaymentType();
  const visiblePaymentTypes = getVisiblePaymentTypes();
  if (!selected || !visiblePaymentTypes.some((paymentType) => paymentType.href === selected.href)) {
    selectPaymentType(visiblePaymentTypes[0]);
  }
  renderSecondPaymentTypes();
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
  if (branches[branchFromUrl] && canUseBranch(branchFromUrl)) {
    selectBranch(branchFromUrl);
    return;
  }
  const availableBranches = Object.keys(branches).filter(canUseBranch);
  if (availableBranches.length === 1) {
    selectBranch(availableBranches[0]);
  }
}

function selectBranch(branchKey) {
  if (!branches[branchKey] || !canUseBranch(branchKey)) return;
  selectedBranch = branchKey;
  applyBranchStore();
  branchScreen.classList.add('hidden');
  app.classList.remove('hidden');
  crmSidebar.classList.remove('hidden');
  crmTopbar.classList.remove('hidden');
  document.body.classList.add('crm-active');
  crmBranchLabel.textContent = branches[branchKey] || 'Филиал не выбран';
  if (switchBranchName) switchBranchName.textContent = branches[branchKey];
  branchCancelButton?.classList.add('hidden');
  updateCrmProgress();
  scheduleDraftSave();
  if (productsReady) {
    productSearchController?.abort();
    products = [];
    refreshItemProductOptions();
    renderProductResults();
    if (fields.productSearch.value.trim().length >= MIN_PRODUCT_SEARCH_LENGTH) {
      loadProducts(fields.productSearch.value);
    }
  }
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
  let mode = getCustomerMode();
  const deliveryEnabled = fields.deliveryEnabled.checked;
  const retailModeInput = document.querySelector('input[name="customerMode"][value="retail"]');
  if (retailModeInput) {
    retailModeInput.disabled = deliveryEnabled;
    retailModeInput.closest('label')?.classList.toggle('disabled', deliveryEnabled);
  }
  if (deliveryEnabled && mode === 'retail') {
    const newModeInput = document.querySelector('input[name="customerMode"][value="new"]');
    if (newModeInput) {
      newModeInput.checked = true;
      mode = 'new';
    }
  }
  const existing = mode === 'existing';
  const retail = mode === 'retail';
  fields.customerSearchField.classList.toggle('hidden', !existing);
  fields.customerResults.classList.toggle('hidden', !existing);
  fields.existingCustomerField.classList.add('hidden');
  fields.customerName.readOnly = existing;
  fields.customerName.required = mode === 'new';
  fields.customerPhone.required = mode === 'new' || deliveryEnabled;
  fields.customerName.closest('label').classList.toggle('hidden', retail && !deliveryEnabled);
  fields.customerPhone.closest('label').classList.toggle('hidden', retail && !deliveryEnabled);
  renderDeliveryFields();
  renderMissingCustomerAction();
  renderDuplicateCustomerWarning();
  renderCustomerResults();
  if (existing) {
    applySelectedCustomer();
  } else if (retail && !deliveryEnabled) {
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
  updateSubmitButtonState();
}

function updateSubmitButtonState() {
  submitButton.disabled = submitInProgress;
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

function validateBeforeSubmit() {
  if (!selectedBranch) {
    throw new Error('Сначала выберите филиал.');
  }
  if (!orderItems.length) {
    throw new Error('Добавьте хотя бы один товар.');
  }
  if (!getSelectedStore()) {
    throw new Error('Выберите точку продаж.');
  }
  if (!getSelectedEmployee()) {
    throw new Error('Выберите сотрудника.');
  }
  if (!getSelectedPaymentType()) {
    throw new Error('Выберите тип оплаты.');
  }
  const receiptFile = receiptPhotoInput.files?.[0];
  if (!receiptFile && !debtSaleMode) {
    receiptPhotoInput.focus();
    throw new Error('Добавьте фотографию чека. Это обязательное поле.');
  }
  if (receiptFile && !receiptFile.type.startsWith('image/')) throw new Error('Файл чека должен быть изображением.');
  if (receiptFile && receiptFile.size > 15 * 1024 * 1024) throw new Error('Фото чека слишком большое. Максимум 15 МБ.');
  if (getPaymentScenario() === 'mixed' && parseMoney(fields.secondBankAmount.value || 0) > 0 && !getSelectedSecondPaymentType()) {
    fields.secondPaymentType.focus();
    throw new Error('Выберите второй банк для смешанной оплаты.');
  }

  const mode = getCustomerMode();
  if (fields.deliveryEnabled.checked && mode === 'retail') {
    throw new Error('Для доставки выберите нового или старого клиента.');
  }
  if (mode === 'new') {
    if (!fields.customerName.value.trim()) {
      fields.customerName.focus();
      throw new Error('Введите ФИО нового клиента.');
    }
    if (!normalizePhone(fields.customerPhone.value)) {
      fields.customerPhone.focus();
      throw new Error('Введите телефон нового клиента.');
    }
    if (duplicateCustomer) {
      throw new Error(`Такой клиент уже есть: ${duplicateCustomer.name}. Выберите режим "Старый клиент".`);
    }
  }
  if (mode === 'existing' && !getSelectedCustomer()) {
    throw new Error('Выберите старого клиента из списка или добавьте нового.');
  }
  if (fields.deliveryEnabled.checked) {
    if (!normalizePhone(fields.customerPhone.value)) {
      fields.customerPhone.focus();
      throw new Error('Для доставки укажите номер телефона клиента.');
    }
    if (!fields.deliveryDate.value || !fields.deliveryTime.value) {
      fields.deliveryDate.focus();
      throw new Error('Укажите дату и время доставки.');
    }
    if (!fields.deliveryAddress.value.trim()) {
      fields.deliveryAddress.focus();
      throw new Error('Укажите адрес доставки.');
    }
    if (!orderItems.some((item) => item.deliverySelected !== false)) {
      throw new Error('Выберите хотя бы один товар для доставки.');
    }
  }
}

async function openReceiptCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    receiptCameraStatus.textContent = 'Камера в этом браузере недоступна. Загрузите фото файлом.';
    return;
  }

  try {
    closeReceiptCamera({ keepPanel: true });
    receiptCameraStatus.textContent = 'Запрашиваю доступ к камере...';
    receiptCameraPanel.classList.remove('hidden');
    receiptCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    receiptCameraVideo.srcObject = receiptCameraStream;
    await receiptCameraVideo.play();
    receiptCameraStatus.textContent = 'Наведи камеру на чек и нажми “Сделать фото”.';
  } catch (error) {
    closeReceiptCamera();
    receiptCameraStatus.textContent = '';
    setStatus(error.name === 'NotAllowedError'
      ? 'Доступ к камере запрещен. Разрешите камеру в браузере или загрузите фото файлом.'
      : 'Не удалось открыть камеру. Загрузите фото файлом.', 'error');
  }
}

function closeReceiptCamera(options = {}) {
  if (receiptCameraStream) {
    receiptCameraStream.getTracks().forEach((track) => track.stop());
    receiptCameraStream = null;
  }
  receiptCameraVideo.srcObject = null;
  if (!options.keepPanel) {
    receiptCameraPanel.classList.add('hidden');
  }
}

async function captureReceiptPhoto() {
  if (!receiptCameraStream || !receiptCameraVideo.videoWidth) {
    receiptCameraStatus.textContent = 'Камера еще не готова.';
    return;
  }

  receiptCameraCanvas.width = receiptCameraVideo.videoWidth;
  receiptCameraCanvas.height = receiptCameraVideo.videoHeight;
  const context = receiptCameraCanvas.getContext('2d');
  context.drawImage(receiptCameraVideo, 0, 0, receiptCameraCanvas.width, receiptCameraCanvas.height);

  const blob = await new Promise((resolve) => receiptCameraCanvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) {
    receiptCameraStatus.textContent = 'Не удалось сделать фото. Попробуйте еще раз.';
    return;
  }

  const file = new File([blob], `receipt-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  receiptPhotoInput.files = transfer.files;
  renderReceiptPhotoPreview();
  closeReceiptCamera();
  setStatus('Фото чека добавлено с камеры.', 'success');
}

function renderReceiptPhotoPreview() {
  const file = receiptPhotoInput.files?.[0];
  receiptPhotoPreview.classList.toggle('hidden', !file);
  if (!file) {
    receiptPhotoImage.removeAttribute('src');
    receiptPhotoName.textContent = '';
    return;
  }
  receiptPhotoName.textContent = file.name || 'Фото чека';
  receiptPhotoImage.src = URL.createObjectURL(file);
}

async function prepareReceiptPhoto() {
  const file = receiptPhotoInput.files?.[0];
  if (!file) throw new Error('Добавьте фотографию чека.');
  const image = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
  if (!blob) throw new Error('Не удалось обработать фотографию чека.');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать фотографию чека.'));
    reader.readAsDataURL(blob);
  });
  return { name: `receipt-${Date.now()}.jpg`, mimeType: 'image/jpeg', data: String(dataUrl).split(',')[1] || '' };
}

async function updateCalculation() {
  clearStatus();
  updateCrmProgress();
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
    updateCrmProgress();
  } catch (error) {
    lastCalculation = null;
    setStatus(error.message, 'error');
    renderLoyaltyPanel();
  }
}

function bindCrmShell() {
  const openSettings = () => {
    syncSettingsControls();
    settingsModal.classList.remove('hidden');
  };
  openSettingsButton?.addEventListener('click', openSettings);
  topSettingsButton?.addEventListener('click', openSettings);
  closeSettingsButton?.addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal?.addEventListener('click', (event) => {
    if (event.target === settingsModal) settingsModal.classList.add('hidden');
  });
  sidebarToggle?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));

  document.querySelectorAll('[data-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      uiSettings.theme = button.dataset.theme;
      uiSettings.accentColor = getThemeAccent(button.dataset.theme);
      applyUiSettings();
      syncSettingsControls();
    });
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      uiSettings.mode = button.dataset.mode === 'dark' ? 'dark' : 'light';
      applyUiSettings();
      syncSettingsControls();
    });
  });
  document.querySelectorAll('[data-density]').forEach((button) => {
    button.addEventListener('click', () => {
      uiSettings.density = button.dataset.density;
      applyUiSettings();
      syncSettingsControls();
    });
  });
  document.querySelector('#saveSettingsButton')?.addEventListener('click', async () => {
    uiSettings.confirmBeforeSubmit = document.querySelector('#confirmBeforeSubmit').checked;
    uiSettings.focusProductSearch = document.querySelector('#focusProductSearch').checked;
    uiSettings.stickySummary = document.querySelector('#stickySummary').checked;
    await saveUserUiSettings();
    applyUiSettings();
    settingsModal.classList.add('hidden');
  });
  document.querySelector('#resetSettingsButton')?.addEventListener('click', async () => {
    uiSettings = { ...defaultUiSettings };
    await saveUserUiSettings();
    applyUiSettings();
    syncSettingsControls();
  });
  document.querySelector('#crmLogoutButton')?.addEventListener('click', async () => {
    await fetch('/api/crm/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  });
  clearDraftButton?.addEventListener('click', () => {
    if (!window.confirm('Удалить сохраненный черновик продажи?')) return;
    clearDraft();
    window.location.reload();
  });
  switchBranchButton?.addEventListener('click', openBranchSelection);
  branchCancelButton?.addEventListener('click', closeBranchSelection);
}

function readLocalUiSettingsRaw() {
  try {
    const raw = localStorage.getItem('mysrsUiSettings');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function openBranchSelection() {
  branchCancelButton?.classList.toggle('hidden', !selectedBranch);
  branchScreen.classList.remove('hidden');
}

function closeBranchSelection() {
  if (!selectedBranch) return;
  branchScreen.classList.add('hidden');
}

function applyRoleAccess(user) {
  const roleNames = { admin: 'Главный администратор', owner: 'Владелец', manager: 'Менеджер', seller: 'Продавец', logistics: 'Логистика', accountant: 'Бухгалтер', employee: 'Сотрудник' };
  const initials = String(user.name || user.login || 'OR').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('#sidebarUserName').textContent = user.name;
  document.querySelector('#sidebarUserRole').textContent = roleNames[user.role] || user.role;
  document.querySelector('#topUserName').textContent = user.name;
  document.querySelector('#profileInitials').textContent = initials;
  document.querySelectorAll('[data-permission]').forEach((element) => {
    element.classList.toggle('hidden', !hasCrmPermission(element.dataset.permission));
  });
  document.querySelectorAll('[data-branch]').forEach((element) => {
    element.classList.toggle('hidden', !canUseBranch(element.dataset.branch));
  });
}

function hasCrmPermission(permission) {
  return Array.isArray(currentCrmUser?.permissions) && currentCrmUser.permissions.includes(permission);
}

function canUseBranch(branchKey) {
  return Array.isArray(currentCrmUser?.branches) && currentCrmUser.branches.includes(branchKey);
}

function getDefaultCrmPage(user) {
  return navigation.find((item) => user.permissions?.includes(item.permission))?.href || '/about.html';
}

function getDraftKey() {
  const mode = debtSaleMode ? 'debt' : 'regular';
  return `mysrsSaleDraft:${mode}:${currentCrmUser?.login || 'anonymous'}`;
}

function scheduleDraftSave() {
  if (!currentCrmUser || !appInitialized || !selectedBranch) return;
  window.clearTimeout(draftSaveTimer);
  draftStatus.textContent = 'Сохраняю черновик...';
  draftSaveTimer = window.setTimeout(saveDraft, 450);
}

function saveDraft() {
  if (!currentCrmUser || !selectedBranch) return;
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.name === 'productSearch') continue;
    if (element.type === 'radio') {
      if (element.checked) values[element.name] = element.value;
    } else if (element.type === 'checkbox') {
      values[element.name] = element.checked;
    } else if (element.type !== 'submit' && element.type !== 'button') {
      values[element.name] = element.value;
    }
  }
  const draft = {
    version: 1,
    savedAt: new Date().toISOString(),
    branch: selectedBranch,
    values,
    items: orderItems
  };
  localStorage.setItem(getDraftKey(), JSON.stringify(draft));
  draftStatus.textContent = `Черновик сохранен ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
}

function restoreDraft() {
  draftRestored = true;
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(getDraftKey()) || 'null');
  } catch {
    draft = null;
  }
  if (!draft?.items && !draft?.values) {
    draftStatus.textContent = 'Черновик не сохранен';
    return;
  }

  if (!selectedBranch && branches[draft.branch]) selectBranch(draft.branch);
  orderItems = Array.isArray(draft.items) ? draft.items : [];
  for (const [name, value] of Object.entries(draft.values || {})) {
    const controls = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
    for (const control of controls) {
      if (control.type === 'radio') control.checked = control.value === value;
      else if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = value;
    }
  }
  renderDeliveryFields();
  renderOrderItems();
  applyPaymentScenario();
  if (draft.values?.secondPaymentType) {
    secondPaymentTypeSelect.value = draft.values.secondPaymentType;
  }
  renderCustomerMode();
  draftStatus.textContent = `Черновик восстановлен`;
  setStatus('Восстановлен незавершенный черновик продажи.', 'success');
}

function clearDraft() {
  if (currentCrmUser) localStorage.removeItem(getDraftKey());
  window.clearTimeout(draftSaveTimer);
  draftStatus.textContent = 'Черновик не сохранен';
}

function loadUiSettings() {
  const raw = readLocalUiSettingsRaw();
  return raw ? normalizeUiSettings(raw) : { ...defaultUiSettings };
}

function applyUiSettings() {
  uiSettings = normalizeUiSettings(uiSettings);
  const root = document.documentElement;
  document.body.dataset.theme = uiSettings.theme;
  document.body.dataset.mode = uiSettings.mode;
  root.dataset.theme = uiSettings.theme;
  root.dataset.mode = uiSettings.mode;
  applyAccentColor(uiSettings.accentColor);
  document.body.classList.toggle('density-compact', uiSettings.density === 'compact');
  document.body.classList.toggle('sticky-summary', Boolean(uiSettings.stickySummary));
  localStorage.setItem('mysrsUiSettings', JSON.stringify(uiSettings));
}

function syncSettingsControls() {
  uiSettings = normalizeUiSettings(uiSettings);
  const currentMode = document.body.dataset.mode === 'dark' || uiSettings.mode === 'dark' ? 'dark' : 'light';
  document.querySelectorAll('[data-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === uiSettings.theme);
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === currentMode);
  });
  document.querySelectorAll('[data-density]').forEach((button) => {
    button.classList.toggle('active', button.dataset.density === uiSettings.density);
  });
  document.querySelector('#confirmBeforeSubmit').checked = Boolean(uiSettings.confirmBeforeSubmit);
  document.querySelector('#focusProductSearch').checked = Boolean(uiSettings.focusProductSearch);
  document.querySelector('#stickySummary').checked = Boolean(uiSettings.stickySummary);
}

function normalizeUiSettings(input = {}) {
  const theme = ['blue', 'green', 'violet', 'red'].includes(input.theme) ? input.theme : defaultUiSettings.theme;
  const mode = input.mode === 'dark' ? 'dark' : 'light';
  const density = input.density === 'compact' ? 'compact' : 'comfortable';
  const accentColor = normalizeHexColor(input.accentColor) || getThemeAccent(theme);
  return {
    ...defaultUiSettings,
    ...input,
    theme,
    mode,
    density,
    accentColor,
    confirmBeforeSubmit: input.confirmBeforeSubmit ?? defaultUiSettings.confirmBeforeSubmit,
    focusProductSearch: input.focusProductSearch ?? defaultUiSettings.focusProductSearch,
    stickySummary: input.stickySummary ?? defaultUiSettings.stickySummary
  };
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '';
}

function getThemeAccent(theme) {
  const accents = {
    blue: '#2563eb',
    green: '#16805b',
    violet: '#6d5bd0',
    red: '#c2414b'
  };
  return accents[theme] || defaultUiSettings.accentColor;
}

function applyAccentColor(color) {
  const accent = normalizeHexColor(color) || defaultUiSettings.accentColor;
  const soft = `color-mix(in srgb, ${accent} 12%, white)`;
  const dark = `color-mix(in srgb, ${accent} 82%, black)`;
  [document.documentElement, document.body].forEach((node) => {
    node.style.setProperty('--crm-accent', accent);
    node.style.setProperty('--crm-accent-soft', soft);
    node.style.setProperty('--crm-accent-dark', dark);
  });
}

async function loadUserUiSettings() {
  const rawLocalSettings = readLocalUiSettingsRaw();
  const localSettings = rawLocalSettings ? normalizeUiSettings(rawLocalSettings) : null;
  uiSettings = localSettings ? normalizeUiSettings(localSettings) : { ...defaultUiSettings };
  if (!currentCrmUser) return;
  try {
    const response = await fetch('/api/crm/ui-settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить настройки CRM.');
    const remoteSettings = normalizeUiSettings(data?.settings || {});
    uiSettings = normalizeUiSettings(localSettings ? { ...remoteSettings, ...localSettings } : remoteSettings);
  } catch {
    uiSettings = localSettings ? normalizeUiSettings(localSettings) : { ...defaultUiSettings };
  }
}

async function saveUserUiSettings() {
  uiSettings = normalizeUiSettings(uiSettings);
  localStorage.setItem('mysrsUiSettings', JSON.stringify(uiSettings));
  if (!currentCrmUser) return;
  try {
    await fetch('/api/crm/ui-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uiSettings)
    });
  } catch {
    // keep local fallback for sales page if API is temporarily unavailable
  }
}

async function refreshMoySkladMonitor() {
  if (!moyskladMonitor) return;
  try {
    const response = await fetch('/api/crm/moysklad-monitor');
    const data = await response.json().catch(() => ({ stats: null }));
    if (!response.ok || !data?.stats) {
      throw new Error('monitor unavailable');
    }
    moyskladMonitor.classList.remove('hidden');
    moyskladMonitorRpm.textContent = `${data.stats.requestsLastMinute} / ${data.stats.limitPerMinute} в мин`;
    moyskladMonitorQueue.textContent = `Очередь: ${data.stats.waiting}${data.stats.nextDelayMs ? ` · ${Math.ceil(data.stats.nextDelayMs / 100) / 10}с` : ''}`;
    moyskladMonitorActive.textContent = `Активно: ${data.stats.active}`;
    moyskladMonitor.classList.toggle('warning', data.stats.requestsLastMinute >= 100 || data.stats.waiting > 0);
  } catch {
    moyskladMonitor.classList.add('hidden');
  }
}

function startMoySkladMonitor() {
  if (!currentCrmUser || currentCrmUser.role !== 'admin') {
    moyskladMonitor?.classList.add('hidden');
    return;
  }
  window.clearInterval(moyskladMonitorTimer);
  refreshMoySkladMonitor();
  moyskladMonitorTimer = window.setInterval(refreshMoySkladMonitor, 5000);
}

function updateCrmProgress() {
  if (!processSteps.length) return;
  const hasItems = orderItems.length > 0;
  const hasPayment = hasItems && Boolean(paymentTypeSelect.value || getPaymentScenario() === 'cash');
  const customerMode = getCustomerMode();
  const hasCustomer = customerMode === 'retail' || Boolean(fields.customerName.value.trim());
  const completed = [hasItems, hasPayment, hasCustomer, false];
  const activeIndex = !hasItems ? 0 : !hasPayment ? 1 : !hasCustomer ? 2 : 3;
  processSteps.forEach((step, index) => {
    step.classList.toggle('active', index === activeIndex);
    step.classList.toggle('complete', completed[index]);
  });
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
  renderBankSplit(null);
}

function renderCalculation(data) {
  const summaryData = {
    baseTotal: data.baseTotal,
    productLabel: data.items?.length > 1 ? `${data.items.length} товара` : data.items?.[0]?.productName || 'Выберите товар',
    paymentType: data.paymentLabel || data.paymentType,
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
  renderBankSplit(data);
}

function renderBankSplit(data) {
  const visible = getPaymentScenario() === 'mixed';
  fields.mixedBankSplit.classList.toggle('hidden', !visible);
  if (!visible) return;
  fields.primaryBankPreviewLabel.textContent = data?.paymentType || getSelectedPaymentType()?.name || 'Банк №1';
  fields.primaryBankAmountPreview.textContent = formatSom(data?.primaryBankAmount || 0);
  fields.secondBankPreviewLabel.textContent = data?.secondPaymentType || getSelectedSecondPaymentType()?.name || 'Банк №2';
  fields.secondBankAmountPreview.textContent = formatSom(data?.secondBankAmount || 0);
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
  const secondPaymentType = getSelectedSecondPaymentType();
  const selectedEmployee = getSelectedEmployee();
  const deliveryEnabled = fields.deliveryEnabled.checked;
  const deliveryDateTime = deliveryEnabled && fields.deliveryDate.value && fields.deliveryTime.value
    ? new Date(`${fields.deliveryDate.value}T${fields.deliveryTime.value}:00`).toISOString()
    : '';
  return {
    items: orderItems,
    cashPrepayment: fields.cashPrepayment.value,
    prepaymentMethodName: fields.prepaymentMethod.value,
    transferPrepayment: fields.transferPrepayment.value,
    paymentScenario: getPaymentScenario(),
    loyaltyRedemption: fields.loyaltyRedemption?.value || '0',
    paymentTypeName: selectedPaymentType?.name || '',
    paymentTypeHref: selectedPaymentType?.href || '',
    paymentTypeRate: selectedPaymentType?.rate ?? 0,
    paymentTypeComment: selectedPaymentType?.comment || '',
    secondPaymentTypeName: secondPaymentType?.name || '',
    secondPaymentTypeHref: secondPaymentType?.href || '',
    secondPaymentTypeRate: secondPaymentType?.rate ?? 0,
    secondPaymentTypeComment: secondPaymentType?.comment || '',
    secondBankAmount: fields.secondBankAmount.value,
    employeeName: selectedEmployee?.name || '',
    employeeHref: selectedEmployee?.href || '',
    retailStoreName: getSelectedStore()?.name || '',
    branchName: branches[selectedBranch] || getSelectedStore()?.name || '',
    retailStoreHref: getSelectedStore()?.href || '',
    storeHref: getSelectedStore()?.storeHref || '',
    customerMode: getCustomerMode(),
    customerHref: getSelectedCustomer()?.href || '',
    customerName: fields.customerName.value.trim(),
    customerPhone: fields.customerPhone.value.trim(),
    customerAddress: (fields.customerAddress.value || fields.deliveryAddress.value).trim(),
    delivery: {
      enabled: deliveryEnabled,
      scheduledAt: deliveryDateTime,
      address: fields.deliveryAddress.value.trim(),
      notes: fields.deliveryNotes.value.trim(),
      items: deliveryEnabled
        ? orderItems.filter((item) => item.deliverySelected !== false).map((item) => ({ name: item.productName, code: item.productCode || '', quantity: item.quantity }))
        : []
    }
  };
}

function renderDeliveryFields() {
  const enabled = fields.deliveryEnabled.checked;
  fields.deliveryEnabled.setAttribute('aria-expanded', String(enabled));
  fields.deliveryFields.classList.toggle('hidden', !enabled);
  fields.deliveryFields.toggleAttribute('hidden', !enabled);
  fields.customerAddressField?.classList.toggle('hidden', !enabled);

  for (const field of [fields.deliveryDate, fields.deliveryTime, fields.deliveryAddress, fields.deliveryNotes]) {
    field.disabled = !enabled;
  }

  fields.deliveryDate.required = enabled;
  fields.deliveryTime.required = enabled;
  fields.deliveryAddress.required = enabled;

  if (!enabled) {
    fields.deliveryAddress.dataset.edited = '';
  }
}

function setDefaultDeliverySchedule() {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (!fields.deliveryDate.value) fields.deliveryDate.value = next.toISOString().slice(0, 10);
  if (!fields.deliveryTime.value) fields.deliveryTime.value = '12:00';
  fields.deliveryDate.min = new Date().toISOString().slice(0, 10);
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

function getSelectedSecondPaymentType() {
  return paymentTypes.find((paymentType) => paymentType.href === secondPaymentTypeSelect.value);
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
  return name.includes('налич') || name.includes('cash') || name.includes('карта');
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
  return !isCashPaymentType(paymentType) && !isDebtPaymentType(paymentType) && !isQrPaymentType(paymentType);
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
  printPkoButton?.classList.toggle('hidden', !isPkoAvailable(data));
  successModal.classList.remove('hidden');
  renderPrintReceipt(data);
  renderFiscalStatus(data);
}

async function renderFiscalStatus(data) {
  if (!fiscalStatusCard) return;
  const isRetailSale = data?.document?.type === 'retaildemand' && data?.document?.id;
  if (!isRetailSale) {
    fiscalStatusCard.classList.add('hidden');
    fiscalStatusCard.classList.remove('ready', 'warning');
    if (fiscalStatusBadge) fiscalStatusBadge.textContent = 'NewCas';
    fiscalStatusChecklist.innerHTML = '';
    retryFiscalizationButton?.classList.add('hidden');
    retryFiscalizationButton && (retryFiscalizationButton.disabled = false);
    return;
  }

  fiscalStatusCard.classList.remove('hidden');
  fiscalStatusCard.classList.remove('ready', 'warning');
  if (fiscalStatusBadge) fiscalStatusBadge.textContent = 'Проверка';
  fiscalStatusTitle.textContent = 'NewCas';
  fiscalStatusText.textContent = 'Проверяю готовность к автофискализации...';
  fiscalStatusChecklist.innerHTML = '';
  retryFiscalizationButton?.classList.remove('hidden');
  retryFiscalizationButton && (retryFiscalizationButton.onclick = () => retryFiscalization(data.document.id));

  try {
    const params = new URLSearchParams({ documentId: data.document.id });
    if (selectedBranch) params.set('branchName', branches[selectedBranch] || '');
    const response = await fetch(`/api/retail-fiscal-status?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось проверить фискальный статус.');

    const checks = payload.checks || {};
    const labels = [
      ['retailDemand', 'Документ создан как розничная продажа'],
      ['retailStore', 'Указана точка продаж'],
      ['retailShift', 'Есть открытая смена'],
      ['store', 'Привязан склад'],
      ['amount', 'Сумма документа больше нуля'],
      ['paymentSplit', 'Есть суммы оплаты cash / noCash']
    ];

    fiscalStatusCard.classList.add(payload.ready ? 'ready' : 'warning');
    if (fiscalStatusBadge) fiscalStatusBadge.textContent = payload.ready ? 'Авто' : 'Внимание';
    fiscalStatusTitle.textContent = payload.ready
      ? 'NewCas: готов к автофискализации'
      : 'NewCas: не хватает кассовых полей';
    fiscalStatusText.textContent = payload.note || 'Проверка выполнена.';
    fiscalStatusChecklist.innerHTML = labels.map(([key, label]) => `
      <li class="${checks[key] ? 'ok' : 'fail'}">${escapeHtml(label)}</li>
    `).join('');
  } catch (error) {
    fiscalStatusCard.classList.add('warning');
    if (fiscalStatusBadge) fiscalStatusBadge.textContent = 'Ошибка';
    fiscalStatusTitle.textContent = 'NewCas: статус не определен';
    fiscalStatusText.textContent = error.message || 'Не удалось проверить фискальный статус.';
    fiscalStatusChecklist.innerHTML = '<li class="fail">Проверка не выполнена</li>';
  }
}

async function retryFiscalization(documentId) {
  if (!documentId || !retryFiscalizationButton) return;
  retryFiscalizationButton.disabled = true;
  retryFiscalizationButton.textContent = 'Отправляю...';
  try {
    const response = await fetch('/api/retail-fiscalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, branchName: selectedBranch ? (branches[selectedBranch] || '') : '' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось отправить на фискализацию.');

    if (payload.success) {
      if (fiscalStatusCard) {
        fiscalStatusCard.classList.remove('warning');
        fiscalStatusCard.classList.add('ready');
      }
      if (fiscalStatusBadge) fiscalStatusBadge.textContent = 'Авто';
      if (fiscalStatusTitle) fiscalStatusTitle.textContent = 'NewCas: отправка выполнена';
      if (fiscalStatusText) fiscalStatusText.textContent = 'Документ отправлен в очередь фискализации через web-RPC.';
      if (fiscalStatusChecklist) fiscalStatusChecklist.innerHTML = '<li class="ok">Запрос на фискализацию успешно отправлен</li>';
      setStatus('Документ отправлен на фискализацию.', 'success');
      return;
    }

    throw new Error(payload.error || payload.reason || 'Фискализация не выполнена.');
  } catch (error) {
    if (fiscalStatusCard) {
      fiscalStatusCard.classList.remove('ready');
      fiscalStatusCard.classList.add('warning');
    }
    if (fiscalStatusBadge) fiscalStatusBadge.textContent = 'Ошибка';
    if (fiscalStatusTitle) fiscalStatusTitle.textContent = 'NewCas: отправка не выполнена';
    if (fiscalStatusText) fiscalStatusText.textContent = error.message || 'Не удалось отправить документ на фискализацию.';
    if (fiscalStatusChecklist) fiscalStatusChecklist.innerHTML = '<li class="fail">Проверьте cookie web-сессии и параметры RPC</li>';
    setStatus(error.message || 'Не удалось отправить документ на фискализацию.', 'error');
  } finally {
    retryFiscalizationButton.disabled = false;
    retryFiscalizationButton.textContent = 'Фискализация';
  }
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
  const paymentType = calculation.paymentLabel || calculation.paymentType || payload.paymentTypeName || '';
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
              <span>${item.isGift ? 'ПОДАРОК' : `${formatReceiptMoney(item.productPrice || 0)} x ${escapeHtml(String(item.quantity || 1))}`}</span>
              <b>${item.isGift ? '0,00' : formatReceiptMoney(item.lineTotal || 0)}</b>
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

function isPkoAvailable(data) {
  const payload = data?.requestPayload || {};
  const calculation = data?.calculation || {};
  const scenario = String(payload.paymentScenario || '').toLowerCase();
  const paymentName = String(calculation.paymentLabel || calculation.paymentType || payload.paymentTypeName || '').toLowerCase();
  const amount = getPkoAmount(data);
  return amount > 0 && (scenario === 'cash' || paymentName.includes('налич') || paymentName.includes('cash'));
}

function getPkoAmount(data) {
  const calculation = data?.calculation || {};
  const payload = data?.requestPayload || {};
  if (String(payload.paymentScenario || '').toLowerCase() === 'mixed') {
    return roundMoney(Number(calculation.cashPrepayment || payload.cashPrepayment || 0));
  }
  return roundMoney(Number(calculation.finalTotal || calculation.baseTotal || 0));
}

function printPko(data) {
  const html = buildPkoHtml(data);
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) {
    setStatus('Браузер заблокировал окно печати ПКО. Разрешите всплывающие окна.', 'error');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 250);
}

function buildPkoHtml(data) {
  const calculation = data?.calculation || {};
  const document = data?.document || {};
  const payload = data?.requestPayload || {};
  const amount = getPkoAmount(data);
  const date = new Date(document.moment || Date.now());
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).formatToParts(date);
  const day = dateParts.find((part) => part.type === 'day')?.value || '';
  const month = dateParts.find((part) => part.type === 'month')?.value || '';
  const year = dateParts.find((part) => part.type === 'year')?.value || '';
  const buyer = getPrintBuyer(payload);
  const cashier = payload.employeeName || '';
  const organization = 'ИП Матаев Женишбек Камилович';
  const branchName = payload.branchName || payload.retailStoreName || '';
  const orderNumber = document.name || '';
  const amountNumeric = formatReceiptMoney(amount);
  const amountWords = numberToRussianSom(amount);
  const basis = `Оплата за товар${orderNumber ? ` по документу № ${orderNumber}` : ''}`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>ПКО ${escapeHtml(orderNumber || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #111827; font-family: Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm; }
    .pko { border: 1px solid #111827; padding: 8mm; min-height: 132mm; }
    .pko-top { display: flex; justify-content: space-between; gap: 20px; font-size: 11px; }
    .pko-form-code { text-align: right; line-height: 1.35; color: #334155; }
    .org { margin-top: 18px; text-align: center; font-size: 14px; font-weight: 700; border-bottom: 1px solid #111827; padding-bottom: 5px; }
    .caption { text-align: center; font-size: 10px; color: #64748b; margin-top: 2px; }
    h1 { margin: 24px 0 12px; text-align: center; font-size: 18px; letter-spacing: .02em; }
    table { width: 100%; border-collapse: collapse; }
    .meta th, .meta td { border: 1px solid #111827; padding: 6px 8px; font-size: 12px; text-align: center; }
    .meta th { font-weight: 700; background: #f8fafc; }
    .line { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 8px; align-items: end; margin-top: 13px; font-size: 13px; }
    .value { min-height: 22px; border-bottom: 1px solid #111827; padding: 0 4px 3px; font-weight: 700; }
    .amount-row { display: grid; grid-template-columns: 140px 1fr 120px; gap: 8px; align-items: end; margin-top: 13px; font-size: 13px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; font-size: 12px; }
    .signature-line { border-bottom: 1px solid #111827; height: 28px; margin-top: 10px; }
    .receipt { margin-top: 10mm; border: 1px dashed #111827; padding: 8mm; }
    .receipt h2 { text-align: center; margin: 0 0 16px; font-size: 16px; }
    .receipt .line { grid-template-columns: 110px minmax(0, 1fr); }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 8mm; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="pko">
      <div class="pko-top">
        <div></div>
        <div class="pko-form-code">
          Унифицированная форма № КО-1<br>
          Утверждена постановлением Госкомстата России от 18.08.98 №88
        </div>
      </div>
      <div class="org">${escapeHtml(organization)}</div>
      <div class="caption">организация${branchName ? `, ${escapeHtml(branchName)}` : ''}</div>

      <h1>ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР</h1>
      <table class="meta">
        <thead>
          <tr>
            <th>Номер документа</th>
            <th>Дата составления</th>
            <th>Сумма, сом</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(orderNumber || '-')}</td>
            <td>${escapeHtml(formatDateOnly(date))}</td>
            <td>${escapeHtml(amountNumeric)}</td>
          </tr>
        </tbody>
      </table>

      <div class="line"><span>Принято от</span><div class="value">${escapeHtml(buyer)}</div></div>
      <div class="line"><span>Основание</span><div class="value">${escapeHtml(basis)}</div></div>
      <div class="amount-row"><span>Сумма</span><div class="value">${escapeHtml(amountWords)}</div><div class="value">${escapeHtml(amountNumeric)}</div></div>
      <div class="line"><span>В том числе</span><div class="value">Без НДС</div></div>
      <div class="signatures">
        <div>
          Главный бухгалтер
          <div class="signature-line"></div>
          <div class="caption">подпись / расшифровка</div>
        </div>
        <div>
          Кассир${cashier ? `: ${escapeHtml(cashier)}` : ''}
          <div class="signature-line"></div>
          <div class="caption">подпись / расшифровка</div>
        </div>
      </div>
    </section>

    <section class="receipt">
      <h2>КВИТАНЦИЯ</h2>
      <div class="org">${escapeHtml(organization)}</div>
      <div class="line"><span>К ПКО №</span><div class="value">${escapeHtml(orderNumber || '-')}</div></div>
      <div class="line"><span>от</span><div class="value">"${escapeHtml(day)}" ${escapeHtml(month)} ${escapeHtml(year)} г.</div></div>
      <div class="line"><span>Принято от</span><div class="value">${escapeHtml(buyer)}</div></div>
      <div class="line"><span>Основание</span><div class="value">${escapeHtml(basis)}</div></div>
      <div class="line"><span>Сумма</span><div class="value">${escapeHtml(amountWords)}</div></div>
      <div class="line"><span>Кассир</span><div class="value">${escapeHtml(cashier || '')}</div></div>
    </section>
  </main>
</body>
</html>`;
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

function formatDateOnly(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function formatReceiptMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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
