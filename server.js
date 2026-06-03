import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const MOYSKLAD_BASE_URL = 'https://api.moysklad.ru/api/remap/1.2';

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      sendJson(res, 200, {
        documentType: process.env.MOYSKLAD_DOCUMENT_TYPE || 'customerorder'
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

    if (req.method === 'GET' && url.pathname === '/api/products') {
      const search = url.searchParams.get('search') || '';
      const products = await getMoySkladProducts(search);
      sendJson(res, 200, { products });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/calculate') {
      const body = await readJson(req);
      sendJson(res, 200, calculate(body));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const body = await readJson(req);
      const result = calculate(body);
      const document = await createMoySkladDocument(result, body);
      sendJson(res, 201, { calculation: result, document });
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`App is running at http://localhost:${PORT}`);
});

function calculate(input) {
  const productPrice = toMoney(input.productPrice);
  const paymentTypeName = String(input.paymentTypeName || input.bank || 'M+ (6 мес)');
  const paymentType = parsePaymentType(paymentTypeName);
  const months = paymentType.months;
  const quantity = Number(input.quantity || 1);

  if (!Number.isFinite(productPrice) || productPrice <= 0) {
    throw httpError(400, 'Укажите цену товара больше 0.');
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw httpError(400, 'Укажите количество больше 0.');
  }

  const rate = getPaymentRate(paymentType.provider, months);

  const baseTotal = roundMoney(productPrice * quantity);
  const commission = roundMoney(baseTotal * rate);
  const finalTotal = roundMoney(baseTotal + commission);
  const monthlyPayment = roundMoney(finalTotal / months);

  return {
    productPrice,
    quantity,
    bank: paymentType.provider,
    paymentType: paymentTypeName,
    months,
    rate,
    baseTotal,
    commission,
    finalTotal,
    monthlyPayment,
    currency: 'KGS'
  };
}

async function createMoySkladDocument(calculation, input) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const documentType = process.env.MOYSKLAD_DOCUMENT_TYPE || 'customerorder';
  const organizationHref = requiredEnv('MOYSKLAD_ORGANIZATION_HREF');
  const agentHref = await getOrCreateCounterparty(token, input);
  const assortmentHref = input.assortmentHref || requiredEnv('MOYSKLAD_ASSORTMENT_HREF');
  const assortmentType = input.assortmentType || process.env.MOYSKLAD_ASSORTMENT_TYPE || 'product';
  const storeHref = process.env.MOYSKLAD_STORE_HREF;

  if (documentType !== 'customerorder' && documentType !== 'demand') {
    throw httpError(500, 'MOYSKLAD_DOCUMENT_TYPE должен быть customerorder или demand.');
  }

  if (documentType === 'demand' && !storeHref) {
    throw httpError(500, 'Для создания Отгрузки нужен MOYSKLAD_STORE_HREF.');
  }
  if (documentType === 'demand' && !input.assortmentHref) {
    throw httpError(400, 'Выберите товар для отгрузки.');
  }

  const description = [
    `Тип оплаты: ${calculation.paymentType}.`,
    input.productName ? `Товар: ${input.productName}` : '',
    `Цена товара: ${formatMoney(calculation.baseTotal)} сом.`,
    `Комиссия: ${formatMoney(calculation.commission)} сом.`,
    `Итог: ${formatMoney(calculation.finalTotal)} сом.`,
    input.customerName ? `Клиент: ${input.customerName}` : '',
    input.customerPhone ? `Телефон: ${input.customerPhone}` : '',
    input.customerAddress ? `Адрес: ${input.customerAddress}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    organization: meta(organizationHref, 'organization'),
    agent: meta(agentHref, 'counterparty'),
    description,
    positions: [
      {
        quantity: calculation.quantity,
        price: toMoySkladPrice(calculation.finalTotal / calculation.quantity),
        assortment: meta(assortmentHref, assortmentType)
      }
    ]
  };

  if (storeHref) {
    payload.store = meta(storeHref, 'store');
  }

  if (process.env.MOYSKLAD_STATE_HREF) {
    payload.state = meta(process.env.MOYSKLAD_STATE_HREF, 'state');
  }

  const attributes = [];
  if (input.paymentTypeHref && process.env.MOYSKLAD_PAYMENT_TYPE_ATTRIBUTE_HREF) {
    attributes.push({
      meta: {
        href: process.env.MOYSKLAD_PAYMENT_TYPE_ATTRIBUTE_HREF,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: meta(input.paymentTypeHref, 'customentity')
    });
  }

  if (input.employeeHref && process.env.MOYSKLAD_EMPLOYEE_ATTRIBUTE_HREF) {
    attributes.push({
      meta: {
        href: process.env.MOYSKLAD_EMPLOYEE_ATTRIBUTE_HREF,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: meta(input.employeeHref, 'customentity')
    });
  }

  if (process.env.MOYSKLAD_RECEIVABLE_ATTRIBUTE_HREF) {
    attributes.push({
      meta: {
        href: process.env.MOYSKLAD_RECEIVABLE_ATTRIBUTE_HREF,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: Math.round(calculation.commission)
    });
  }

  if (attributes.length) {
    payload.attributes = attributes;
  }

  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/${documentType}`, {
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

  return {
    id: data.id,
    name: data.name,
    moment: data.moment,
    sum: data.sum,
    meta: data.meta
  };
}

async function getOrCreateCounterparty(token, input) {
  const customerName = String(input.customerName || '').trim();
  if (!customerName) {
    return requiredEnv('MOYSKLAD_AGENT_HREF');
  }

  const existing = await findCounterparty(token, customerName);
  if (existing) {
    await updateCounterpartyContact(token, existing.href, input);
    return existing.href;
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

  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/counterparty`, {
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

  const response = await fetch(href, {
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
  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/counterparty?${params}`, {
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

async function getMoySkladProducts(search) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const params = new URLSearchParams({ limit: '30' });
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/product?${params}`, {
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
    href: product.meta.href,
    type: product.meta.type
  }));
}

async function getMoySkladPaymentTypes() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const customEntityId = requiredEnv('MOYSKLAD_PAYMENT_TYPE_CUSTOM_ENTITY_ID');
  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/customentity/${customEntityId}?limit=100`, {
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
      return {
        name: item.name,
        href: item.meta.href,
        provider: parsed.provider,
        months: parsed.months,
        rate: getPaymentRate(parsed.provider, parsed.months)
      };
    })
    .sort((left, right) => left.provider.localeCompare(right.provider, 'ru') || left.months - right.months);
}

async function getMoySkladEmployees() {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const customEntityId = requiredEnv('MOYSKLAD_EMPLOYEE_CUSTOM_ENTITY_ID');
  const response = await fetch(`${MOYSKLAD_BASE_URL}/entity/customentity/${customEntityId}?limit=100`, {
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

function parsePaymentType(name) {
  const text = String(name || '').trim();
  const monthsMatch = text.match(/\((\d+)\s*мес\)/i);
  const months = monthsMatch ? Number(monthsMatch[1]) : 1;
  const provider = text.replace(/\s*\(\d+\s*мес\)\s*/i, '').trim();
  return { provider, months };
}

function getPaymentRate(provider, months) {
  const rates = paymentRateRules[provider];
  if (!rates || rates[months] === undefined) {
    return 0;
  }
  return rates[months];
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
