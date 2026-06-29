import { initCrmShell } from './crm-shell.js';

const els = {
  panel: document.querySelector('#commercialPanel'),
  form: document.querySelector('#commercialForm'),
  status: document.querySelector('#commercialStatus'),
  description: document.querySelector('#description'),
  customerName: document.querySelector('#customerName'),
  customerInn: document.querySelector('#customerInn'),
  customerBank: document.querySelector('#customerBank'),
  customerBik: document.querySelector('#customerBik'),
  customerSettlementAccount: document.querySelector('#customerSettlementAccount'),
  customerCorrAccount: document.querySelector('#customerCorrAccount'),
  customerOkpo: document.querySelector('#customerOkpo'),
  customerPhone: document.querySelector('#customerPhone'),
  customerEmail: document.querySelector('#customerEmail'),
  customerAddress: document.querySelector('#customerAddress'),
  customerSearchWrap: document.querySelector('#customerSearchWrap'),
  customerSearch: document.querySelector('#customerSearch'),
  customerSearchMeta: document.querySelector('#customerSearchMeta'),
  customerResults: document.querySelector('#customerResults'),
  itemsList: document.querySelector('#itemsList'),
  productSearch: document.querySelector('#productSearch'),
  productSearchMeta: document.querySelector('#productSearchMeta'),
  productResults: document.querySelector('#productResults'),
  addItemButton: document.querySelector('#addItemButton'),
  store: document.querySelector('#store'),
  successModal: document.querySelector('#commercialSuccessModal'),
  successText: document.querySelector('#commercialSuccessText'),
  printButton: document.querySelector('#commercialPrintButton'),
  openDocumentButton: document.querySelector('#commercialOpenDocumentButton'),
  closeModalButton: document.querySelector('#commercialCloseModalButton')
};

let user = null;
let selectedCustomer = null;
let items = [createItem()];
let activeItemIndex = 0;
let customerTimer = null;
let productTimer = null;
let customerSearchController = null;
let productSearchController = null;
const wholesaleGroupValue = 'оптовые клиенты';
const commercialDocumentType = 'demand';
let latestPdfBlob = null;
let latestPdfFileName = 'schet-na-oplatu.pdf';
let latestDocumentUrl = '';

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

init();

async function init() {
  user = await initCrmShell({ page: 'commercialDocuments', allowedRoles: ['admin', 'owner', 'manager', 'seller'] });
  if (!user) return;
  els.panel.classList.remove('hidden');
  bindAutoKyrgyzPhonePrefix(els.customerPhone);
  bindEvents();
  await loadStores();
  renderItems();
}

function bindEvents() {
  document.querySelectorAll('input[name="customerMode"]').forEach((input) => {
    input.addEventListener('change', () => {
      const isExisting = input.value === 'existing' && input.checked;
      els.customerSearchWrap.classList.toggle('hidden', !isExisting);
      if (!isExisting) selectedCustomer = null;
    });
  });
  document.querySelectorAll('input[name="customerGroups"]').forEach((input) => {
    input.addEventListener('change', syncItemPricesByCustomerGroup);
  });
  els.addItemButton.addEventListener('click', () => {
    items.push(createItem());
    activeItemIndex = items.length - 1;
    els.productSearch.value = '';
    els.productResults.innerHTML = '';
    els.productSearchMeta.textContent = `Новая строка ${activeItemIndex + 1} готова. Начни вводить товар`;
    renderItems();
  });
  els.customerSearch.addEventListener('input', () => {
    clearTimeout(customerTimer);
    customerTimer = setTimeout(searchCustomers, 250);
  });
  els.productSearch.addEventListener('input', () => {
    clearTimeout(productTimer);
    productTimer = setTimeout(searchProducts, 250);
  });
  els.printButton.addEventListener('click', () => {
    if (!latestPdfBlob) return;
    printPdfBlob(latestPdfBlob, latestPdfFileName);
  });
  els.openDocumentButton.addEventListener('click', () => {
    if (!latestDocumentUrl) return;
    window.open(latestDocumentUrl, '_blank', 'noopener');
  });
  els.closeModalButton.addEventListener('click', closeSuccessModal);
  els.successModal.addEventListener('click', (event) => {
    if (event.target === els.successModal) closeSuccessModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.successModal.classList.contains('hidden')) {
      closeSuccessModal();
    }
  });
  els.form.addEventListener('submit', submitForm);
}

async function loadStores() {
  const response = await fetch('/api/retail-stores');
  const data = await response.json().catch(() => ({ retailStores: [] }));
  const stores = Array.isArray(data.retailStores) ? data.retailStores : [];
  els.store.innerHTML = '<option value="">Без точки продаж</option>' + stores.map((store) =>
    `<option value="${escapeHtml(store.storeHref || '')}">${escapeHtml(store.name)}</option>`
  ).join('');
}

