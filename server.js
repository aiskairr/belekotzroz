import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MOYSKLAD_BASE_URL = 'https://api.moysklad.ru/api/remap/1.2';
const MOYSKLAD_TIMEOUT_MS = 15000;

const paymentRateRules = {
  'M+': {
    3: 0.05,
    6: 0.10,
    12: 0.20
  },
  'O!': {
    3: 0.06,
    6: 0.12,
    12: 0.24
  },
  'Банк Азии': {
    3: 0.04,
    6: 0.09,
    12: 0.19
  },
  Zero: {
    3: 0,
    6: 0,
    12: 0
  },
  Наличными: {
    1: 0
  },
  Долг: {
    1: 0
  }
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const recentOrders = new Map();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      sendJson(res, 200, {
        documentType: process.env.MOYSKLAD_DOCUMENT_TYPE || 'auto'
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/payment-types') {
      const paymentTypes = await getMoySkladPaymentTypes();
      sendJson(res, 200, { paymentTypes });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/employees') {
      const employees = await getMoySkladEmployees();
      sendJson(res, 200, { employees });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/stores') {
      const stores = await getMoySkladStores();
      sendJson(res, 200, { stores });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/retail-stores') {
      const retailStores = await getMoySkladRetailStores();
      sendJson(res, 200, { retailStores });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/retail-shifts') {
      const retailStoreHref = url.searchParams.get('retailStoreHref') || '';
      if (!retailStoreHref) {
        throw httpError(400, 'Укажите retailStoreHref.');
      }
      const retailShifts = await getMoySkladRetailShifts(retailStoreHref);
      sendJson(res, 200, { retailShifts });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
      const search = url.searchParams.get('search') || '';
      const products = await getMoySkladProducts(search);
      sendJson(res, 200, { products });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/customers') {
      const search = url.searchParams.get('search') || '';
      const customers = await getMoySkladCustomers(search);
      sendJson(res, 200, { customers });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/calculate') {
      const body = await readJson(req);
      sendJson(res, 200, calculate(body));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const body = await readJson(req);
      const requestKey = String(body.requestKey || '');
      if (requestKey && recentOrders.has(requestKey)) {
        sendJson(res, 200, recentOrders.get(requestKey));
        return;
      }

      const result = calculate(body);
      const document = await createMoySkladDocument(result, body);
      const payload = { calculation: result, document };
      if (requestKey) {
        recentOrders.set(requestKey, payload);
        setTimeout(() => recentOrders.delete(requestKey), 10 * 60 * 1000);
      }
      sendJson(res, 201, payload);
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    const status = Number(error.status || 500);
    sendJson(res, status, {
      error: error.message || 'Internal server error',
      details: error.details
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`App is running at http://localhost:${PORT}`);
});

function calculate(input) {
  const items = getOrderItems(input);
  const cashPrepayment = toMoney(input.cashPrepayment || 0);
  const transferPrepayment = toMoney(input.transferPrepayment || 0);
  const paymentTypeName = String(input.paymentTypeName || input.bank || 'M+ (6 мес)');
  const paymentType = parsePaymentType(paymentTypeName);
  const months = paymentType.months;

  if (!items.length) {
    throw httpError(400, 'Добавьте хотя бы один товар.');
  }
  if (!Number.isFinite(cashPrepayment) || cashPrepayment < 0) {
    throw httpError(400, 'Наличная предоплата не может быть отрицательной.');
  }
  if (!Number.isFinite(transferPrepayment) || transferPrepayment < 0) {
    throw httpError(400, 'Предоплата переводом не может быть отрицательной.');
  }

  const rate = getPaymentRate(paymentType.provider, months, input.paymentTypeRate);

  const baseTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const prepaidTotal = roundMoney(cashPrepayment + transferPrepayment);
  if (prepaidTotal > baseTotal) {
    throw httpError(400, 'Предоплата не может быть больше суммы товара.');
  }

  const installmentBase = roundMoney(baseTotal - prepaidTotal);
  const commission = roundMoney(installmentBase * rate);
  const finalTotal = baseTotal;
  const monthlyPayment = months > 0 ? roundMoney(installmentBase / months) : 0;

  const result = {
    items,
    bank: paymentType.provider,
    paymentType: paymentTypeName,
    months,
    rate,
    baseTotal,
    cashPrepayment,
    transferPrepayment,
    prepaidTotal,
    installmentBase,
    commission,
    finalTotal,
    monthlyPayment,
    currency: 'KGS'
  };
  result.documentType = resolveDocumentType(result);
  return result;
}

async function createMoySkladDocument(calculation, input) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const documentType = resolveDocumentType(calculation);
  const organizationHref = requiredEnv('MOYSKLAD_ORGANIZATION_HREF');
  if (!String(input.customerPhone || '').trim()) {
    throw httpError(400, 'Укажите номер телефона клиента.');
  }
  const agentHref = await getOrCreateCounterparty(token, input);
  const storeHref = input.storeHref || process.env.MOYSKLAD_STORE_HREF;
  const retailStoreHref = input.retailStoreHref || process.env.MOYSKLAD_RETAIL_STORE_HREF;

  if (!['customerorder', 'demand', 'retaildemand'].includes(documentType)) {
    throw httpError(500, 'MOYSKLAD_DOCUMENT_TYPE должен быть auto, customerorder, demand или retaildemand.');
  }

  if (documentType === 'demand' && !storeHref) {
    throw httpError(500, 'Для создания Отгрузки нужен MOYSKLAD_STORE_HREF.');
  }
  if (documentType === 'retaildemand' && !retailStoreHref) {
    throw httpError(500, 'Для создания розничной продажи нужна точка продаж.');
  }
  if (documentType === 'demand' && !calculation.items.length) {
    throw httpError(400, 'Выберите товар для отгрузки.');
  }
  if (documentType === 'retaildemand' && !calculation.items.length) {
    throw httpError(400, 'Выберите товар для розничной продажи.');
  }

  const description = [
    `Тип оплаты: ${calculation.paymentType}.`,
    ...calculation.items.map((item) => `Товар: ${item.productName} - ${item.quantity} x ${formatMoney(item.productPrice)} сом.`),
    `Цена товара: ${formatMoney(calculation.baseTotal)} сом.`,
    calculation.cashPrepayment ? `Оплата наличными: ${formatMoney(calculation.cashPrepayment)} сом.` : '',
    calculation.transferPrepayment ? `Оплата переводом: ${formatMoney(calculation.transferPrepayment)} сом.` : '',
    `Оплачено: ${formatMoney(getPaidAmount(calculation))} сом.`,
    `Не оплачено: ${formatMoney(getUnpaidAmount(calculation))} сом.`,
    `${getRemainderLabel(calculation)}: ${formatMoney(calculation.installmentBase)} сом.`,
    `Комиссия с рассрочки: ${formatMoney(calculation.commission)} сом.`,
    `Итог: ${formatMoney(calculation.finalTotal)} сом.`,
    input.customerName ? `Клиент: ${input.customerName}` : '',
    input.customerPhone ? `Телефон: ${input.customerPhone}` : '',
    input.customerAddress ? `Адрес: ${input.customerAddress}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    organization: meta(organizationHref, 'organization'),
    agent: meta(agentHref, 'counterparty'),
    description,
    positions: buildPositions(calculation)
  };

  if (documentType === 'retaildemand') {
    payload.retailStore = meta(retailStoreHref, 'retailstore');
    const retailStoreStockHref = input.storeHref || await getStoreHrefForRetailStore(token, retailStoreHref);
    if (retailStoreStockHref) {
      payload.store = meta(retailStoreStockHref, 'store');
    }
    const retailShiftHref = input.retailShiftHref || await getActiveRetailShiftHref(token, retailStoreHref);
    if (!retailShiftHref) {
      throw httpError(400, 'Для выбранной точки продаж нет открытой смены.');
    }
    payload.retailShift = meta(retailShiftHref, 'retailshift');
    Object.assign(payload, getRetailPaymentSums(calculation));
  } else if (storeHref) {
    payload.store = meta(storeHref, 'store');
  }

  if (process.env.MOYSKLAD_STATE_HREF) {
    payload.state = meta(process.env.MOYSKLAD_STATE_HREF, 'state');
  }

  const attributes = [];
  const paymentTypeAttributeHref = getAttributeHref('PAYMENT_TYPE', documentType);
  if (input.paymentTypeHref && paymentTypeAttributeHref) {
    attributes.push({
      meta: {
        href: paymentTypeAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: meta(input.paymentTypeHref, 'customentity')
    });
  }

  const employeeAttributeHref = getAttributeHref('EMPLOYEE', documentType);
  if (input.employeeHref && employeeAttributeHref) {
    attributes.push({
      meta: {
        href: employeeAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: meta(input.employeeHref, 'customentity')
    });
  }

  const receivableAttributeHref = getAttributeHref('RECEIVABLE', documentType);
  if (receivableAttributeHref) {
    attributes.push({
      meta: {
        href: receivableAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: Math.round(documentType === 'retaildemand' ? calculation.finalTotal : getUnpaidAmount(calculation))
    });
  }

  const paidAttributeHref = getAttributeHref('PAID', documentType);
  if (paidAttributeHref) {
    attributes.push({
      meta: {
        href: paidAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: Math.round(getPaidAmount(calculation))
    });
  }

  const unpaidAttributeHref = getAttributeHref('UNPAID', documentType);
  if (unpaidAttributeHref) {
    attributes.push({
      meta: {
        href: unpaidAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: Math.round(getUnpaidAmount(calculation))
    });
  }

  const commissionAttributeHref = getAttributeHref('COMMISSION', documentType);
  if (commissionAttributeHref) {
    attributes.push({
      meta: {
        href: commissionAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: `${formatMoney(calculation.commission)} сом`
    });
  }

  if (attributes.length) {
    payload.attributes = attributes;
  }

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/${documentType}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'МойСклад вернул ошибку при создании документа.', data);
  }

  const document = {
    id: data.id,
    name: data.name,
    type: documentType,
    moment: data.moment,
    sum: data.sum,
    meta: data.meta
  };

  if (documentType === 'demand' && getPaidAmount(calculation) > 0) {
    document.payment = await createIncomingPayment(token, {
      organizationHref,
      agentHref,
      demandMeta: data.meta,
      amount: getPaidAmount(calculation),
      description: `Оплата по отгрузке ${data.name || ''}`.trim()
    });
  }

  return document;
}

function resolveDocumentType(calculation) {
  const configuredType = process.env.MOYSKLAD_DOCUMENT_TYPE || 'auto';
  if (configuredType !== 'auto') {
    return configuredType;
  }

  return shouldCreateRetailDemand(calculation) ? 'retaildemand' : 'demand';
}

function getRemainderLabel(calculation) {
  const paymentName = String(calculation.paymentType || '').toLowerCase();
  if (paymentName.includes('долг')) {
    return 'В долг';
  }
  if (calculation.commission > 0) {
    return 'В рассрочку';
  }
  return 'Остаток';
}

function getPaidAmount(calculation) {
  return roundMoney(calculation.prepaidTotal || 0);
}

function getUnpaidAmount(calculation) {
  return roundMoney(Math.max(0, calculation.finalTotal - getPaidAmount(calculation)));
}

async function createIncomingPayment(token, input) {
  const amount = roundMoney(input.amount || 0);
  if (amount <= 0) {
    return null;
  }

  const sum = toMoySkladPrice(amount);
  const payload = {
    organization: meta(input.organizationHref, 'organization'),
    agent: meta(input.agentHref, 'counterparty'),
    sum,
    description: input.description || 'Создано автоматически из приложения рассрочки',
    operations: [
      {
        meta: input.demandMeta,
        linkedSum: sum
      }
    ]
  };

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/paymentin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Отгрузка создана, но не удалось создать входящий платеж.', data);
  }

  return {
    id: data.id,
    name: data.name,
    sum: data.sum,
    meta: data.meta
  };
}

function shouldCreateRetailDemand(calculation) {
  const paymentName = String(calculation.paymentType || '').toLowerCase();
  const debtPayment = paymentName.includes('долг');

  if (debtPayment) {
    return false;
  }

  return true;
}

function getOrderItems(input) {
  const rawItems = Array.isArray(input.items) && input.items.length
    ? input.items
    : [{
        productName: input.productName,
        assortmentHref: input.assortmentHref,
        assortmentType: input.assortmentType,
        productPrice: input.productPrice,
        quantity: input.quantity
      }];

  return rawItems.map((item, index) => {
    const productPrice = toMoney(item.productPrice);
    const quantity = Number(item.quantity || 1);
    const assortmentHref = item.assortmentHref;
    const assortmentType = item.assortmentType || process.env.MOYSKLAD_ASSORTMENT_TYPE || 'product';

    if (!assortmentHref) {
      throw httpError(400, `Выберите товар в позиции ${index + 1}.`);
    }
    if (!Number.isFinite(productPrice) || productPrice <= 0) {
      throw httpError(400, `Укажите цену товара в позиции ${index + 1}.`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError(400, `Укажите количество в позиции ${index + 1}.`);
    }

    return {
      productName: item.productName || `Позиция ${index + 1}`,
      assortmentHref,
      assortmentType,
      productPrice,
      quantity,
      lineTotal: roundMoney(productPrice * quantity)
    };
  });
}

function buildPositions(calculation) {
  return calculation.items.map((item) => ({
    quantity: item.quantity,
    price: toMoySkladPrice(item.productPrice),
    assortment: meta(item.assortmentHref, item.assortmentType)
  }));
}

function getRetailPaymentSums(calculation) {
  const paymentName = String(calculation.paymentType || '').toLowerCase();
  const prepaidTotal = roundMoney(calculation.cashPrepayment + calculation.transferPrepayment);

  if (prepaidTotal <= 0 && (paymentName.includes('налич') || paymentName.includes('cash'))) {
    return {
      cashSum: toMoySkladPrice(calculation.finalTotal),
      noCashSum: 0
    };
  }

  if (prepaidTotal <= 0 && (paymentName.includes('карта') || paymentName.includes('qr'))) {
    return {
      cashSum: 0,
      noCashSum: toMoySkladPrice(calculation.finalTotal)
    };
  }

  const cashSum = roundMoney(Math.min(calculation.cashPrepayment, calculation.finalTotal));
  const noCashSum = roundMoney(calculation.finalTotal - cashSum);
  return {
    cashSum: toMoySkladPrice(cashSum),
    noCashSum: toMoySkladPrice(noCashSum)
  };
}

async function getOrCreateCounterparty(token, input) {
  if (input.customerMode === 'existing' && input.customerHref) {
    await updateCounterpartyContact(token, input.customerHref, input);
    return input.customerHref;
  }

  const customerName = String(input.customerName || '').trim();
  if (!customerName) {
    throw httpError(400, 'Укажите ФИО клиента.');
  }

  const existing = await findCounterpartyDuplicate(token, customerName, input.customerPhone);
  if (existing) {
    throw httpError(409, `Такой клиент уже есть: ${existing.name}. Выберите режим "Старый клиент".`);
  }

  const payload = {
    name: customerName,
    description: 'Создано автоматически из приложения рассрочки'
  };

  const phone = String(input.customerPhone || '').trim();
  if (phone) {
    payload.phone = phone;
  }

  const address = String(input.customerAddress || '').trim();
  if (address) {
    payload.actualAddress = address;
  }

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/counterparty`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось создать контрагента в МойСклад.', data);
  }

  return data.meta.href;
}

async function updateCounterpartyContact(token, href, input) {
  const payload = {};
  const phone = String(input.customerPhone || '').trim();
  const address = String(input.customerAddress || '').trim();

  if (phone) {
    payload.phone = phone;
  }
  if (address) {
    payload.actualAddress = address;
  }
  if (!Object.keys(payload).length) {
    return;
  }

  const response = await moySkladFetch(href, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось обновить контрагента в МойСклад.', data);
  }
}

async function findCounterparty(token, name) {
  const params = new URLSearchParams({ search: name, limit: '20' });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/counterparty?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось найти контрагента в МойСклад.', data);
  }

  const normalizedName = name.toLowerCase();
  return (data.rows || []).find((counterparty) => String(counterparty.name || '').toLowerCase() === normalizedName);
}

