import 'dotenv/config';
import express from 'express';
import { WahaClient, buildMessage, normalizePhone } from './waha-client.js';
import { MessageQueue, summarizeJob } from './message-queue.js';

const config = {
  port: Number(process.env.PORT || 3300),
  backendApiKey: process.env.BACKEND_API_KEY || '',
  wahaUrl: process.env.WAHA_URL || 'http://localhost:3001',
  wahaApiKey: process.env.WAHA_API_KEY || '',
  wahaSession: process.env.WAHA_SESSION || 'default',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  sendDelayMs: Math.max(1000, Number(process.env.SEND_DELAY_MS || 5000)),
  sendMinDelayMs: Math.max(1000, Number(process.env.SEND_MIN_DELAY_MS || process.env.SEND_DELAY_MS || 25000)),
  sendMaxDelayMs: Math.max(1000, Number(process.env.SEND_MAX_DELAY_MS || process.env.SEND_DELAY_MS || 45000)),
  maxBatchSize: Math.max(1, Number(process.env.MAX_BATCH_SIZE || 200)),
  botEnabled: String(process.env.BOT_ENABLED || 'false').toLowerCase() === 'true',
  botApiUrl: String(process.env.BOT_API_URL || 'http://127.0.0.1:3000/api/bot/products').trim(),
  botApiKey: String(process.env.BOT_API_KEY || '').trim(),
  botReplyDelayMs: Math.max(500, Number(process.env.BOT_REPLY_DELAY_MS || 1800)),
  botCooldownMs: Math.max(1000, Number(process.env.BOT_COOLDOWN_MS || 8000))
};

const app = express();
const waha = new WahaClient({
  baseUrl: config.wahaUrl,
  apiKey: config.wahaApiKey,
  session: config.wahaSession
});
const queue = new MessageQueue({
  waha,
  delayMs: config.sendDelayMs,
  minDelayMs: config.sendMinDelayMs,
  maxDelayMs: config.sendMaxDelayMs
});
const messageStore = [];
const webhookStore = [];
const chatAliasByPhone = new Map();
const phoneByChatAlias = new Map();
const botProcessedMessageIds = new Set();
const botLastReplyByChat = new Map();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ordo-waha-backend',
    wahaUrl: config.wahaUrl,
    defaultSession: config.wahaSession,
    sendDelay: {
      minMs: config.sendMinDelayMs,
      maxMs: config.sendMaxDelayMs
    }
  });
});

app.post('/webhooks/waha', (req, res) => {
  const saved = saveWebhookMessages(req.body);
  saveWebhookPayload(req.body, saved);
  handleBotWebhook(req.body).catch((error) => {
    console.error('Bot webhook failed:', error.message);
  });
  res.json({ ok: true, saved });
});

app.use('/api', requireBackendApiKey);

app.get('/api/waha/session', asyncHandler(async (req, res) => {
  const session = req.query.session || config.wahaSession;
  const status = await waha.getSessionStatus(session);
  res.json({ session, status });
}));

app.post('/api/waha/session/start', asyncHandler(async (req, res) => {
  const session = req.body.session || req.query.session || config.wahaSession;
  const result = await waha.startSession(session);
  res.json({ ok: true, session, result });
}));

app.post('/api/waha/session/restart', asyncHandler(async (req, res) => {
  const session = req.body.session || req.query.session || config.wahaSession;
  const result = await waha.restartSession(session);
  res.json({ ok: true, session, result });
}));

app.get('/api/waha/session/qr', asyncHandler(async (req, res) => {
  const session = req.query.session || config.wahaSession;
  const qr = await waha.getQrCodeDataUrl(session);
  res.json({ ok: true, session, qr });
}));

app.post('/api/send-text', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const chatId = req.body.chatId;
  const text = String(req.body.text || '').trim();
  const session = req.body.session || config.wahaSession;

  if (!phone && !chatId) throw httpError(400, 'phone or chatId is required.');
  if (!text) throw httpError(400, 'text is required.');

  await ensureWahaReady(session);
  const result = await waha.sendText({ phone, chatId, text, session });
  const fallbackChatId = chatId || waha.toChatId(phone);
  const actualChatId = getActualWahaChatId(result, fallbackChatId);
  rememberChatAlias(phone, actualChatId);
  saveMessage({
    id: result?.id || result?.message?.id || `out:${Date.now()}:${Math.random()}`,
    session,
    chatId: actualChatId,
    phone,
    text,
    direction: 'out',
    timestamp: new Date().toISOString(),
    raw: result
  });
  res.json({ ok: true, result });
}));

