import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const dataDir = join(__dirname, 'data');
const auditLogPath = join(dataDir, 'audit-log.jsonl');

loadDotEnv();
loadDotEnv(join(__dirname, 'loyalty-lab/.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MOYSKLAD_BASE_URL = 'https://api.moysklad.ru/api/remap/1.2';
const MOYSKLAD_TIMEOUT_MS = 15000;
const loyaltyAccrualPercent = Number(process.env.LOYALTY_ACCRUAL_PERCENT || process.env.LOYALTY_DEFAULT_PERCENT || 3);
const loyaltyMaxRedeemPercent = Number(process.env.LOYALTY_MAX_REDEEM_PERCENT || 30);

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
const reportCookieName = 'mysrs_report_session';
const crmCookieName = 'mysrs_crm_session';
const PRICE_FORMULA_TEMPLATE_START = '[ORDO_PRICE_TEMPLATE]';
const PRICE_FORMULA_TEMPLATE_END = '[/ORDO_PRICE_TEMPLATE]';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/crm/session') {
      sendJson(res, 200, { user: getCrmUser(req) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/crm/login') {
      const body = await readJson(req);
      const user = authenticateCrmUser(body.login, body.password);
      if (!user) throw httpError(401, 'Неверный логин или пароль.');
      setCrmSession(res, user);
      await writeAudit({ user, action: 'login', entity: 'session', description: 'Вход в CRM' });
      sendJson(res, 200, { user });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/crm/logout') {
      const user = getCrmUser(req);
      clearCrmSession(res);
      if (user) await writeAudit({ user, action: 'logout', entity: 'session', description: 'Выход из CRM' });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/audit') {
      requireCrmRole(req, ['admin', 'owner']);
      const rows = await readAuditLog(Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200)));
      sendJson(res, 200, { rows });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      sendJson(res, 200, {
        documentType: process.env.MOYSKLAD_DOCUMENT_TYPE || 'auto',
        loyalty: getLoyaltyConfig()
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/payment-types') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const paymentTypes = await getMoySkladPaymentTypes();
      sendJson(res, 200, { paymentTypes });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/employees') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const employees = await getMoySkladEmployees();
      sendJson(res, 200, { employees });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/stores') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const stores = await getMoySkladStores();
      sendJson(res, 200, { stores });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/retail-stores') {
      requireAnyAuthenticatedUser(req);
      const retailStores = await getMoySkladRetailStores();
      sendJson(res, 200, { retailStores });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/retail-shifts') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const retailStoreHref = url.searchParams.get('retailStoreHref') || '';
      if (!retailStoreHref) {
        throw httpError(400, 'Укажите retailStoreHref.');
      }
      const retailShifts = await getMoySkladRetailShifts(retailStoreHref);
      sendJson(res, 200, { retailShifts });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const search = url.searchParams.get('search') || '';
      const products = await getMoySkladProducts(search);
      sendJson(res, 200, { products });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/customers') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const search = url.searchParams.get('search') || '';
      const customers = await getMoySkladCustomers(search);
      sendJson(res, 200, { customers });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/loyalty/customer') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const phone = url.searchParams.get('phone') || '';
      const customer = await getLoyaltyCustomer(phone);
      sendJson(res, 200, { customer, loyalty: getLoyaltyConfig() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/report/session') {
      const user = getCrmUser(req);
      sendJson(res, 200, { authenticated: isReportAuthenticated(req), user });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/report/login') {
      const body = await readJson(req);
      loginReportUser(req, res, body);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/report/logout') {
      clearReportSession(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/reports/sales') {
      requireReportAuth(req);
      const report = await getSalesReport({
        dateFrom: url.searchParams.get('dateFrom') || '',
        dateTo: url.searchParams.get('dateTo') || '',
        retailStoreHref: url.searchParams.get('retailStoreHref') || '',
        storeHref: url.searchParams.get('storeHref') || ''
      });
      sendJson(res, 200, report);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reports/returns') {
      requireReportAuth(req);
      const user = getEffectiveUser(req, 'owner');
      const body = await readJson(req);
      const result = await createReportReturn(body);
      await writeAudit({ user, action: 'return', entity: body.documentType || 'document', entityId: body.documentId, description: `Возврат товара, количество: ${body.quantity || 1}` });
      sendJson(res, 201, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/accounting/prices') {
      requireAccountingAuth(req);
      const catalog = await getAccountingPriceCatalog({
        offset: url.searchParams.get('offset'),
        limit: url.searchParams.get('limit'),
        includePriceTypes: url.searchParams.get('includePriceTypes') !== 'false'
      });
      sendJson(res, 200, catalog);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/accounting/supply-products') {
      requireAccountingAuth(req);
      const result = await getAccountingSupplyProducts(url.searchParams.get('query') || '');
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/accounting/price-formula/folder-template') {
      const user = requireAccountingAuth(req);
      const body = await readJson(req);
      const result = await updateAccountingFolderPriceTemplate(body);
      await writeAudit({
        user,
        action: 'prices.template.folder',
        entity: 'productfolder',
        entityId: result.id,
        description: result.template ? `Шаблон цен сохранен для группы «${result.name}»` : `Шаблон цен удален у группы «${result.name}»`
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/accounting/prices/update') {
      requireAccountingAuth(req);
      const user = getEffectiveUser(req, 'accountant');
      const body = await readJson(req);
      const result = await updateAccountingPrices(body);
      await writeAudit({ user, action: 'prices.update', entity: 'product', description: `Массовое изменение цен: успешно ${result.updated}, ошибок ${result.failed}`, details: { updated: result.updated, failed: result.failed } });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/accounting/prices/formula-update') {
      requireAccountingAuth(req);
      const user = getEffectiveUser(req, 'accountant');
      const body = await readJson(req);
      const result = await updateAccountingFormulaPrices(body);
      await writeAudit({ user, action: 'prices.formula.update', entity: 'product', description: `Расчет цен: успешно ${result.updated}, ошибок ${result.failed}`, details: { updated: result.updated, failed: result.failed } });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/calculate') {
      requireCrmRole(req, ['admin', 'owner', 'employee']);
      const body = await readJson(req);
      sendJson(res, 200, calculate(body));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const user = requireCrmRole(req, ['admin', 'owner', 'employee']);
      const body = await readJson(req);
      const requestKey = String(body.requestKey || '');
      if (requestKey && recentOrders.has(requestKey)) {
        sendJson(res, 200, recentOrders.get(requestKey));
        return;
      }

      const result = calculate(body);
      await assertLoyaltyRedemptionAllowed(result, body);
      const document = await createMoySkladDocument(result, body);
      const loyalty = await applyLoyaltySafely(result, body, document);
      const payload = { calculation: result, document, loyalty };
      await writeAudit({
        user,
        action: 'sale.create',
        entity: document.type || 'document',
        entityId: document.id || '',
        description: `${document.type === 'retaildemand' ? 'Продажа' : 'Отгрузка'} ${document.name || ''} на ${formatMoney(result.finalTotal)} сом`,
        details: { documentName: document.name, amount: result.finalTotal, branch: body.branchName || '', customer: body.customerName || '' }
      });
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
  const prepaymentMethodName = String(input.prepaymentMethodName || 'Наличными');
  const transferPrepayment = toMoney(input.transferPrepayment || 0);
  const loyaltyRedemption = getValidatedLoyaltyRedemption(input);
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
  if (loyaltyRedemption > 0 && !getLoyaltyConfig().enabled) {
    throw httpError(400, 'Бонусная система сейчас выключена.');
  }
  if (loyaltyRedemption > 0 && input.customerMode === 'retail') {
    throw httpError(400, 'Для розничного покупателя нельзя списывать бонусы. Выберите старого или нового клиента.');
  }

  const rateFromInput = Number(input.paymentTypeRate);
  const rateFromPaymentComment = parseRateFromComment(input.paymentTypeComment);
  const explicitRate = Number.isFinite(rateFromInput) && rateFromInput > 0
    ? rateFromInput
    : rateFromPaymentComment;
  const rate = getPaymentRate(paymentType.provider, months, explicitRate);

  const baseTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  if (loyaltyRedemption > baseTotal) {
    throw httpError(400, 'Нельзя списать бонусов больше суммы товара.');
  }
  const maxLoyaltyRedemption = roundMoney(baseTotal * getLoyaltyMaxRedeemPercent() / 100);
  if (loyaltyRedemption > maxLoyaltyRedemption) {
    throw httpError(400, `Можно списать бонусами не больше ${formatMoney(maxLoyaltyRedemption)} сом.`);
  }
  const payableTotal = roundMoney(baseTotal - loyaltyRedemption);
  const prepaidTotal = roundMoney(cashPrepayment + transferPrepayment);
  if (prepaidTotal > payableTotal) {
    throw httpError(400, 'Предоплата не может быть больше суммы товара.');
  }

  const installmentBase = roundMoney(payableTotal - prepaidTotal);
  const commission = roundMoney(installmentBase * rate);
  const finalTotal = payableTotal;
  const netTotal = roundMoney(payableTotal - commission);
  const costTotal = roundMoney(items.reduce((sum, item) => sum + item.costTotal, 0));
  const netProfit = roundMoney(netTotal - costTotal);
  const monthlyPayment = months > 0 ? roundMoney(installmentBase / months) : 0;

  const result = {
    items,
    bank: paymentType.provider,
    paymentType: paymentTypeName,
    months,
    rate,
    baseTotal,
    loyaltyRedemption,
    payableTotal,
    cashPrepayment,
    prepaymentMethodName,
    transferPrepayment,
    prepaidTotal,
    installmentBase,
    commission,
    finalTotal,
    netTotal,
    costTotal,
    netProfit,
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
  if (input.customerMode !== 'retail' && !String(input.customerPhone || '').trim()) {
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

  const description = buildDocumentDescription(calculation);

  const positions = buildPositions(calculation);
  const documentTotal = fromMoySkladPrice(getPositionsTotal(positions));

  const payload = {
    organization: meta(organizationHref, 'organization'),
    agent: meta(agentHref, 'counterparty'),
    description,
    positions
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
    Object.assign(payload, getRetailPaymentSums(calculation, documentTotal));
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
      value: Math.round(getReceivableAmount(calculation, documentType))
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

  const netProfitAttributeHref = getAttributeHref('NET_PROFIT', documentType);
  if (netProfitAttributeHref) {
    attributes.push({
      meta: {
        href: netProfitAttributeHref,
        type: 'attributemetadata',
        mediaType: 'application/json'
      },
      value: Math.round(calculation.netProfit)
    });
  }

  if (attributes.length) {
    payload.attributes = attributes;
  }

  const data = await postMoySkladDocumentWithAttributeRetry(token, documentType, payload);

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

async function postMoySkladDocumentWithAttributeRetry(token, documentType, payload) {
  const safePayload = structuredClone(payload);
  const skippedAttributeIds = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/${documentType}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;charset=utf-8',
        'Content-Type': 'application/json;charset=utf-8'
      },
      body: JSON.stringify(safePayload)
    });

    const data = await response.json().catch(() => null);
    if (response.ok) {
      if (skippedAttributeIds.length) {
        data._skippedAttributeIds = skippedAttributeIds;
      }
      return data;
    }

    const badAttributeId = getMissingAttributeId(data);
    if (!badAttributeId || !Array.isArray(safePayload.attributes)) {
      throw httpError(response.status, 'МойСклад вернул ошибку при создании документа.', data);
    }

    const before = safePayload.attributes.length;
    safePayload.attributes = safePayload.attributes.filter((attribute) =>
      getIdFromHref(attribute?.meta?.href) !== badAttributeId
    );
    if (safePayload.attributes.length === before) {
      throw httpError(response.status, 'МойСклад вернул ошибку при создании документа.', data);
    }
    if (!safePayload.attributes.length) {
      delete safePayload.attributes;
    }
    skippedAttributeIds.push(badAttributeId);
    console.warn(`MoySklad attribute ${badAttributeId} not found. Retrying ${documentType} without this attribute.`);
  }

  throw httpError(500, 'Не удалось создать документ: слишком много некорректных доп.полей.');
}

function getMissingAttributeId(data) {
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  for (const error of errors) {
    const message = String(error?.error || '');
    if (error?.code !== 1021 || !message.includes('AttributeMetadata')) {
      continue;
    }
    const match = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) {
      return match[0];
    }
  }
  return '';
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

function buildDocumentDescription(calculation) {
  const paymentName = String(calculation.paymentType || '');
  const paymentNameLower = paymentName.toLowerCase();
  const paidAmount = getPaidAmount(calculation);
  const unpaidAmount = getUnpaidAmount(calculation);
  const isDebt = paymentNameLower.includes('долг');
  const isMixed = paidAmount > 0 && unpaidAmount > 0;

  const lines = isMixed && !isDebt
    ? []
    : [`Тип оплаты: ${paymentName}.`];

  if (isDebt) {
    lines.push(`Оплачено: ${formatMoney(paidAmount)} сом.`);
    lines.push(`Не оплачено: ${formatMoney(unpaidAmount)} сом.`);
    lines.push(`Долг: ${formatMoney(unpaidAmount)} сом.`);
  } else if (isMixed) {
    lines.push(`${calculation.prepaymentMethodName}: ${formatMoney(paidAmount)} сом.`);
    lines.push(`${paymentName}: ${formatMoney(unpaidAmount)} сом.`);
  }
  if (calculation.loyaltyRedemption > 0) {
    lines.push(`Бонусы списано: ${formatMoney(calculation.loyaltyRedemption)} сом.`);
  }

  return lines.slice(0, 4).join('\n');
}

function getPaidAmount(calculation) {
  return roundMoney(calculation.prepaidTotal || 0);
}

function getUnpaidAmount(calculation) {
  return roundMoney(Math.max(0, calculation.finalTotal - getPaidAmount(calculation)));
}

function getReceivableAmount(calculation, documentType) {
  if (calculation.commission > 0) {
    return calculation.netTotal;
  }

  if (documentType === 'retaildemand') {
    return calculation.finalTotal;
  }

  return getUnpaidAmount(calculation);
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
    const productCost = toMoney(item.productCost || 0);
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
      productCost,
      quantity,
      lineTotal: roundMoney(productPrice * quantity),
      costTotal: roundMoney(productCost * quantity)
    };
  });
}

function buildPositions(calculation) {
  const discounts = distributeLoyaltyDiscount(calculation);
  return calculation.items.map((item, index) => ({
    quantity: item.quantity,
    price: toMoySkladPrice(item.productPrice),
    ...(discounts[index] > 0 ? { discount: discounts[index] } : {}),
    assortment: meta(item.assortmentHref, item.assortmentType)
  }));
}

function distributeLoyaltyDiscount(calculation) {
  const targetDiscount = toMoySkladPrice(calculation.loyaltyRedemption || 0);
  if (targetDiscount <= 0) {
    return calculation.items.map(() => 0);
  }

  const lineTotals = calculation.items.map((item) => toMoySkladPrice(item.lineTotal));
  const total = lineTotals.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return calculation.items.map(() => 0);
  }

  let distributed = 0;
  const lineDiscounts = lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) {
      return Math.max(0, targetDiscount - distributed);
    }
    const value = Math.round(targetDiscount * lineTotal / total);
    distributed += value;
    return value;
  });

  return calculation.items.map((item, index) => {
    const lineTotal = lineTotals[index];
    if (lineTotal <= 0) {
      return 0;
    }
    return Number((lineDiscounts[index] / lineTotal * 100).toFixed(6));
  });
}

function getPositionsTotal(positions) {
  return positions.reduce((sum, position) => {
    const quantity = Number(position.quantity || 0);
    const price = Number(position.price || 0);
    const discount = Number(position.discount || 0);
    return sum + Math.round(price * quantity * Math.max(0, 100 - discount) / 100);
  }, 0);
}

function getRetailPaymentSums(calculation, documentTotal = calculation.finalTotal) {
  const paymentName = String(calculation.paymentType || '').toLowerCase();
  const prepaidTotal = roundMoney(calculation.cashPrepayment + calculation.transferPrepayment);
  const total = roundMoney(documentTotal);

  if (prepaidTotal <= 0 && (paymentName.includes('налич') || paymentName.includes('cash'))) {
    return {
      cashSum: toMoySkladPrice(total),
      noCashSum: 0
    };
  }

  if (prepaidTotal <= 0 && (paymentName.includes('карта') || paymentName.includes('qr'))) {
    return {
      cashSum: 0,
      noCashSum: toMoySkladPrice(total)
    };
  }

  const prepaidAmount = roundMoney(Math.min(calculation.cashPrepayment, total));
  const prepaymentIsCash = isCashPrepaymentMethod(calculation.prepaymentMethodName);
  const cashSum = prepaymentIsCash ? prepaidAmount : 0;
  const noCashSum = roundMoney(total - cashSum);
  return {
    cashSum: toMoySkladPrice(cashSum),
    noCashSum: toMoySkladPrice(noCashSum)
  };
}

function isCashPrepaymentMethod(methodName) {
  const name = String(methodName || '').toLowerCase();
  return name.includes('налич') || name.includes('cash');
}

async function getOrCreateCounterparty(token, input) {
  if (input.customerMode === 'retail') {
    return requiredEnv('MOYSKLAD_AGENT_HREF');
  }

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
  const queries = getProductSearchQueries(search);
  const allProducts = [];
  const seen = new Set();

  for (const query of queries) {
    const rows = await loadMoySkladProductRows(token, query);
    for (const product of rows) {
      const href = product.meta?.href;
      if (!href || seen.has(href)) {
        continue;
      }
      seen.add(href);
      allProducts.push(product);
    }
  }

  return allProducts.slice(0, 30).map((product) => ({
    id: product.id,
    name: product.name,
    code: product.code,
    article: product.article || '',
    externalCode: product.externalCode || '',
    barcode: getProductBarcode(product),
    price: getProductPrice(product),
    cost: getProductCost(product),
    href: product.meta.href,
    type: product.meta.type
  }));
}

async function getAccountingPriceCatalog(options = {}) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
  const limit = Math.min(500, Math.max(1, Number.parseInt(options.limit, 10) || 500));
  const [productPage, priceTypes, folders] = await Promise.all([
    loadMoySkladProductPage(token, offset, limit),
    options.includePriceTypes ? getMoySkladPriceTypes(token) : Promise.resolve([]),
    options.includePriceTypes ? getMoySkladProductFolders(token).catch(() => []) : Promise.resolve([])
  ]);

  return {
    priceTypes,
    folders,
    offset,
    limit,
    total: productPage.total,
    nextOffset: offset + productPage.products.length,
    hasMore: offset + productPage.products.length < productPage.total,
    products: productPage.products.map((product) => ({
      id: product.id,
      name: product.name || '',
      code: product.code || '',
      article: product.article || '',
      href: product.meta?.href || '',
      type: product.meta?.type || 'product',
      archived: Boolean(product.archived),
      folder: getAccountingProductFolder(product),
      buyPrice: getAccountingBuyPrice(product),
      minPrice: getAccountingMinPrice(product),
      prices: (product.salePrices || []).map((price) => ({
        value: roundMoney(Number(price.value || 0) / 100),
        priceTypeHref: price.priceType?.meta?.href || '',
        priceTypeName: price.priceType?.name || '',
        currencyHref: price.currency?.meta?.href || '',
        currencyIsoCode: price.currency?.isoCode || '',
        currencyName: price.currency?.name || price.currency?.fullName || ''
      }))
    }))
  };
}

async function getAccountingSupplyProducts(query) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw httpError(400, 'Введите номер или ссылку приемки.');

  const supplyId = getMoySkladEntityIdFromInput(normalizedQuery);
  const supply = supplyId
    ? await loadMoySkladSupply(token, supplyId)
    : await findMoySkladSupply(token, normalizedQuery);
  if (!supply?.id) throw httpError(404, 'Приемка не найдена.');

  const positions = await loadMoySkladSupplyPositions(token, supply.id);
  return {
    id: supply.id,
    name: supply.name || '',
    moment: supply.moment || '',
    products: positions.map((position) => {
      const assortment = position.assortment || {};
      return {
        id: assortment.id || getIdFromHref(assortment.meta?.href || ''),
        href: assortment.meta?.href || '',
        type: assortment.meta?.type || '',
        name: assortment.name || position.name || '',
        code: assortment.code || '',
        article: assortment.article || '',
        quantity: Number(position.quantity || 0)
      };
    }).filter((product) => product.href && product.type === 'product')
  };
}

