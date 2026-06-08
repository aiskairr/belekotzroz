import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

loadEnv(path.join(__dirname, '.env'));

const port = Number(process.env.PORT || 3100);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const defaultPercent = Number(process.env.LOYALTY_DEFAULT_PERCENT || 3);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || 'Ошибка сервера'
    });
  }
});

server.listen(port, () => {
  console.log(`Loyalty lab: http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
      defaultPercent
    });
    return;
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    sendJson(res, 200, { defaultPercent });
    return;
  }

  if (url.pathname === '/api/customers' && req.method === 'GET') {
    const phone = normalizePhone(url.searchParams.get('phone') || '');
    if (!phone) {
      throw httpError(400, 'Введите телефон клиента');
    }

    const rows = await supabaseGet('/rest/v1/loyalty_customers', {
      phone: `eq.${phone}`,
      select: 'id,phone,name,bonus_balance,created_at,updated_at',
      limit: '1'
    });

    const customer = rows[0] || null;
    const transactions = customer ? await getTransactions(customer.id) : [];
    sendJson(res, 200, { customer, transactions });
    return;
  }

  if (url.pathname === '/api/customers' && req.method === 'POST') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const name = String(body.name || '').trim();

    if (!phone) {
      throw httpError(400, 'Введите телефон клиента');
    }
    if (!name) {
      throw httpError(400, 'Введите ФИО клиента');
    }

    const rows = await supabasePost('/rest/v1/loyalty_customers?select=id,phone,name,bonus_balance,created_at,updated_at', {
      phone,
      name
    });

    sendJson(res, 201, { customer: rows[0] });
    return;
  }

  if (url.pathname === '/api/transactions/accrue' && req.method === 'POST') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const saleAmount = Math.round(Number(body.saleAmount || 0));
    const percent = Number.isFinite(Number(body.percent)) ? Number(body.percent) : defaultPercent;

    if (!phone) {
      throw httpError(400, 'Введите телефон клиента');
    }
    if (saleAmount <= 0) {
      throw httpError(400, 'Введите сумму продажи');
    }

    const rows = await supabaseRpc('loyalty_accrue', {
      p_phone: phone,
      p_name: String(body.name || '').trim(),
      p_sale_id: String(body.saleId || '').trim(),
      p_sale_amount: saleAmount,
      p_percent: percent,
      p_comment: String(body.comment || '').trim()
    });

    const result = rows[0];
    const transactions = await getTransactions(result.customer_id);
    sendJson(res, 200, { customer: rpcCustomer(result), transaction: result, transactions });
    return;
  }

  if (url.pathname === '/api/transactions/redeem' && req.method === 'POST') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const amount = Math.round(Number(body.amount || 0));

    if (!phone) {
      throw httpError(400, 'Введите телефон клиента');
    }
    if (amount <= 0) {
      throw httpError(400, 'Введите сумму списания');
    }

    const rows = await supabaseRpc('loyalty_redeem', {
      p_phone: phone,
      p_sale_id: String(body.saleId || '').trim(),
      p_amount: amount,
      p_comment: String(body.comment || '').trim()
    });

    const result = rows[0];
    const transactions = await getTransactions(result.customer_id);
    sendJson(res, 200, { customer: rpcCustomer(result), transaction: result, transactions });
    return;
  }

  throw httpError(404, 'Не найдено');
}

async function getTransactions(customerId) {
  return supabaseGet('/rest/v1/loyalty_transactions', {
    customer_id: `eq.${customerId}`,
    select: 'id,type,amount,balance_after,sale_id,comment,created_at',
    order: 'created_at.desc',
    limit: '30'
  });
}

function rpcCustomer(row) {
  return {
    id: row.customer_id,
    phone: row.phone,
    name: row.name,
    bonus_balance: row.bonus_balance
  };
}

async function supabaseGet(apiPath, params = {}) {
  const url = new URL(`${supabaseUrl}${apiPath}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return supabaseFetch(url, { method: 'GET' });
}

async function supabasePost(apiPath, body) {
  return supabaseFetch(`${supabaseUrl}${apiPath}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
}

async function supabaseRpc(name, body) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function supabaseFetch(url, options = {}) {
  if (!supabaseUrl || !supabaseKey) {
    throw httpError(500, 'Заполните SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в loyalty-lab/.env');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.hint || `Supabase error ${response.status}`;
    throw httpError(response.status, message);
  }

  return data || [];
}

async function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    throw httpError(403, 'Доступ запрещен');
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    res.end(file);
  } catch {
    throw httpError(404, 'Страница не найдена');
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `${plus}${digits}` : '';
}

function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // .env is optional for syntax checks and deployment environments.
  }
}