function renderItems() {
  els.itemsList.innerHTML = items.map((item, index) => `
    <div class="item-row ${index === activeItemIndex ? 'active' : ''}" data-index="${index}">
      <input type="hidden" data-field="assortmentHref" value="${escapeHtml(item.assortmentHref)}">
      <input type="hidden" data-field="assortmentType" value="${escapeHtml(item.assortmentType)}">
      <label><span>Товар</span><input data-field="name" value="${escapeHtml(item.name)}" placeholder="Название"></label>
      <label><span>Кол-во</span><input data-field="quantity" inputmode="decimal" value="${escapeHtml(item.quantity)}"></label>
      <label><span>Цена</span><input data-field="price" inputmode="decimal" value="${escapeHtml(item.price)}"></label>
      <label><span>Артикул</span><input data-field="code" value="${escapeHtml(item.code)}"></label>
      <button type="button" data-remove="${index}" class="secondary-button">Удалить</button>
    </div>
  `).join('');
  els.itemsList.querySelectorAll('input').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('focus', () => {
      const row = input.closest('.item-row');
      const index = Number(row.dataset.index);
      if (activeItemIndex !== index) {
        activeItemIndex = index;
        els.productSearchMeta.textContent = `Активная строка: ${activeItemIndex + 1}. Для поиска введи минимум 2 символа`;
        renderItems();
      }
    });
    input.addEventListener('input', () => {
      const row = input.closest('.item-row');
      const index = Number(row.dataset.index);
      const field = input.dataset.field;
      items[index][field] = input.value;
      if (field === 'name') {
        items[index].assortmentHref = '';
        items[index].assortmentType = 'product';
        row.classList.add('unresolved');
        activeItemIndex = index;
        els.productSearchMeta.textContent = `Редактируешь строку ${activeItemIndex + 1}. Для поиска введи минимум 2 символа`;
      }
    });
  });
  els.itemsList.querySelectorAll('.item-row').forEach((row) => {
    row.addEventListener('click', () => {
      const index = Number(row.dataset.index);
      if (activeItemIndex !== index) {
        activeItemIndex = index;
        els.productSearchMeta.textContent = `Активная строка: ${activeItemIndex + 1}. Для поиска введи минимум 2 символа`;
        renderItems();
      }
    });
  });
  els.itemsList.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      items.splice(Number(button.dataset.remove), 1);
      if (!items.length) items.push(createItem());
      activeItemIndex = Math.min(activeItemIndex, items.length - 1);
      renderItems();
    });
  });
}

async function searchCustomers() {
  const q = els.customerSearch.value.trim();
  if (q.length < 2) {
    els.customerResults.innerHTML = '';
    els.customerSearchMeta.textContent = 'Введите минимум 2 символа';
    return;
  }
  customerSearchController?.abort();
  customerSearchController = new AbortController();
  els.customerSearchMeta.innerHTML = '<span class="search-spinner"></span> Ищу контрагента...';
  els.customerResults.innerHTML = renderSearchSkeleton(3);
  try {
    const response = await fetch(`/api/customers?search=${encodeURIComponent(q)}`, { signal: customerSearchController.signal });
    const data = await response.json().catch(() => ({ customers: [] }));
    const customers = Array.isArray(data.customers) ? data.customers : [];
    els.customerSearchMeta.textContent = customers.length
      ? `Найдено: ${customers.length}`
      : 'Ничего не найдено';
    els.customerResults.innerHTML = customers.map((customer) => `
      <button type="button" class="search-result" data-customer="${escapeHtml(customer.id)}">
        <strong>${escapeHtml(customer.name)}</strong>
        <div>${escapeHtml(customer.phone || 'Телефон не указан')}</div>
        <small>${escapeHtml(customer.inn || 'ИНН не указан')}</small>
      </button>
    `).join('') || '<div class="search-empty">Ничего не найдено</div>';
    els.customerResults.querySelectorAll('[data-customer]').forEach((button) => {
      const customer = customers.find((item) => item.id === button.dataset.customer);
      button.addEventListener('click', () => {
        selectedCustomer = customer;
        els.customerName.value = customer.name || '';
        els.customerInn.value = customer.inn || '';
        els.customerBank.value = customer.bank || '';
        els.customerBik.value = customer.bik || '';
        els.customerSettlementAccount.value = customer.settlementAccount || '';
        els.customerCorrAccount.value = customer.corrAccount || '';
        els.customerOkpo.value = customer.okpo || '';
        els.customerPhone.value = customer.phone || '';
        els.customerEmail.value = customer.email || '';
        els.customerAddress.value = customer.actualAddress || '';
        document.querySelectorAll('input[name="customerGroups"]').forEach((input) => {
          input.checked = Array.isArray(customer.groups) && customer.groups.includes(input.value);
        });
        syncItemPricesByCustomerGroup();
        els.customerSearch.value = customer.name || '';
        els.customerSearchMeta.textContent = 'Контрагент выбран';
        els.customerResults.innerHTML = '';
      });
    });
  } catch (error) {
    if (error.name === 'AbortError') return;
    els.customerSearchMeta.textContent = 'Не удалось загрузить контрагентов';
    els.customerResults.innerHTML = '<div class="search-empty error">Ошибка поиска</div>';
  }
}

