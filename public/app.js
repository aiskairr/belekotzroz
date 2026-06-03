const form = document.querySelector('#orderForm');
const paymentTypeSelect = document.querySelector('#paymentType');
const employeeSelect = document.querySelector('#employee');
const productSelect = document.querySelector('#product');
const submitButton = document.querySelector('#submitButton');
const statusEl = document.querySelector('#status');

const fields = {
  productSearch: document.querySelector('#productSearch'),
  productPrice: document.querySelector('#productPrice'),
  quantity: document.querySelector('#quantity'),
  customerName: document.querySelector('#customerName'),
  customerPhone: document.querySelector('#customerPhone'),
  customerAddress: document.querySelector('#customerAddress')
};

const summary = {
  baseTotal: document.querySelector('#baseTotal'),
  productLabel: document.querySelector('#productLabel'),
  paymentTypeLabel: document.querySelector('#paymentTypeLabel'),
  commission: document.querySelector('#commission'),
  finalTotal: document.querySelector('#finalTotal'),
  monthlyPayment: document.querySelector('#monthlyPayment')
};

let config = {};
let products = [];
let paymentTypes = [];
let employees = [];
let searchTimer;

init();

async function init() {
  try {
    const response = await fetch('/api/config');
    config = await response.json();
    await loadPaymentTypes();
    await loadEmployees();
    await loadProducts();
    await updateCalculation();
  } catch (error) {
    setStatus('Не удалось загрузить настройки расчета.', 'error');
  }
}

form.addEventListener('input', () => {
  updateCalculation();
});

paymentTypeSelect.addEventListener('change', () => {
  updateCalculation();
});

employeeSelect.addEventListener('change', () => {
  updateCalculation();
});

productSelect.addEventListener('change', () => {
  applySelectedProductPrice();
  updateCalculation();
});

fields.productSearch.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadProducts(fields.productSearch.value);
  }, 350);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus('Создаю отгрузку в МойСклад...', '');

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPayload())
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка создания отгрузки.');
    }

    const documentName = data.document?.name ? ` №${data.document.name}` : '';
    setStatus(`Готово. Отгрузка${documentName} создана в МойСклад.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
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

async function loadProducts(search = '') {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await fetch(`/api/products?${params}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить товары.');
  }

  products = data.products;
  renderProducts();
  applySelectedProductPrice();
  updateCalculation();
}

function renderProducts() {
  productSelect.innerHTML = '';

  if (!products.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Товар не найден';
    productSelect.append(option);
    productSelect.disabled = true;
    return;
  }

  productSelect.disabled = false;
  for (const product of products) {
    const option = document.createElement('option');
    option.value = product.href;
    option.dataset.type = product.type;
    option.dataset.name = product.name;
    option.dataset.price = String(product.price || 0);
    option.textContent = product.code ? `${product.name} (${product.code})` : product.name;
    productSelect.append(option);
  }
}

function applySelectedProductPrice() {
  const selectedProduct = getSelectedProduct();
  if (!selectedProduct || !selectedProduct.price) {
    return;
  }
  fields.productPrice.value = String(selectedProduct.price);
}

function renderPaymentTypes() {
  paymentTypeSelect.innerHTML = '';
  for (const paymentType of paymentTypes) {
    const option = document.createElement('option');
    option.value = paymentType.href;
    option.dataset.name = paymentType.name;
    option.textContent = paymentType.name;
    paymentTypeSelect.append(option);
  }
  const defaultType = paymentTypes.find((paymentType) => paymentType.name === 'M+ (6 мес)');
  if (defaultType) {
    paymentTypeSelect.value = defaultType.href;
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

async function updateCalculation() {
  clearStatus();
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

function renderCalculation(data) {
  summary.baseTotal.textContent = formatSom(data.baseTotal);
  summary.productLabel.textContent = getSelectedProduct()?.name || 'Выберите товар';
  summary.paymentTypeLabel.textContent = data.paymentType;
  summary.commission.textContent = formatSom(data.commission);
  summary.finalTotal.textContent = formatSom(data.finalTotal);
  summary.monthlyPayment.textContent = formatSom(data.monthlyPayment);
}

function getPayload() {
  const selectedProduct = getSelectedProduct();
  const selectedPaymentType = getSelectedPaymentType();
  const selectedEmployee = getSelectedEmployee();
  return {
    productPrice: fields.productPrice.value,
    quantity: fields.quantity.value,
    paymentTypeName: selectedPaymentType?.name || '',
    paymentTypeHref: selectedPaymentType?.href || '',
    employeeName: selectedEmployee?.name || '',
    employeeHref: selectedEmployee?.href || '',
    productName: selectedProduct?.name || '',
    assortmentHref: selectedProduct?.href || '',
    assortmentType: selectedProduct?.type || 'product',
    customerName: fields.customerName.value.trim(),
    customerPhone: fields.customerPhone.value.trim(),
    customerAddress: fields.customerAddress.value.trim()
  };
}

function getSelectedProduct() {
  return products.find((product) => product.href === productSelect.value);
}

function getSelectedPaymentType() {
  return paymentTypes.find((paymentType) => paymentType.href === paymentTypeSelect.value);
}

function getSelectedEmployee() {
  return employees.find((employee) => employee.href === employeeSelect.value);
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