app.post('/api/send-image', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const chatId = req.body.chatId;
  const imageUrl = String(req.body.imageUrl || '').trim();
  const caption = String(req.body.caption || '');
  const session = req.body.session || config.wahaSession;

  if (!phone && !chatId) throw httpError(400, 'phone or chatId is required.');
  if (!imageUrl) throw httpError(400, 'imageUrl is required.');

  await ensureWahaReady(session);
  const result = await waha.sendImage({ phone, chatId, imageUrl, caption, session });
  rememberChatAlias(phone, getActualWahaChatId(result, chatId || waha.toChatId(phone)));
  res.json({ ok: true, result });
}));

app.post('/api/send-batch', asyncHandler(async (req, res) => {
  const recipients = normalizeRecipients(req.body.recipients || []);
  const textTemplate = String(req.body.textTemplate || '').trim();
  const videoLinks = Array.isArray(req.body.videoLinks) ? req.body.videoLinks.map(String) : [];
  const session = req.body.session || config.wahaSession;
  const dryRun = Boolean(req.body.dryRun);

  if (!recipients.length) throw httpError(400, 'recipients is empty.');
  if (recipients.length > config.maxBatchSize) {
    throw httpError(400, `Batch is too large. Max ${config.maxBatchSize}.`);
  }
  if (!textTemplate) throw httpError(400, 'textTemplate is required.');

  if (!dryRun) await ensureWahaReady(session);
  const job = queue.createJob({
    recipients,
    session,
    dryRun,
    textFactory: (recipient) => buildMessage(textTemplate, recipient, videoLinks)
  });

  res.status(202).json({ ok: true, job: summarizeJob(job) });
}));

app.get('/api/jobs', (req, res) => {
  res.json({ jobs: queue.listJobs() });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  res.json({ job });
});

app.get('/api/messages', (req, res) => {
  hydrateChatAliasesFromMessages();
  const phone = normalizePhone(req.query.phone || '');
  const chatId = String(req.query.chatId || '').trim() || (phone ? waha.toChatId(phone) : '');
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
  const messages = messageStore
    .filter((message) => !chatId || isSameConversation(message, { phone, chatId }))
    .slice(-limit);
  res.json({ messages });
});

app.get('/api/webhooks', (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  res.json({ webhooks: webhookStore.slice(-limit) });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error.'
  });
});

app.listen(config.port, () => {
  console.log(`WAHA backend is running at http://localhost:${config.port}`);
});

function normalizeRecipients(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((recipient) => {
      const phone = normalizePhone(recipient.phone);
      const chatId = String(recipient.chatId || '').trim();
      return {
        name: String(recipient.name || '').trim(),
        phone,
        chatId,
        rawPhone: recipient.phone || ''
      };
    })
    .filter((recipient) => recipient.phone || recipient.chatId);
}

function saveWebhookMessages(payload) {
  const candidates = [
    payload,
    payload?.payload,
    payload?.data,
    payload?.message
  ].filter(Boolean);
  let saved = 0;
  for (const item of candidates) {
    const message = normalizeWebhookMessage(payload, item);
    if (!message) continue;
    saveMessage(message);
    saved += 1;
    break;
  }
  return saved;
}

function normalizeWebhookMessage(root, item) {
  const chatId = String(
    item.chatId
    || item.from
    || item.to
    || item.fromMe && item.to
    || item.id?.remote
    || item._data?.id?.remote
    || item._data?.from
    || ''
  ).trim();
  const body = item.body
    || item.text
    || item.caption
    || item.description
    || item.media?.caption
    || item.message?.conversation
    || item.message?.extendedTextMessage?.text
    || item._data?.body
    || item._data?.caption
    || '';
  let text = String(body || '').trim();
  if (!text && item.hasMedia) {
    const mediaType = item.media?.mimetype || item._data?.mimetype || 'media';
    text = `[${mediaType}]`;
  }
  if (!chatId || !text) return null;

  const fromMe = Boolean(item.fromMe || item.id?.fromMe);
  const phone = normalizeWebhookPhone(item, chatId);
  return {
    id: String(item.id?.id || item._data?.id?.id || item.id || root?.id || `${chatId}:${Date.now()}`),
    event: root?.event || root?.eventName || '',
    session: root?.session || item.session || config.wahaSession,
    chatId,
    phone,
    name: item.pushName || item.notifyName || item._data?.notifyName || item.sender?.pushName || '',
    text,
    direction: fromMe ? 'out' : 'in',
    timestamp: normalizeTimestamp(item.timestamp || root?.timestamp),
    raw: root
  };
}