async function searchProducts() {
  const q = els.productSearch.value.trim();
  if (q.length < 2) {
    els.productResults.innerHTML = '';
    els.productSearchMeta.textContent = 'Выбери строку товара и начни вводить минимум 2 символа';
    return;
  }
  productSearchController?.abort();
  productSearchController = new AbortController();
  els.productSearchMeta.innerHTML = `<span class="search-spinner"></span> Ищу товар для строки ${activeItemIndex + 1}...`;
  els.productResults.innerHTML = renderSearchSkeleton(4);
  try {
    const response = await fetch(`/api/products?search=${encodeURIComponent(q)}&storeHref=${encodeURIComponent(els.store.value || '')}`, { signal: productSearchController.signal });
    const data = await response.json().catch(() => ({ products: [] }));
    const products = Array.isArray(data.products) ? data.products : [];
    els.productSearchMeta.textContent = products.length
      ? `Найдено товаров: ${products.length}. Активная строка: ${activeItemIndex + 1}`
      : 'Ничего не найдено';
    els.productResults.innerHTML = products.map((product) => `
      <button type="button" class="search-result product-result" data-product="${escapeHtml(product.id)}">
        <strong>${escapeHtml(product.name)}</strong>
        <div>${escapeHtml(product.code || 'Без кода')}</div>
        <small>Мин: ${escapeHtml(formatPriceMeta(product.minPrice))} · Опт: ${escapeHtml(formatPriceMeta(product.wholesalePrice))}</small>
      </button>
    `).join('') || '<div class="search-empty">Ничего не найдено</div>';
    els.productResults.querySelectorAll('[data-product]').forEach((button) => {
      const product = products.find((item) => item.id === button.dataset.product);
      button.addEventListener('click', () => {
        const minPrice = Number(product.minPrice?.value || 0);
        const wholesalePrice = Number(product.wholesalePrice?.value || 0);
        items[activeItemIndex] = createItem({
          name: product.name,
          code: product.code || '',
          price: String(resolveProductPrice({ minPrice, wholesalePrice })),
          priceMin: String(minPrice),
          priceWholesale: String(wholesalePrice),
          assortmentHref: product.href,
          assortmentType: product.assortmentType || 'product'
        });
        renderItems();
        els.productResults.innerHTML = '';
        els.productSearch.value = '';
        els.productSearchMeta.textContent = `Товар добавлен в строку ${activeItemIndex + 1}`;
      });
    });
  } catch (error) {
    if (error.name === 'AbortError') return;
    els.productSearchMeta.textContent = 'Не удалось загрузить товары';
    els.productResults.innerHTML = '<div class="search-empty error">Ошибка поиска</div>';
  }
}