async function findCounterpartyDuplicate(token, name, phone) {
  const candidates = [];
  const normalizedName = String(name || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);

  if (normalizedName) {
    const byName = await findCounterparties(token, name);
    candidates.push(...byName);
  }
  if (normalizedPhone) {
    const byPhone = await findCounterparties(token, phone);
    candidates.push(...byPhone);
  }

  return candidates.find((counterparty) => {
    const sameName = normalizedName && String(counterparty.name || '').trim().toLowerCase() === normalizedName;
    const samePhone = normalizedPhone && normalizePhone(counterparty.phone) === normalizedPhone;
    return sameName || samePhone;
  });
}

async function findCounterparties(token, search) {
  const params = new URLSearchParams({ search: String(search || '').trim(), limit: '20' });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/counterparty?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось найти контрагента в МойСклад.', data);
  }

  return data.rows || [];
}

async function getMoySkladCustomers(search) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const params = new URLSearchParams({ limit: '30' });
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/counterparty?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить клиентов из МойСклад.', data);
  }

  return (data.rows || []).map((counterparty) => ({
    id: counterparty.id,
    name: counterparty.name,
    phone: counterparty.phone || '',
    actualAddress: counterparty.actualAddress || '',
    href: counterparty.meta.href
  }));
}

async function getMoySkladProducts(search) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const params = new URLSearchParams({ limit: '30' });
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/product?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить товары из МойСклад.', data);
  }

  return (data.rows || []).map((product) => ({
    id: product.id,
    name: product.name,
    code: product.code,
    price: getProductPrice(product),
    href: product.meta.href,
    type: product.meta.type
  }));
}