function normalizeWebhookPhone(item, chatId) {
  if (phoneByChatAlias.has(chatId)) return phoneByChatAlias.get(chatId);
  const candidates = [
    item.phone,
    item.fromNumber,
    item.toNumber,
    item.sender?.id,
    item.sender?.phone,
    item.contact?.id,
    item.contact?.phone,
    item._data?.from,
    item._data?.to,
    chatId
  ];
  for (const candidate of candidates) {
    const digits = normalizePhone(candidate);
    if (digits) return digits;
  }
  return String(chatId || '').replace(/@.+$/, '');
}

function saveMessage(message) {
  if (message.phone && message.chatId) rememberChatAlias(message.phone, message.chatId);
  const id = String(message.id || '');
  if (id && messageStore.some((item) => item.id === id && item.chatId === message.chatId)) return;
  messageStore.push(message);
  if (messageStore.length > 2000) messageStore.splice(0, messageStore.length - 2000);
}

function rememberChatAlias(phone, chatId) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedPhone || !normalizedChatId || !normalizedChatId.includes('@')) return;
  chatAliasByPhone.set(normalizedPhone, normalizedChatId);
  phoneByChatAlias.set(normalizedChatId, normalizedPhone);
  trimMap(chatAliasByPhone, 1000);
  trimMap(phoneByChatAlias, 1000);
}

function getActualWahaChatId(result, fallbackChatId) {
  const candidates = [
    result?.id?.remote,
    result?.id?._serialized?.split('_')?.[1],
    result?.message?.id?.remote,
    result?.message?.id?._serialized?.split('_')?.[1],
    result?._data?.id?.remote,
    result?.to,
    result?.chatId,
    fallbackChatId
  ];
  return String(candidates.find((candidate) => String(candidate || '').includes('@')) || fallbackChatId || '').trim();
}

function hydrateChatAliasesFromMessages() {
  for (const message of messageStore) {
    if (!message.phone) continue;
    const actualChatId = getActualWahaChatId(message.raw, message.chatId);
    rememberChatAlias(message.phone, actualChatId);
  }
}

function saveWebhookPayload(payload, saved) {
  webhookStore.push({
    saved,
    event: payload?.event || payload?.eventName || '',
    session: payload?.session || '',
    receivedAt: new Date().toISOString(),
    summary: summarizeWebhookPayload(payload),
    payload
  });
  if (webhookStore.length > 200) webhookStore.splice(0, webhookStore.length - 200);
}

async function handleBotWebhook(payload) {
  if (!config.botEnabled) return;
  const message = getWebhookMessage(payload);
  if (!message || message.direction !== 'in' || !message.chatId || !message.text) return;
  if (message.chatId.includes('@g.us') || message.chatId.includes('status@broadcast')) return;
  if (botProcessedMessageIds.has(message.id)) return;
  botProcessedMessageIds.add(message.id);
  trimSet(botProcessedMessageIds, 500);

  const now = Date.now();
  const lastReplyAt = botLastReplyByChat.get(message.chatId) || 0;
  if (now - lastReplyAt < config.botCooldownMs) return;

  const reply = await buildBotReply(message.text);
  if (!reply) return;
  botLastReplyByChat.set(message.chatId, now);
  await wait(config.botReplyDelayMs);
  await ensureWahaReady(message.session || config.wahaSession);
  const result = await waha.sendText({ chatId: message.chatId, text: reply, session: message.session || config.wahaSession });
  saveMessage({
    id: result?.id || result?.message?.id || `bot:${Date.now()}:${Math.random()}`,
    session: message.session || config.wahaSession,
    chatId: message.chatId,
    phone: message.phone,
    text: reply,
    direction: 'out',
    timestamp: new Date().toISOString(),
    raw: result
  });
}