async function submitForm(event) {
  event.preventDefault();
  setStatus('Создаю отгрузку и готовлю PDF...');
  try {
    const customerMode = document.querySelector('input[name="customerMode"]:checked').value;
    const body = {
      documentType: commercialDocumentType,
      description: els.description.value.trim(),
      customerMode,
      customerName: els.customerName.value.trim(),
      customerInn: els.customerInn.value.trim(),
      customerBank: els.customerBank.value.trim(),
      customerBik: els.customerBik.value.trim(),
      customerSettlementAccount: els.customerSettlementAccount.value.trim(),
      customerCorrAccount: els.customerCorrAccount.value.trim(),
      customerOkpo: els.customerOkpo.value.trim(),
      customerPhone: els.customerPhone.value.trim(),
      customerEmail: els.customerEmail.value.trim(),
      customerAddress: els.customerAddress.value.trim(),
      customerHref: selectedCustomer?.href || '',
      customerGroups: [...document.querySelectorAll('input[name="customerGroups"]:checked')].map((input) => input.value),
      storeHref: els.store.value,
      employeeName: user?.name || '',
      branchName: '',
      items: items.map((item) => ({
        productName: item.name.trim(),
        code: item.code || '',
        assortmentHref: item.assortmentHref || '',
        assortmentType: item.assortmentType || 'product',
        productPrice: Number(item.price || 0),
        quantity: Number(item.quantity || 1)
      })).filter((item) => item.assortmentHref && item.quantity > 0)
    };

    if (!body.items.length) throw new Error('Добавьте хотя бы один товар.');
    if (body.items.some((item) => !Number.isFinite(item.productPrice) || item.productPrice < 0)) {
      throw new Error('Укажите корректную цену товара.');
    }
    if (customerMode === 'existing' && !body.customerHref) throw new Error('Выберите существующего контрагента.');
    if (customerMode === 'new' && !body.customerName) throw new Error('Укажите название контрагента.');

    const response = await fetch('/api/commercial-documents/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Не удалось сформировать PDF-счет.');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'schet-na-oplatu.pdf';
    const createdDocumentType = response.headers.get('X-Commercial-Document-Type') || '';
    const createdDocumentName = decodeURIComponent(response.headers.get('X-Commercial-Document-Name') || '');
    const createdDocumentWebUrl = decodeURIComponent(response.headers.get('X-Commercial-Document-Web-Url') || '');
    latestPdfBlob = blob;
    latestPdfFileName = fileName;
    latestDocumentUrl = createdDocumentWebUrl;
    const successMessage = createdDocumentType === commercialDocumentType
      ? `PDF сохранен, отгрузка создана: ${createdDocumentName || 'без номера'}`
      : `PDF-счет сформирован: ${fileName}`;
    setStatus(successMessage);
    openSuccessModal(successMessage, Boolean(createdDocumentWebUrl));
    els.form.reset();
    selectedCustomer = null;
    items = [createItem()];
    activeItemIndex = 0;
    renderItems();
  } catch (error) {
    setStatus(error.message || 'Ошибка', true);
  }
}

function createItem(seed = {}) {
  return {
    name: seed.name || '',
    code: seed.code || '',
    price: seed.price || '',
    priceMin: seed.priceMin || '',
    priceWholesale: seed.priceWholesale || '',
    quantity: seed.quantity || '1',
    assortmentHref: seed.assortmentHref || '',
    assortmentType: seed.assortmentType || 'product'
  };
}

function isWholesaleCustomerSelected() {
  return [...document.querySelectorAll('input[name="customerGroups"]:checked')]
    .some((input) => input.value === wholesaleGroupValue);
}

function resolveProductPrice(productLike) {
  const minPrice = Number(productLike?.minPrice || 0);
  const wholesalePrice = Number(productLike?.wholesalePrice || 0);
  if (isWholesaleCustomerSelected() && Number.isFinite(wholesalePrice) && wholesalePrice > 0) {
    return wholesalePrice;
  }
  return Number.isFinite(minPrice) ? minPrice : 0;
}

function syncItemPricesByCustomerGroup() {
  let changed = false;
  items = items.map((item) => {
    const minPrice = Number(item.priceMin || 0);
    const wholesalePrice = Number(item.priceWholesale || 0);
    if (!item.assortmentHref || (!minPrice && !wholesalePrice)) return item;
    changed = true;
    return {
      ...item,
      price: String(resolveProductPrice({ minPrice, wholesalePrice }))
    };
  });
  if (changed) renderItems();
}

function formatPriceMeta(price) {
  const value = Number(price?.value || 0);
  const currency = String(price?.currencyIsoCode || price?.currencyName || '').trim();
  if (!Number.isFinite(value)) return '0';
  return `${value}${currency ? ` ${currency}` : ''}`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', isError);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openSuccessModal(message, canOpenDocument) {
  els.successText.textContent = message;
  els.openDocumentButton.disabled = !canOpenDocument;
  els.successModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeSuccessModal() {
  els.successModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function printPdfBlob(blob, fileName) {
  const pdfUrl = URL.createObjectURL(blob);
  const printWindow = window.open('', '_blank', 'noopener');
  if (!printWindow) {
    downloadBlob(blob, fileName);
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(fileName)}</title>
        <style>
          html, body { margin: 0; height: 100%; background: #111827; }
          iframe { width: 100%; height: 100%; border: 0; }
        </style>
      </head>
      <body>
        <iframe src="${pdfUrl}"></iframe>
        <script>
          window.addEventListener('load', () => {
            setTimeout(() => window.print(), 400);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
  window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
}

function renderSearchSkeleton(count) {
  return Array.from({ length: count }, () => `
    <div class="search-result skeleton-card">
      <span class="skeleton-line lg"></span>
      <span class="skeleton-line md"></span>
      <span class="skeleton-line sm"></span>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