function getProductPrice(product) {
  const salePrice = Array.isArray(product.salePrices) ? product.salePrices[0] : null;
  if (!salePrice || !Number.isFinite(Number(salePrice.value))) {
    return 0;
  }
  return roundMoney(Number(salePrice.value) / 100);
}

async function getMoySkladPaymentTypes() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const customEntityId = requiredEnv('MOYSKLAD_PAYMENT_TYPE_CUSTOM_ENTITY_ID');
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/customentity/${customEntityId}?limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить типы оплаты из МойСклад.', data);
  }

  return (data.rows || [])
    .map((item) => {
      const parsed = parsePaymentType(item.name);
      const rateFromComment = parseRateFromComment(item.description || item.comment || '');
      return {
        name: item.name,
        href: item.meta.href,
        comment: item.description || item.comment || '',
        provider: parsed.provider,
        months: parsed.months,
        rate: getPaymentRate(parsed.provider, parsed.months, rateFromComment)
      };
    })
    .sort((left, right) => left.provider.localeCompare(right.provider, 'ru') || left.months - right.months);
}

async function getMoySkladEmployees() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const customEntityId = requiredEnv('MOYSKLAD_EMPLOYEE_CUSTOM_ENTITY_ID');
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/customentity/${customEntityId}?limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить сотрудников из МойСклад.', data);
  }

  return (data.rows || []).map((item) => ({
    name: item.name,
    href: item.meta.href
  }));
}