async function findMoySkladSupply(token, query) {
  const params = new URLSearchParams({
    limit: '10',
    search: query,
    order: 'moment,desc'
  });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/supply?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось найти приемку в МойСклад.', data);
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const exact = rows.find((item) => String(item.name || '').trim() === query);
  const selected = exact || rows[0];
  if (!selected?.id) throw httpError(404, `Приемка «${query}» не найдена.`);
  return loadMoySkladSupply(token, selected.id);
}

async function loadMoySkladSupply(token, supplyId) {
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/supply/${supplyId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить приемку из МойСклад.', data);
  }
  return data;
}

async function loadMoySkladSupplyPositions(token, supplyId) {
  const positions = [];
  let offset = 0;
  const limit = 1000;

  while (offset < 10000) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      expand: 'assortment'
    });
    const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/supply/${supplyId}/positions?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;charset=utf-8'
      }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw httpError(response.status, 'Не удалось загрузить товары из приемки.', data);
    }

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    positions.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  return positions;
}

function getMoySkladEntityIdFromInput(value) {
  return String(value || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] || '';
}

function getAccountingBuyPrice(product) {
  const buyPrice = product.buyPrice || {};
  const value = Number(buyPrice.value || 0);
  return {
    value: Number.isFinite(value) ? roundMoney(value / 100) : 0,
    currencyName: buyPrice.currency?.name || '',
    currencyIsoCode: buyPrice.currency?.isoCode || '',
    currencyHref: buyPrice.currency?.meta?.href || ''
  };
}