function getWebhookMessage(payload) {
  const candidates = [
    payload?.payload,
    payload?.data,
    payload?.message,
    payload
  ].filter(Boolean);
  for (const item of candidates) {
    const message = normalizeWebhookMessage(payload, item);
    if (message) return message;
  }
  return null;
}

async function buildBotReply(text) {
  const language = detectClientLanguage(text);
  if (isGreetingOnly(text)) return getBotPrompt(language);
  if (!hasProductIntent(text)) return null;
  const query = extractProductQuery(text);
  if (!query) return getBotPrompt(language);

  const products = await searchBotProducts(query);
  if (!products.length) return getBotNoResults(language, query);
  return formatBotProducts(language, query, products);
}

async function searchBotProducts(query) {
  if (!config.botApiUrl || !config.botApiKey) return [];
  const url = new URL(config.botApiUrl);
  url.searchParams.set('search', query);
  url.searchParams.set('limit', '5');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Bot-Key': config.botApiKey
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Bot product API returned HTTP ${response.status}.`);
  return Array.isArray(data.products) ? data.products : [];
}

function isGreetingOnly(text) {
  const source = String(text || '').toLowerCase().trim();
  return /^(здравствуйте|здраствуйте|добрый день|добрый вечер|привет|салам|саламатсызбы|алло|hello|hi)[!.?\s]*$/i.test(source);
}

function hasProductIntent(text) {
  const source = String(text || '').toLowerCase();
  if (/\b(хочу|купить|куплю|нужен|нужна|нужно|ищу|есть|барбы|керек|алсам|баасы|канча|цена|стоит)\b/i.test(source)) return true;
  return /(холодильник|муздаткыч|телевизор|стирал|кир жуучу|пылесос|чаң соргуч|морозильник|кондиционер|духов|вароч|микровол|плита|чайник|lg|samsung|bosch|artel|beko|haier)/i.test(source);
}

function detectClientLanguage(text) {
  const source = String(text || '').toLowerCase();
  if (/[ңүөғқһі]/i.test(source)) return 'ky';
  if (/\b(салам|барбы|канча|баасы|алсам|керек|муздаткыч|кир жуучу|телевизор)\b/i.test(source)) return 'ky';
  return 'ru';
}

function extractProductQuery(text) {
  let value = String(text || '').toLowerCase();
  value = value
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopWords = [
    'здравствуйте', 'здраствуйте', 'добрый', 'день', 'вечер', 'привет', 'салам', 'саламатсызбы',
    'хочу', 'купить', 'куплю', 'нужен', 'нужна', 'нужно', 'есть', 'у', 'вас', 'можно', 'цена',
    'сколько', 'стоит', 'пожалуйста', 'барбы', 'бар', 'баасы', 'канча', 'алсам', 'керек', 'мага'
  ];
  const words = value.split(' ').filter((word) => word.length > 1 && !stopWords.includes(word));
  const query = words.join(' ').trim();
  return query.length >= 2 ? normalizeProductSynonyms(query) : '';
}

function normalizeProductSynonyms(query) {
  const replacements = [
    [/муздаткыч/g, 'холодильник'],
    [/кир жуучу/g, 'стиральная машина'],
    [/чаң соргуч/g, 'пылесос'],
    [/телевизор/g, 'телевизор'],
    [/холодос/g, 'холодильник'],
    [/микроволновка/g, 'микроволновая печь']
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), query);
}

function getBotPrompt(language) {
  if (language === 'ky') {
    return 'Саламатсызбы! Кайсы товар керек? Мисалы: "LG холодильник" же "Samsung телевизор".';
  }
  return 'Здравствуйте! Напишите, какой товар ищете. Например: "холодильник LG" или "телевизор Samsung".';
}

function getBotNoResults(language, query) {
  if (language === 'ky') {
    return `Азыр "${query}" боюнча так товар табылган жок. Бренд, модель же товар түрүн тактап жазыңызчы.`;
  }
  return `По запросу "${query}" точных товаров не нашел. Напишите бренд, модель или тип товара чуть точнее.`;
}

function formatBotProducts(language, query, products) {
  const lines = products.slice(0, 5).map((product, index) => {
    const price = Number(product.price || product.price36?.value || product.minPrice?.value || 0);
    const stock = Number(product.stock);
    const stockText = Number.isFinite(stock) ? ` · остаток ${formatQuantity(stock)}` : '';
    return `${index + 1}. ${product.name || 'Товар'}${price > 0 ? ` — ${formatMoney(price)} сом` : ''}${stockText}`;
  });
  if (language === 'ky') {
    return [`"${query}" боюнча варианттар:`, ...lines, '', 'Кайсынысы кызык? Номер менен жазыңыз, менеджер тактап берет.'].join('\n');
  }
  return [`По запросу "${query}" есть варианты:`, ...lines, '', 'Какой вариант интересует? Напишите номер, менеджер уточнит наличие и условия.'].join('\n');
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatQuantity(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function trimMap(map, maxSize) {
  while (map.size > maxSize) {
    map.delete(map.keys().next().value);
  }
}

function trimSet(set, maxSize) {
  while (set.size > maxSize) {
    set.delete(set.values().next().value);
  }
}

function summarizeWebhookPayload(payload) {
  const item = payload?.payload || payload?.data || payload?.message || payload || {};
  return {
    from: item.from || item.chatId || item._data?.from || item.id?.remote || item._data?.id?.remote || '',
    to: item.to || item._data?.to || '',
    fromMe: Boolean(item.fromMe || item.id?.fromMe || item._data?.id?.fromMe),
    body: item.body || item.text || item.caption || item._data?.body || '',
    hasMedia: Boolean(item.hasMedia || item.media),
    id: item.id?.id || item._data?.id?.id || item.id || ''
  };
}

function isSameConversation(message, { phone, chatId }) {
  if (!chatId) return true;
  if (message.chatId === chatId) return true;
  if (phone && message.phone === phone) return true;
  if (phone && chatAliasByPhone.get(phone) === message.chatId) return true;
  if (phone && phoneByChatAlias.get(message.chatId) === phone) return true;
  if (phone && normalizePhone(message.chatId) === phone) return true;
  const raw = message.raw?.payload || message.raw?.data || message.raw?.message || message.raw || {};
  const rawIds = [
    raw.from,
    raw.to,
    raw.chatId,
    raw._data?.from,
    raw._data?.to,
    raw.id?.remote,
    raw._data?.id?.remote
  ];
  return rawIds.some((value) => phone && normalizePhone(value) === phone);
}


function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  const number = Number(value);
  if (Number.isFinite(number)) {
    return new Date(number < 10000000000 ? number * 1000 : number).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function ensureWahaReady(session) {
  const current = await waha.getSessionStatus(session);
  let state = getWahaSessionState(current);
  if (isWahaConnected(state)) return current;

  if (['FAILED', 'STOPPED'].includes(state)) {
    await waha.restartSession(session);
    await wait(2500);
    const restarted = await waha.getSessionStatus(session);
    state = getWahaSessionState(restarted);
    if (isWahaConnected(state)) return restarted;
    throw httpError(409, buildSessionErrorMessage(state), { session, wahaStatus: restarted });
  }

  throw httpError(409, buildSessionErrorMessage(state), { session, wahaStatus: current });
}

function buildSessionErrorMessage(state) {
  const normalized = String(state || 'UNKNOWN').toUpperCase();
  if (normalized === 'SCAN_QR_CODE') {
    return 'WhatsApp не подключен: отсканируйте QR код на странице WAHA.';
  }
  if (normalized === 'STARTING') {
    return 'WhatsApp сессия запускается. Подождите несколько секунд и попробуйте снова.';
  }
  return `WhatsApp сессия не готова (${normalized}). Нажмите "Подключить QR" и подключите телефон.`;
}

function getWahaSessionState(status) {
  return String(status?.status || status?.name || status?.state || status?.engine?.state || '').toUpperCase();
}

function isWahaConnected(state) {
  return ['WORKING', 'CONNECTED', 'READY'].includes(String(state || '').toUpperCase());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireBackendApiKey(req, res, next) {
  if (!config.backendApiKey) {
    next();
    return;
  }
  const token = req.header('X-Api-Key') || '';
  if (token !== config.backendApiKey) {
    res.status(401).json({ error: 'Invalid backend API key.' });
    return;
  }
  next();
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message, details = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, details);
  return error;
}