async function getMoySkladStores() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/store?limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить склады из МойСклад.', data);
  }

  return (data.rows || []).map((store) => ({
    id: store.id,
    name: store.name,
    href: store.meta.href
  }));
}

async function getMoySkladRetailStores() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/retailstore?limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить точки продаж из МойСклад.', data);
  }

  return (data.rows || []).map((retailStore) => ({
    id: retailStore.id,
    name: retailStore.name,
    href: retailStore.meta.href,
    storeHref: retailStore.store?.meta?.href || '',
    storeName: retailStore.store?.name || ''
  }));
}

async function getMoySkladRetailShifts(retailStoreHref) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const shifts = await getRetailShifts(token, retailStoreHref);
  return shifts.map((shift) => ({
    id: shift.id,
    name: shift.name,
    href: shift.meta?.href || '',
    moment: shift.moment,
    closeDate: shift.closeDate,
    closeMoment: shift.closeMoment,
    closed: Boolean(shift.closed),
    retailStoreHref: shift.retailStore?.meta?.href || shift.retailstore?.meta?.href || ''
  }));
}

async function getStoreHrefForRetailStore(token, retailStoreHref) {
  const response = await moySkladFetch(retailStoreHref, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось получить точку продаж из МойСклад.', data);
  }

  return data.store?.meta?.href || '';
}