function getAccountingMinPrice(product) {
  const minPrice = product.minPrice || {};
  const value = Number(minPrice.value || 0);
  return {
    value: Number.isFinite(value) ? roundMoney(value / 100) : 0,
    currencyName: minPrice.currency?.name || '',
    currencyIsoCode: minPrice.currency?.isoCode || '',
    currencyHref: minPrice.currency?.meta?.href || ''
  };
}

function getAccountingProductFolder(product) {
  const folder = product.productFolder || {};
  return {
    href: folder.meta?.href || '',
    id: folder.id || getIdFromHref(folder.meta?.href || ''),
    name: folder.name || '',
    pathName: folder.pathName || ''
  };
}

async function loadMoySkladProductPage(token, offset, limit) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    order: 'name,asc',
    expand: 'productFolder'
  });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/product?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить каталог цен из МойСклад.', data);
  }

  const products = data?.rows || [];
  const total = Number(data?.meta?.size);
  return {
    products,
    total: Number.isFinite(total) ? total : offset + products.length
  };
}

async function getMoySkladProductFolders(token) {
  const folders = [];
  let offset = 0;
  const limit = 100;

  while (offset < 5000) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      order: 'pathName,asc'
    });
    const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/productfolder?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;charset=utf-8'
      }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw httpError(response.status, 'Не удалось загрузить группы товаров из МойСклад.', data);
    }

    const rows = data?.rows || [];
    folders.push(...rows.map((folder) => ({
      id: folder.id || getIdFromHref(folder.meta?.href || ''),
      name: folder.name || '',
      pathName: folder.pathName || '',
      href: folder.meta?.href || '',
      template: parsePriceFormulaTemplate(folder.description || '')
    })).filter((folder) => folder.href));
    if (rows.length < limit) break;
    offset += limit;
  }

  return folders.sort((left, right) =>
    getFolderDisplayName(left).localeCompare(getFolderDisplayName(right), 'ru')
  );
}

function getFolderDisplayName(folder) {
  return [folder.pathName, folder.name].filter(Boolean).join(' / ');
}

async function updateAccountingFolderPriceTemplate(input) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const folderHref = String(input.folderHref || '').trim();
  const templateInput = input.template || null;
  const folderId = getMoySkladEntityIdFromInput(folderHref);
  if (!folderId) throw httpError(400, 'Выберите корректную группу или подгруппу.');

  const folder = await loadMoySkladProductFolder(token, folderId);
  const template = templateInput ? normalizePriceFormulaTemplate(templateInput, folder) : null;
  const description = setPriceFormulaTemplateInDescription(folder.description || '', template);

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/productfolder/${folderId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description })
  });
  const updated = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось сохранить шаблон в описании группы.', updated);
  }

  return {
    id: folderId,
    href: updated?.meta?.href || folderHref,
    name: updated?.name || folder.name || '',
    pathName: updated?.pathName || folder.pathName || '',
    template: parsePriceFormulaTemplate(updated?.description || description)
  };
}

async function loadMoySkladProductFolder(token, folderId) {
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/productfolder/${folderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить группу товаров из МойСклад.', data);
  }
  return data;
}