async function getActiveRetailShiftHref(token, retailStoreHref) {
  const shifts = await getRetailShifts(token, retailStoreHref);
  const retailStoreId = getIdFromHref(retailStoreHref);
  const activeShift = shifts.find((shift) => {
    const shiftStoreHref = shift.retailStore?.meta?.href || shift.retailstore?.meta?.href || '';
    const sameStore = shiftStoreHref === retailStoreHref || getIdFromHref(shiftStoreHref) === retailStoreId;
    return sameStore && !shift.closed;
  });

  return activeShift?.meta?.href || '';
}

async function getRetailShifts(token, retailStoreHref) {
  const params = new URLSearchParams({
    limit: '20',
    filter: `retailStore=${retailStoreHref}`,
    order: 'moment,desc'
  });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/retailshift?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить смены из МойСклад.', data);
  }

  return data.rows || [];
}

function parsePaymentType(name) {
  const text = String(name || '').trim();
  const monthsMatch = text.match(/\((\d+)\s*мес\)/i);
  const months = monthsMatch ? Number(monthsMatch[1]) : 1;
  const provider = text.replace(/\s*\(\d+\s*мес\)\s*/i, '').trim();
  return { provider, months };
}

function parseRateFromComment(comment) {
  const text = String(comment || '').trim().replace(',', '.');
  const numberOnlyMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  if (numberOnlyMatch) {
    return Number(numberOnlyMatch[1]) / 100;
  }

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return Number(percentMatch[1]) / 100;
  }

  const rateMatch = text.match(/(?:ставка|процент|комиссия)\s*[:=-]?\s*(0?\.\d+|\d+(?:\.\d+)?)/i);
  if (!rateMatch) {
    return undefined;
  }

  const value = Number(rateMatch[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value > 1 ? value / 100 : value;
}

function getPaymentRate(provider, months, explicitRate) {
  const rate = Number(explicitRate);
  if (Number.isFinite(rate) && rate >= 0) {
    return rate > 1 ? rate / 100 : rate;
  }

  const rates = paymentRateRules[provider];
  if (!rates || rates[months] === undefined) {
    return 0;
  }
  return rates[months];
}

function getAttributeHref(attribute, documentType) {
  const retailSpecific = process.env[`MOYSKLAD_RETAILDEMAND_${attribute}_ATTRIBUTE_HREF`];
  if (documentType === 'retaildemand') {
    return retailSpecific || '';
  }
  const customerOrderSpecific = process.env[`MOYSKLAD_CUSTOMERORDER_${attribute}_ATTRIBUTE_HREF`];
  if (documentType === 'customerorder') {
    return customerOrderSpecific || '';
  }
  return process.env[`MOYSKLAD_${attribute}_ATTRIBUTE_HREF`] || '';
}

function getIdFromHref(href) {
  return String(href || '').split('/').filter(Boolean).at(-1) || '';
}

async function serveStatic(pathname, res) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const normalized = normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const file = await readFile(filePath);
    const type = contentTypes[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      throw httpError(413, 'Слишком большой запрос.');
    }
  }
  return body ? JSON.parse(body) : {};
}

async function moySkladFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MOYSKLAD_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw httpError(504, 'МойСклад слишком долго отвечает. Попробуйте еще раз.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function meta(href, type) {
  return {
    meta: {
      href,
      type,
      mediaType: 'application/json'
    }
  };
}

function toMoney(value) {
  if (typeof value === 'string') {
    return Number(value.replace(/\s/g, '').replace(',', '.'));
  }
  return Number(value);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMoySkladPrice(value) {
  return Math.round(value * 100);
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.includes('00000000-0000-0000-0000-000000000000')) {
    throw httpError(500, `Заполните ${name} в .env.`);
  }
  return value;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function loadDotEnv() {
  try {
    const envPath = join(__dirname, '.env');
    const content = process.env.NODE_ENV === 'test' ? '' : readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (!process.env[key]) {
        process.env[key] = valueParts.join('=').trim();
      }
    }
  } catch {
    // .env is optional; .env.example documents the required keys.
  }
}