function normalizePriceFormulaTemplate(template, folder = {}) {
  const id = String(template.id || folder.meta?.href || folder.id || randomUUID());
  const name = String(template.name || folder.name || 'Шаблон группы').trim();
  const tiers = Array.isArray(template.tiers) ? template.tiers : [];
  const wholesaleTiers = Array.isArray(template.wholesaleTiers) ? template.wholesaleTiers : tiers;
  const normalizeTiers = (items) => items.map((tier) => ({
    from: tier.from ?? '',
    to: tier.to ?? '',
    amount: tier.amount ?? '',
    currency: String(tier.currency || 'kgs').toLowerCase() === 'usd' ? 'usd' : 'kgs'
  }));
  return {
    id,
    name,
    usdRate: toFiniteNumber(template.usdRate, 89),
    markup: 0,
    markupMode: 'tiers',
    tiers: normalizeTiers(tiers),
    wholesaleTiers: normalizeTiers(wholesaleTiers),
    fallbackMarkupMode: 'none',
    fallbackMarkup: 0,
    wholesaleFallbackMarkupMode: 'none',
    wholesaleFallbackMarkup: 0,
    bank36: toFiniteNumber(template.bank36, 10),
    bank912: toFiniteNumber(template.bank912, 20),
    calculate36: template.calculate36 !== false,
    calculate912: template.calculate912 !== false,
    rounding: toFiniteNumber(template.rounding, 10)
  };
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parsePriceFormulaTemplate(description) {
  const text = String(description || '');
  const startIndex = text.indexOf(PRICE_FORMULA_TEMPLATE_START);
  const endIndex = text.indexOf(PRICE_FORMULA_TEMPLATE_END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return null;

  const encoded = text.slice(startIndex + PRICE_FORMULA_TEMPLATE_START.length, endIndex).trim();
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return normalizePriceFormulaTemplate(parsed);
  } catch {
    return null;
  }
}

function setPriceFormulaTemplateInDescription(description, template) {
  const clean = removePriceFormulaTemplateFromDescription(description);
  if (!template) return clean;
  const encoded = Buffer.from(JSON.stringify(template), 'utf8').toString('base64url');
  const block = `${PRICE_FORMULA_TEMPLATE_START}\n${encoded}\n${PRICE_FORMULA_TEMPLATE_END}`;
  return [clean, block].filter(Boolean).join('\n\n');
}

function removePriceFormulaTemplateFromDescription(description) {
  const text = String(description || '');
  const startIndex = text.indexOf(PRICE_FORMULA_TEMPLATE_START);
  const endIndex = text.indexOf(PRICE_FORMULA_TEMPLATE_END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return text.trim();
  return `${text.slice(0, startIndex)}${text.slice(endIndex + PRICE_FORMULA_TEMPLATE_END.length)}`.trim();
}

async function getMoySkladPriceTypes(token) {
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/context/companysettings/pricetype`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить типы цен из МойСклад.', data);
  }

  return (data || []).map((priceType) => ({
    id: priceType.id,
    name: priceType.name,
    href: priceType.meta?.href || ''
  })).filter((priceType) => priceType.href);
}

async function updateAccountingPrices(input) {
  const changes = Array.isArray(input.changes) ? input.changes : [];
  const priceTypeHref = String(input.priceTypeHref || '').trim();
  if (!changes.length) throw httpError(400, 'Нет цен для сохранения.');
  if (changes.length > 200) throw httpError(400, 'За один раз можно изменить не более 200 товаров.');

  const token = requiredEnv('MOYSKLAD_TOKEN');
  const priceTypes = await getMoySkladPriceTypes(token);
  const priceType = priceTypes.find((item) => item.href === priceTypeHref);
  if (!priceType) throw httpError(400, 'Выбранный тип цены не найден в МойСклад.');

  const normalized = changes.map((change) => {
    const productId = String(change.productId || '').trim();
    const value = toMoney(change.value);
    if (!/^[0-9a-f-]{36}$/i.test(productId)) throw httpError(400, 'Некорректный идентификатор товара.');
    if (!Number.isFinite(value) || value < 0 || value > 1000000000) {
      throw httpError(400, 'Цена должна быть от 0 до 1 000 000 000.');
    }
    return { productId, value: roundMoney(value) };
  });

  const results = await mapWithConcurrency(normalized, 5, async (change) => {
    try {
      await updateMoySkladProductPrice(token, change, priceType);
      return { productId: change.productId, value: change.value, ok: true };
    } catch (error) {
      return { productId: change.productId, value: change.value, ok: false, error: error.message };
    }
  });

  return {
    updated: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

async function updateMoySkladProductPrice(token, change, priceType) {
  const productUrl = `${MOYSKLAD_BASE_URL}/entity/product/${change.productId}`;
  const currentResponse = await moySkladFetch(productUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;charset=utf-8' }
  });
  const product = await currentResponse.json().catch(() => null);
  if (!currentResponse.ok) {
    throw httpError(currentResponse.status, 'Не удалось загрузить товар перед обновлением.', product);
  }

  const salePrices = Array.isArray(product.salePrices) ? [...product.salePrices] : [];
  const existingIndex = salePrices.findIndex((price) => price.priceType?.meta?.href === priceType.href);
  const existing = existingIndex >= 0 ? salePrices[existingIndex] : null;
  const currency = existing?.currency || salePrices.find((price) => price.currency)?.currency;
  if (!currency?.meta?.href) {
    throw httpError(400, `У товара «${product.name || change.productId}» не найдена валюта цены.`);
  }

  const newPrice = {
    value: toMoySkladPrice(change.value),
    currency,
    priceType: meta(priceType.href, 'pricetype')
  };
  if (existingIndex >= 0) salePrices[existingIndex] = newPrice;
  else salePrices.push(newPrice);

  const updateResponse = await moySkladFetch(productUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ salePrices })
  });
  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    throw httpError(updateResponse.status, `Не удалось обновить цену товара «${product.name || change.productId}».`, updated);
  }
}

async function updateAccountingFormulaPrices(input) {
  const changes = Array.isArray(input.changes) ? input.changes : [];
  const priceType36Href = String(input.priceType36Href || '').trim();
  const priceType912Href = String(input.priceType912Href || '').trim();
  const priceTypeWholesaleHref = String(input.priceTypeWholesaleHref || '').trim();
  if (!changes.length) throw httpError(400, 'Нет цен для сохранения.');
  if (changes.length > 200) throw httpError(400, 'За один раз можно изменить не более 200 товаров.');
  const shouldSave36 = Boolean(priceType36Href);
  const shouldSave912 = Boolean(priceType912Href);

  const token = requiredEnv('MOYSKLAD_TOKEN');
  const priceTypes = await getMoySkladPriceTypes(token);
  const priceType36 = shouldSave36 ? priceTypes.find((item) => item.href === priceType36Href) : null;
  const priceType912 = shouldSave912 ? priceTypes.find((item) => item.href === priceType912Href) : null;
  const priceTypeWholesale = priceTypes.find((item) => item.href === priceTypeWholesaleHref);
  if (shouldSave36 && !priceType36) throw httpError(400, 'Тип цены 3-6 не найден в МойСклад.');
  if (shouldSave912 && !priceType912) throw httpError(400, 'Тип цены 9-12 не найден в МойСклад.');
  if (!priceTypeWholesale) throw httpError(400, 'Тип цены «Оптовая цена» не найден в МойСклад.');
  const defaultUsdCurrency = await getMoySkladCurrencyByIsoCode(token, 'USD').catch(() => null);

  const normalized = changes.map((change) => {
    const productId = String(change.productId || '').trim();
    const wholesaleCurrencyHref = String(change.wholesaleCurrencyHref || '').trim();
    const wholesalePrice = toMoney(change.wholesalePrice);
    const minPrice = toMoney(change.minPrice);
    const price36 = change.price36 === null || change.price36 === undefined ? null : toMoney(change.price36);
    const price912 = change.price912 === null || change.price912 === undefined ? null : toMoney(change.price912);
    if (!/^[0-9a-f-]{36}$/i.test(productId)) throw httpError(400, 'Некорректный идентификатор товара.');
    if (wholesaleCurrencyHref && !getMoySkladEntityIdFromInput(wholesaleCurrencyHref)) {
      throw httpError(400, 'Некорректная валюта оптовой цены.');
    }
    for (const value of [wholesalePrice, minPrice, price36, price912].filter((item) => item !== null)) {
      if (!Number.isFinite(value) || value < 0 || value > 1000000000) {
        throw httpError(400, 'Цена должна быть от 0 до 1 000 000 000.');
      }
    }
    return {
      productId,
      wholesaleCurrencyHref,
      wholesalePrice: roundMoney(wholesalePrice),
      minPrice: roundMoney(minPrice),
      price36: price36 === null ? null : roundMoney(price36),
      price912: price912 === null ? null : roundMoney(price912)
    };
  });

  const results = await mapWithConcurrency(normalized, 5, async (change) => {
    try {
      await updateMoySkladProductFormulaPrices(token, change, priceType36, priceType912, priceTypeWholesale, defaultUsdCurrency);
      return { productId: change.productId, wholesalePrice: change.wholesalePrice, minPrice: change.minPrice, price36: change.price36, price912: change.price912, ok: true };
    } catch (error) {
      return { productId: change.productId, wholesalePrice: change.wholesalePrice, minPrice: change.minPrice, price36: change.price36, price912: change.price912, ok: false, error: error.message };
    }
  });

  return {
    updated: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

async function updateMoySkladProductFormulaPrices(token, change, priceType36, priceType912, priceTypeWholesale, defaultUsdCurrency) {
  const productUrl = `${MOYSKLAD_BASE_URL}/entity/product/${change.productId}`;
  const currentResponse = await moySkladFetch(productUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;charset=utf-8' }
  });
  const product = await currentResponse.json().catch(() => null);
  if (!currentResponse.ok) {
    throw httpError(currentResponse.status, 'Не удалось загрузить товар перед обновлением.', product);
  }

  const salePrices = Array.isArray(product.salePrices) ? [...product.salePrices] : [];
  const preferredPriceTypeHrefs = [priceType36?.href, priceType912?.href].filter(Boolean);
  const kgsCurrency = findKgsPriceCurrency(product, salePrices, preferredPriceTypeHrefs);
  if (!kgsCurrency?.meta?.href) {
    throw httpError(400, `У товара «${product.name || change.productId}» не найдена валюта KGS для цен.`);
  }
  const requestedUsdCurrency = change.wholesaleCurrencyHref
    ? meta(change.wholesaleCurrencyHref, 'currency')
    : null;
  const usdCurrency = requestedUsdCurrency
    || findUsdPriceCurrency(product, salePrices, priceTypeWholesale.href)
    || defaultUsdCurrency;
  if (!usdCurrency?.meta?.href) {
    throw httpError(400, `У товара «${product.name || change.productId}» не найдена валюта USD для оптовой цены.`);
  }

  upsertSalePrice(salePrices, priceTypeWholesale, change.wholesalePrice, usdCurrency);
  if (priceType36 && change.price36 !== null && change.price36 !== undefined) {
    upsertSalePrice(salePrices, priceType36, change.price36, kgsCurrency);
  }
  if (priceType912 && change.price912 !== null && change.price912 !== undefined) {
    upsertSalePrice(salePrices, priceType912, change.price912, kgsCurrency);
  }

  const updateResponse = await moySkladFetch(productUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      minPrice: { value: toMoySkladPrice(change.minPrice), currency: kgsCurrency },
      salePrices
    })
  });
  const updated = await updateResponse.json().catch(() => null);
  if (!updateResponse.ok) {
    throw httpError(updateResponse.status, `Не удалось обновить цены товара «${product.name || change.productId}».`, updated);
  }
  const savedWholesale = (updated?.salePrices || []).find((price) =>
    price.priceType?.meta?.href === priceTypeWholesale.href
  );
  const savedWholesaleValue = savedWholesale ? fromMoySkladPrice(savedWholesale.value) : null;
  if (savedWholesaleValue === null || Math.abs(savedWholesaleValue - change.wholesalePrice) > 0.001) {
    throw httpError(409, `МойСклад не подтвердил оптовую цену ${change.wholesalePrice} USD для товара «${product.name || change.productId}».`);
  }
}

function upsertSalePrice(salePrices, priceType, value, currency) {
  const nextPrice = {
    value: toMoySkladPrice(value),
    currency,
    priceType: meta(priceType.href, 'pricetype')
  };
  for (let index = salePrices.length - 1; index >= 0; index -= 1) {
    if (salePrices[index].priceType?.meta?.href === priceType.href) salePrices.splice(index, 1);
  }
  salePrices.push(nextPrice);
}

function findKgsPriceCurrency(product, salePrices, preferredPriceTypeHrefs = []) {
  const preferred = salePrices.find((price) =>
    preferredPriceTypeHrefs.includes(price.priceType?.meta?.href) && isKgsCurrency(price.currency)
  )?.currency;
  if (preferred) return preferred;
  if (isKgsCurrency(product.minPrice?.currency)) return product.minPrice.currency;
  return salePrices.find((price) => isKgsCurrency(price.currency))?.currency
    || product.minPrice?.currency
    || salePrices.find((price) => price.currency)?.currency;
}

function findUsdPriceCurrency(product, salePrices, wholesalePriceTypeHref) {
  const wholesaleCurrency = salePrices.find((price) =>
    price.priceType?.meta?.href === wholesalePriceTypeHref && isUsdCurrency(price.currency)
  )?.currency;
  if (wholesaleCurrency) return wholesaleCurrency;
  if (isUsdCurrency(product.buyPrice?.currency)) return product.buyPrice.currency;
  return salePrices.find((price) => isUsdCurrency(price.currency))?.currency || null;
}

async function getMoySkladCurrencyByIsoCode(token, isoCode) {
  const params = new URLSearchParams({ limit: '100' });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/currency?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;charset=utf-8' }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw httpError(response.status, `Не удалось загрузить валюту ${isoCode} из МойСклад.`, data);
  return (data?.rows || []).find((currency) =>
    String(currency.isoCode || '').toUpperCase() === String(isoCode || '').toUpperCase()
  ) || null;
}

function isKgsCurrency(currency) {
  const value = String([currency?.isoCode, currency?.name, currency?.fullName].filter(Boolean).join(' ')).toLowerCase();
  return value.includes('kgs') || value.includes('сом');
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function getProductSearchQueries(search) {
  const query = String(search || '').trim();
  if (!query) {
    return [''];
  }

  const queries = [query];
  if (/^\d+$/.test(query)) {
    queries.push(`B${query}`, `b${query}`);
  }

  return [...new Set(queries)];
}

async function loadMoySkladProductRows(token, search) {
  const params = new URLSearchParams({ limit: '30' });
  if (search) {
    params.set('search', search);
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

  return data.rows || [];
}

function getProductBarcode(product) {
  const barcode = Array.isArray(product.barcodes) ? product.barcodes[0] : null;
  if (!barcode) {
    return '';
  }
  return barcode.ean13 || barcode.ean8 || barcode.code128 || barcode.gtin || '';
}

function getProductPrice(product) {
  const salePrices = Array.isArray(product.salePrices) ? product.salePrices : [];
  const preferredName = process.env.MOYSKLAD_PRODUCT_PRICE_NAME || '3-6';
  const salePrice = findPreferredProductSalePrice(salePrices, preferredName);

  if (!salePrice || !Number.isFinite(Number(salePrice.value))) {
    return 0;
  }
  return roundMoney(Number(salePrice.value) / 100);
}

function findPreferredProductSalePrice(salePrices, preferredName) {
  const preferred = normalizePriceTypeName(preferredName);
  const normalizedPrices = salePrices.map((price) => ({
    price,
    name: normalizePriceTypeName(price.priceType?.name || '')
  }));

  return normalizedPrices.find((item) => item.name && item.name === preferred)?.price
    || normalizedPrices.find((item) => item.name && (item.name.includes(preferred) || preferred.includes(item.name)))?.price
    || normalizedPrices.find((item) => item.name.includes('3-6') || item.name.includes('3 6'))?.price
    || null;
}

function normalizePriceTypeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function getProductCost(product) {
  const buyPrice = product.buyPrice;
  if (!buyPrice || !Number.isFinite(Number(buyPrice.value))) {
    return 0;
  }
  return roundMoney(Number(buyPrice.value) / 100);
}

function getReportPositionCostTotal(position, documentMoneyRate = 1) {
  const buyPrice = position.assortment?.buyPrice;
  if (!buyPrice || !Number.isFinite(Number(buyPrice.value))) {
    return 0;
  }
  const value = Number(buyPrice.value) / 100;
  const cost = shouldConvertReportBuyPriceToKgs(buyPrice, position, documentMoneyRate)
    ? value * getReportUsdCostRate(documentMoneyRate)
    : value;
  return roundMoney(cost * Number(position.quantity || 0));
}

function shouldConvertReportBuyPriceToKgs(buyPrice, position, documentMoneyRate = 1) {
  if (isKgsCurrency(buyPrice.currency)) return false;
  if (isUsdCurrency(buyPrice.currency)) return true;
  if (documentMoneyRate > 1) return true;

  const unitCost = Number(buyPrice.value || 0) / 100;
  const unitSalePrice = fromMoySkladPrice(position.price);
  return unitCost > 0 && unitSalePrice > 0 && unitCost < unitSalePrice * 0.45;
}

function isUsdCurrency(currency) {
  const value = String([currency?.isoCode, currency?.name, currency?.fullName].filter(Boolean).join(' ')).toLowerCase();
  return value.includes('usd') || value.includes('доллар');
}

function getReportUsdCostRate(documentRate) {
  const documentRateNumber = Number(documentRate);
  if (Number.isFinite(documentRateNumber) && documentRateNumber > 10 && documentRateNumber < 200) {
    return documentRateNumber;
  }

  const envRate = Number(process.env.MOYSKLAD_REPORT_USD_RATE || process.env.MOYSKLAD_COST_USD_RATE || 88);
  return Number.isFinite(envRate) && envRate > 0 ? envRate : 88;
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
    .sort(comparePaymentTypes);
}

function comparePaymentTypes(left, right) {
  return getPaymentSortWeight(left) - getPaymentSortWeight(right)
    || left.provider.localeCompare(right.provider, 'ru')
    || left.months - right.months
    || left.name.localeCompare(right.name, 'ru');
}

function getPaymentSortWeight(paymentType) {
  const name = String(paymentType?.name || '').toLowerCase();
  if (name.includes('налич') || name.includes('cash')) return 10;
  if (name.includes('долг')) return 20;
  if (name.includes('qr')) return 30;
  return 40;
}

async function getSalesReport(input) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const dateFrom = normalizeReportDate(input.dateFrom, 'from');
  const dateTo = normalizeReportDate(input.dateTo, 'to');
  const retailStoreHref = String(input.retailStoreHref || '').trim();
  const storeHref = String(input.storeHref || '').trim();

  const [retailRows, demandRows] = await Promise.all([
    loadMoySkladReportDocuments(token, 'retaildemand', dateFrom, dateTo, { retailStoreHref }),
    loadMoySkladReportDocuments(token, 'demand', dateFrom, dateTo, { storeHref })
  ]);

  const rows = [...retailRows, ...demandRows]
    .map((document) => mapReportDocument(document))
    .sort((left, right) => new Date(right.moment) - new Date(left.moment));

  const totals = rows.reduce((sum, row) => ({
    documents: sum.documents + 1,
    amount: roundMoney(sum.amount + row.amount),
    paid: roundMoney(sum.paid + row.paid),
    unpaid: roundMoney(sum.unpaid + row.unpaid),
    commission: roundMoney(sum.commission + row.commission),
    netProfit: roundMoney(sum.netProfit + row.netProfit)
  }), {
    documents: 0,
    amount: 0,
    paid: 0,
    unpaid: 0,
    commission: 0,
    netProfit: 0
  });

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    rows,
    totals
  };
}

async function loadMoySkladReportDocuments(token, documentType, dateFrom, dateTo, options = {}) {
  const rows = [];
  let offset = 0;
  const limit = 100;

  while (offset < 1000) {
    const filters = [
      `moment>=${dateFrom}`,
      `moment<=${dateTo}`
    ];
    if (documentType === 'retaildemand' && options.retailStoreHref) {
      filters.push(`retailStore=${options.retailStoreHref}`);
    }
    if (documentType === 'demand' && options.storeHref) {
      filters.push(`store=${options.storeHref}`);
    }

    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      order: 'moment,desc',
      filter: filters.join(';'),
      expand: 'agent,organization,store,retailStore,retailShift,positions,positions.assortment,rate.currency'
    });

    const data = await loadMoySkladReportPage(token, documentType, params);

    rows.push(...(data.rows || []).map((row) => ({ ...row, reportDocumentType: documentType })));
    if (!data.rows || data.rows.length < limit) {
      break;
    }
    offset += limit;
  }

  return rows;
}

async function loadMoySkladReportPage(token, documentType, params) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json;charset=utf-8'
  };
  const url = `${MOYSKLAD_BASE_URL}/entity/${documentType}?${params}`;

  try {
    const response = await moySkladFetch(url, { headers });
    const data = await response.json().catch(() => null);
    if (response.ok) return data;

    if (String(params.get('expand') || '').includes('rate.currency')) {
      return loadMoySkladReportPageWithoutCurrency(token, documentType, params, headers, response.status, data);
    }
    throw httpError(response.status, `Не удалось загрузить отчет ${getDocumentTypeLabel(documentType)} из МойСклад.`, data);
  } catch (error) {
    if (!String(params.get('expand') || '').includes('rate.currency')) {
      throw error;
    }
    return loadMoySkladReportPageWithoutCurrency(token, documentType, params, headers, error.status, error.details);
  }
}

async function loadMoySkladReportPageWithoutCurrency(token, documentType, params, headers, originalStatus, originalData) {
  const fallbackParams = new URLSearchParams(params);
  fallbackParams.set('expand', 'agent,organization,store,retailStore,retailShift,positions,positions.assortment');
  const fallbackUrl = `${MOYSKLAD_BASE_URL}/entity/${documentType}?${fallbackParams}`;
  const fallbackResponse = await moySkladFetch(fallbackUrl, { headers });
  const fallbackData = await fallbackResponse.json().catch(() => null);
  if (fallbackResponse.ok) return fallbackData;
  throw httpError(
    fallbackResponse.status || originalStatus || 500,
    `Не удалось загрузить отчет ${getDocumentTypeLabel(documentType)} из МойСклад.`,
    fallbackData || originalData
  );
}

function mapReportDocument(document) {
  const documentType = document.reportDocumentType || document.meta?.type || '';
  const positions = Array.isArray(document.positions?.rows) ? document.positions.rows : [];
  const moneyRate = getReportDocumentMoneyRate(document);
  const amount = fromReportDocumentMoney(document.sum, moneyRate);
  const paidAttribute = getReportNumberAttribute(document, 'PAID', documentType);
  const unpaidAttribute = getReportNumberAttribute(document, 'UNPAID', documentType);
  const paid = paidAttribute !== null
    ? roundMoney(paidAttribute * moneyRate)
    : documentType === 'retaildemand'
      ? roundMoney(fromReportDocumentMoney(document.cashSum, moneyRate) + fromReportDocumentMoney(document.noCashSum, moneyRate))
      : fromReportDocumentMoney(document.payedSum, moneyRate);
  const unpaid = unpaidAttribute !== null
    ? roundMoney(unpaidAttribute * moneyRate)
    : roundMoney(Math.max(0, amount - paid));
  const costTotal = roundMoney(positions.reduce((sum, position) => sum + getReportPositionCostTotal(position, moneyRate), 0));
  const commission = roundMoney(getReportMoneyFromTextAttribute(document, 'COMMISSION', documentType) * moneyRate);
  const calculatedNetProfit = costTotal > 0 ? roundMoney(amount - commission - costTotal) : null;

  return {
    id: document.id,
    name: document.name || '',
    type: documentType,
    typeLabel: getDocumentTypeLabel(documentType),
    moment: document.moment || document.created || '',
    storeName: document.retailStore?.name || document.store?.name || '',
    organizationName: document.organization?.name || '',
    customerName: document.agent?.name || '',
    customerPhone: getReportPhone(document),
    customerAddress: getReportAddress(document),
    webUrl: getMoySkladWebUrl(documentType, document.id),
    paymentType: getReportPaymentType(document, documentType),
    employeeName: getReportTextAttribute(document, 'EMPLOYEE', documentType),
    products: positions.map((position, index) => ({
      index,
      code: position.assortment?.code || '',
      name: position.assortment?.name || position.name || 'Товар',
      quantity: Number(position.quantity || 0),
      price: fromReportDocumentMoney(position.price, moneyRate),
      sum: roundMoney(fromReportDocumentMoney(position.price, moneyRate) * Number(position.quantity || 0))
    })),
    productText: buildReportProductText(positions.map((position) => {
      const name = position.assortment?.name || position.name || 'Товар';
      const quantity = Number(position.quantity || 0);
      return `${name} x ${quantity}`;
    })),
    amount,
    paid,
    unpaid,
    commission,
    netProfit: calculatedNetProfit ?? roundMoney((getReportNumberAttribute(document, 'NET_PROFIT', documentType) ?? 0) * moneyRate),
    comment: document.description || ''
  };
}

function fromReportDocumentMoney(value, rate = 1) {
  return roundMoney(fromMoySkladPrice(value) * rate);
}

function getReportDocumentMoneyRate(document) {
  const currency = document.rate?.currency || document.currency || document.currencyInfo;
  if (isKgsCurrency(currency)) return 1;
  if (isUsdCurrency(currency)) return getReportUsdCostRate(document.rate?.value);

  const rateValue = Number(document.rate?.value || 0);
  if (Number.isFinite(rateValue) && rateValue > 10 && rateValue < 200) {
    return rateValue;
  }
  return 1;
}

async function createReportReturn(input) {
  const token = requiredEnv('MOYSKLAD_TOKEN');
  const documentType = String(input.documentType || '');
  const documentId = String(input.documentId || '');
  const productIndex = Number(input.productIndex);
  const quantity = Number(input.quantity || 0);

  if (!['retaildemand', 'demand'].includes(documentType)) {
    throw httpError(400, 'Возврат можно создать только по продаже или отгрузке.');
  }
  if (!documentId) {
    throw httpError(400, 'Не найден документ для возврата.');
  }
  if (!Number.isInteger(productIndex) || productIndex < 0) {
    throw httpError(400, 'Не найден товар для возврата.');
  }

  const original = await getMoySkladDocumentForReturn(token, documentType, documentId);
  const positions = Array.isArray(original.positions?.rows) ? original.positions.rows : [];
  const position = positions[productIndex];
  if (!position) {
    throw httpError(400, 'Товар не найден в документе.');
  }

  const returnQuantity = quantity > 0 ? quantity : Number(position.quantity || 0);
  if (returnQuantity <= 0 || returnQuantity > Number(position.quantity || 0)) {
    throw httpError(400, 'Количество возврата указано неверно.');
  }

  const returnType = documentType === 'retaildemand' ? 'retailsalesreturn' : 'salesreturn';
  const payload = buildReturnPayload(original, documentType, position, returnQuantity);

  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/${returnType}`, {
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
    throw httpError(response.status, 'Не удалось создать возврат в МойСклад.', data);
  }

  return {
    document: {
      id: data.id,
      name: data.name,
      type: returnType,
      webUrl: getMoySkladWebUrl(returnType, data.id)
    }
  };
}

async function applyLoyalty(calculation, input, document) {
  const config = getLoyaltyConfig();
  if (!config.enabled || input.customerMode === 'retail') {
    return null;
  }

  const phone = normalizePhone(input.customerPhone);
  if (!phone) {
    return null;
  }

  const saleId = [document.type, document.id].filter(Boolean).join(':');
  const result = {
    enabled: true,
    redeemed: 0,
    accrued: 0,
    balance: null,
    customer: null
  };

  if (calculation.loyaltyRedemption > 0) {
    const rows = await supabaseRpc('loyalty_redeem', {
      p_phone: phone,
      p_sale_id: saleId,
      p_amount: Math.round(calculation.loyaltyRedemption),
      p_comment: `Списание по документу ${document.name || saleId}`
    });
    const redemption = rows[0];
    result.redeemed = redemption?.transaction_amount || Math.round(calculation.loyaltyRedemption);
    result.balance = redemption?.bonus_balance ?? result.balance;
    result.customer = redemption ? rpcLoyaltyCustomer(redemption) : result.customer;
  }

  const accrueBase = Math.round(calculation.finalTotal || 0);
  const shouldAccrue = calculation.loyaltyRedemption <= 0;
  if (shouldAccrue && accrueBase > 0 && config.accrualPercent > 0) {
    const rows = await supabaseRpc('loyalty_accrue', {
      p_phone: phone,
      p_name: String(input.customerName || '').trim(),
      p_sale_id: saleId,
      p_sale_amount: accrueBase,
      p_percent: config.accrualPercent,
      p_comment: `Начисление по документу ${document.name || saleId}`
    });
    const accrual = rows[0];
    result.accrued = accrual?.transaction_amount || 0;
    result.balance = accrual?.bonus_balance ?? result.balance;
    result.customer = accrual ? rpcLoyaltyCustomer(accrual) : result.customer;
  }

  return result;
}

async function assertLoyaltyRedemptionAllowed(calculation, input) {
  if (!calculation.loyaltyRedemption) {
    return;
  }
  const config = getLoyaltyConfig();
  if (!config.enabled) {
    throw httpError(400, 'Бонусная система выключена.');
  }
  if (input.customerMode === 'retail') {
    throw httpError(400, 'Для розничного покупателя нельзя списать бонусы.');
  }

  const customer = await getLoyaltyCustomer(input.customerPhone);
  if (!customer) {
    throw httpError(400, 'Клиент еще не найден в бонусной базе. Сначала можно только начислить бонусы после покупки.');
  }
  if (Number(customer.bonus_balance || 0) < calculation.loyaltyRedemption) {
    throw httpError(400, `У клиента доступно только ${formatMoney(customer.bonus_balance || 0)} бонусов.`);
  }
}

async function applyLoyaltySafely(calculation, input, document) {
  try {
    return await applyLoyalty(calculation, input, document);
  } catch (error) {
    return {
      enabled: getLoyaltyConfig().enabled,
      error: error.message || 'Не удалось выполнить бонусную операцию.'
    };
  }
}

async function getLoyaltyCustomer(phone) {
  if (!getLoyaltyConfig().enabled) {
    return null;
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return null;
  }
  const rows = await supabaseGet('/rest/v1/loyalty_customers', {
    phone: `eq.${normalizedPhone}`,
    select: 'id,phone,name,bonus_balance,created_at,updated_at',
    limit: '1'
  });
  return rows[0] || null;
}

function rpcLoyaltyCustomer(row) {
  return {
    id: row.customer_id,
    phone: row.phone,
    name: row.name,
    bonus_balance: row.bonus_balance
  };
}

function getLoyaltyConfig() {
  const configured = String(process.env.LOYALTY_ENABLED || '').toLowerCase();
  const enabledByEnv = configured ? ['1', 'true', 'yes', 'on'].includes(configured) : Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    enabled: enabledByEnv && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    accrualPercent: Number.isFinite(loyaltyAccrualPercent) ? loyaltyAccrualPercent : 3,
    maxRedeemPercent: getLoyaltyMaxRedeemPercent()
  };
}

function getLoyaltyMaxRedeemPercent() {
  return Number.isFinite(loyaltyMaxRedeemPercent) ? loyaltyMaxRedeemPercent : 30;
}

function getValidatedLoyaltyRedemption(input) {
  const amount = toMoney(input.loyaltyRedemption || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, 'Сумма списания бонусов должна быть числом больше или равна нулю.');
  }
  if (!Number.isInteger(amount)) {
    throw httpError(400, 'Бонусы списываются только целым числом.');
  }
  return amount;
}

async function getMoySkladDocumentForReturn(token, documentType, documentId) {
  const params = new URLSearchParams({
    expand: 'agent,organization,store,retailStore,retailShift,positions,positions.assortment'
  });
  const response = await moySkladFetch(`${MOYSKLAD_BASE_URL}/entity/${documentType}/${documentId}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json;charset=utf-8'
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw httpError(response.status, 'Не удалось загрузить исходный документ для возврата.', data);
  }
  return data;
}

function buildReturnPayload(original, documentType, position, quantity) {
  const returnSum = roundMoney(fromMoySkladPrice(position.price) * quantity);
  const payload = {
    organization: original.organization,
    agent: original.agent,
    description: `Возврат товара из документа ${original.name || ''}`.trim(),
    positions: [
      {
        quantity,
        price: position.price,
        assortment: position.assortment
      }
    ]
  };

  if (documentType === 'retaildemand') {
    payload.retailDemand = original.meta;
  } else {
    payload.demand = original.meta;
  }

  if (original.store) {
    payload.store = original.store;
  }

  if (documentType === 'retaildemand') {
    payload.retailStore = original.retailStore;
    if (original.retailShift) {
      payload.retailShift = original.retailShift;
    }
    Object.assign(payload, getRetailReturnPaymentSums(original, returnSum));
  }

  return payload;
}

function getRetailReturnPaymentSums(original, returnSum) {
  const cash = fromMoySkladPrice(original.cashSum);
  const noCash = fromMoySkladPrice(original.noCashSum);
  const total = roundMoney(cash + noCash);
  if (total <= 0) {
    return { cashSum: 0, noCashSum: toMoySkladPrice(returnSum) };
  }
  const cashPart = roundMoney(returnSum * cash / total);
  const noCashPart = roundMoney(returnSum - cashPart);
  return {
    cashSum: toMoySkladPrice(cashPart),
    noCashSum: toMoySkladPrice(noCashPart)
  };
}

function buildReportProductText(productLines) {
  if (!productLines.length) {
    return '';
  }
  if (productLines.length <= 3) {
    return productLines.join(', ');
  }
  return `${productLines.slice(0, 3).join(', ')} и еще ${productLines.length - 3}`;
}

function getReportPhone(document) {
  return document.agent?.phone || document.agent?.phoneNumber || document.agent?.phones?.[0] || '';
}

function getReportAddress(document) {
  return normalizeReportAddress(
    document.shipmentAddress ||
    document.deliveryAddress ||
    document.agent?.actualAddress ||
    document.agent?.legalAddress ||
    document.agent?.actualAddressFull ||
    document.agent?.legalAddressFull
  );
}

function normalizeReportAddress(address) {
  if (!address) {
    return '';
  }
  if (typeof address === 'string') {
    return address;
  }
  return [
    address.postalCode,
    address.country,
    address.region,
    address.city,
    address.street,
    address.house,
    address.apartment,
    address.addInfo
  ].map(formatReportAddressPart).filter(Boolean).join(', ');
}

function formatReportAddressPart(part) {
  if (!part) {
    return '';
  }
  if (typeof part === 'object') {
    return part.name || part.value || '';
  }
  return String(part);
}

function getReportPaymentType(document, documentType) {
  const fromAttribute = getReportTextAttribute(document, 'PAYMENT_TYPE', documentType);
  if (fromAttribute) {
    return fromAttribute;
  }

  const match = String(document.description || '').match(/Тип оплаты:\s*([^\n.]+)/i);
  return match ? match[1].trim() : '';
}

function getReportTextAttribute(document, attribute, documentType) {
  const value = getReportAttributeValue(document, attribute, documentType);
  if (!value) {
    return '';
  }
  if (typeof value === 'object') {
    return value.name || value.meta?.href || '';
  }
  return String(value);
}

function getReportNumberAttribute(document, attribute, documentType) {
  const value = getReportAttributeValue(document, attribute, documentType);
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getReportMoneyFromTextAttribute(document, attribute, documentType) {
  const value = getReportAttributeValue(document, attribute, documentType);
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  const match = String(value).replace(/\s/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function getReportAttributeValue(document, attribute, documentType) {
  const attributeHref = getAttributeHref(attribute, documentType);
  if (!attributeHref || !Array.isArray(document.attributes)) {
    return undefined;
  }
  const attributeId = getIdFromHref(attributeHref);
  const found = document.attributes.find((entry) => {
    const href = entry.meta?.href || '';
    return href === attributeHref || getIdFromHref(href) === attributeId;
  });
  return found?.value;
}

function normalizeReportDate(value, side) {
  const date = String(value || '').trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(400, 'Дата отчета должна быть в формате YYYY-MM-DD.');
  }
  return `${date} ${side === 'to' ? '23:59:59' : '00:00:00'}`;
}

function getDocumentTypeLabel(type) {
  if (type === 'retaildemand') {
    return 'Продажа';
  }
  if (type === 'demand') {
    return 'Отгрузка';
  }
  if (type === 'customerorder') {
    return 'Заказ';
  }
  return 'Документ';
}

function getMoySkladWebUrl(type, id) {
  if (!type || !id) {
    return '';
  }
  return `https://online.moysklad.ru/app/#${type}/edit?id=${encodeURIComponent(id)}`;
}

function fromMoySkladPrice(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? roundMoney(number / 100) : 0;
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
  const safePath = pathname === '/'
    ? '/about.html'
    : pathname === '/sales.html'
      ? '/index.html'
      : pathname;
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
    throw httpError(502, 'Не удалось подключиться к МойСклад. Проверьте интернет или попробуйте еще раз.', {
      cause: error.message || String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseGet(apiPath, params = {}) {
  const url = new URL(`${getSupabaseUrl()}${apiPath}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return supabaseFetch(url, { method: 'GET' });
}

async function supabaseRpc(name, body) {
  return supabaseFetch(`${getSupabaseUrl()}/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function supabaseFetch(url, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!getSupabaseUrl() || !key) {
    throw httpError(500, 'Бонусная система включена, но не заполнены SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw httpError(response.status, data?.message || data?.hint || 'Supabase вернул ошибку.', data);
  }
  return data || [];
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
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

function requiredReportEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw httpError(500, `Заполните ${name} в .env для доступа к отчетам.`);
  }
  return value;
}

function loginReportUser(req, res, body) {
  const login = String(body.login || '').trim();
  const password = String(body.password || '');
  const crmUser = authenticateCrmUser(login, password);
  const legacyMatch = safeEqual(login, requiredReportEnv('REPORT_LOGIN'))
    && safeEqual(password, requiredReportEnv('REPORT_PASSWORD'));
  const user = crmUser || (legacyMatch ? { login, name: 'Владелец', role: 'owner' } : null);

  if (!user || !['admin', 'owner', 'accountant'].includes(user.role)) {
    throw httpError(401, 'Неверный логин или пароль.');
  }

  setReportSession(res, login);
  setCrmSession(res, user, { append: true });
  sendJson(res, 200, { ok: true, user });
}

function requireReportAuth(req) {
  const user = getCrmUser(req);
  if (user && ['admin', 'owner', 'accountant', 'employee'].includes(user.role)) return user;
  if (user) throw httpError(403, 'Отчетность недоступна для вашей роли.');
  if (!isReportAuthenticated(req)) {
    throw httpError(401, 'Войдите в отчетность.');
  }
  return { login: 'legacy-report', name: 'Владелец', role: 'owner' };
}

function requireAccountingAuth(req) {
  const user = getCrmUser(req);
  if (user && ['admin', 'owner', 'accountant'].includes(user.role)) return user;
  if (user) throw httpError(403, 'Бухгалтерия недоступна для вашей роли.');
  if (isReportAuthenticated(req)) return { login: 'legacy-report', name: 'Бухгалтер', role: 'accountant' };
  throw httpError(401, 'Войдите в бухгалтерию.');
}

function isReportAuthenticated(req) {
  const token = parseCookies(req.headers.cookie || '')[reportCookieName];
  if (!token) {
    return false;
  }

  const [payloadPart, signature] = token.split('.');
  if (!payloadPart || !signature) {
    return false;
  }

  const expectedSignature = signReportPayload(payloadPart);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function setReportSession(res, login) {
  const payload = Buffer.from(JSON.stringify({
    login,
    exp: Date.now() + 12 * 60 * 60 * 1000
  })).toString('base64url');
  const token = `${payload}.${signReportPayload(payload)}`;
  res.setHeader('Set-Cookie', `${reportCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
}

function getCrmUsers() {
  return [
    { role: 'admin', login: process.env.CRM_ADMIN_LOGIN || 'admin', password: process.env.CRM_ADMIN_PASSWORD || 'admin2026', name: process.env.CRM_ADMIN_NAME || 'Администратор' },
    { role: 'owner', login: process.env.CRM_OWNER_LOGIN || process.env.REPORT_LOGIN || 'owner', password: process.env.CRM_OWNER_PASSWORD || process.env.REPORT_PASSWORD || 'owner2026', name: process.env.CRM_OWNER_NAME || 'Владелец' },
    { role: 'accountant', login: process.env.CRM_ACCOUNTANT_LOGIN || 'accountant', password: process.env.CRM_ACCOUNTANT_PASSWORD || 'accountant2026', name: process.env.CRM_ACCOUNTANT_NAME || 'Бухгалтер' },
    { role: 'employee', login: process.env.CRM_EMPLOYEE_LOGIN || 'employee', password: process.env.CRM_EMPLOYEE_PASSWORD || 'employee2026', name: process.env.CRM_EMPLOYEE_NAME || 'Сотрудник' }
  ];
}

function authenticateCrmUser(login, password) {
  const normalizedLogin = String(login || '').trim();
  const normalizedPassword = String(password || '');
  const found = getCrmUsers().find((user) => safeEqual(normalizedLogin, user.login) && safeEqual(normalizedPassword, user.password));
  return found ? { login: found.login, name: found.name, role: found.role } : null;
}

function requireAnyAuthenticatedUser(req) {
  const user = getCrmUser(req);
  if (user || isReportAuthenticated(req)) return user || { login: 'legacy-report', name: 'Владелец', role: 'owner' };
  throw httpError(401, 'Войдите в систему.');
}

function requireCrmRole(req, roles) {
  const user = getCrmUser(req);
  if (!user) throw httpError(401, 'Войдите в систему.');
  if (!roles.includes(user.role)) throw httpError(403, 'У вашей роли нет доступа к этому разделу.');
  return user;
}

function getEffectiveUser(req, fallbackRole) {
  return getCrmUser(req) || { login: 'legacy-report', name: fallbackRole === 'accountant' ? 'Бухгалтер' : 'Владелец', role: fallbackRole };
}

function getCrmUser(req) {
  const token = parseCookies(req.headers.cookie || '')[crmCookieName];
  if (!token) return null;
  const [payloadPart, signature] = token.split('.');
  if (!payloadPart || !signature || !safeEqual(signature, signCrmPayload(payloadPart))) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    return { login: payload.login, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

function setCrmSession(res, user, options = {}) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const cookie = `${crmCookieName}=${payload}.${signCrmPayload(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`;
  if (options.append) {
    const existing = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing : existing ? [existing] : []), cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}

function clearCrmSession(res) {
  res.setHeader('Set-Cookie', [
    `${crmCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    `${reportCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  ]);
}

function signCrmPayload(payload) {
  const secret = process.env.CRM_SESSION_SECRET || process.env.REPORT_SESSION_SECRET || process.env.MOYSKLAD_TOKEN || 'local-crm-secret';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

async function writeAudit(entry) {
  try {
    await mkdir(dataDir, { recursive: true });
    const row = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      userLogin: entry.user?.login || 'system',
      userName: entry.user?.name || 'Система',
      role: entry.user?.role || 'system',
      action: entry.action || 'unknown',
      entity: entry.entity || '',
      entityId: entry.entityId || '',
      description: entry.description || '',
      details: entry.details || {}
    };
    await appendFile(auditLogPath, `${JSON.stringify(row)}\n`, 'utf8');
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
}

async function readAuditLog(limit) {
  try {
    const content = await readFile(auditLogPath, 'utf8');
    return content.split('\n').filter(Boolean).slice(-limit).reverse().map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function clearReportSession(res) {
  res.setHeader('Set-Cookie', `${reportCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function signReportPayload(payload) {
  const secret = process.env.REPORT_SESSION_SECRET || process.env.MOYSKLAD_TOKEN || 'local-report-secret';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(String(cookieHeader || '').split(';').map((cookie) => {
    const index = cookie.indexOf('=');
    if (index === -1) {
      return ['', ''];
    }
    return [cookie.slice(0, index).trim(), cookie.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
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

function loadDotEnv(envPath = join(__dirname, '.env')) {
  try {
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
