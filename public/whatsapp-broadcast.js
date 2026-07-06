import { initCrmShell } from './crm-shell.js';

const ids = [
  'whatsappApp', 'refreshButton', 'filtersForm', 'searchInput', 'customerTypeFilter', 'customersStatus',
  'customersList', 'manualContactForm', 'manualPhoneInput', 'manualNameInput', 'checkWahaButton',
  'connectWahaButton', 'wahaBackendUrl', 'wahaBackendKey', 'wahaStatus', 'connectionDot', 'connectionTitle',
  'wahaQrBox', 'wahaQrImage', 'wahaQrHint', 'chatAvatar', 'chatName', 'chatPhone', 'chatMessages',
  'chatForm', 'chatMessageInput', 'sendMessageButton', 'bulkForm', 'bulkPhonesInput', 'bulkMessageInput',
  'bulkVideosInput', 'bulkDryRunInput', 'bulkStartButton', 'bulkCounter', 'bulkStatus'
];
const els = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));

const WAHA_SETTINGS_KEY = 'ordoWahaBackendSettings';
const WAHA_CHAT_HISTORY_KEY = 'ordoWahaChatHistory';
let customers = [];
let incomingChats = [];
let activeContact = null;
let searchTimer = null;
let wahaSessionPollTimer = null;
let chatPollTimer = null;
let bulkJobPollTimer = null;
let history = JSON.parse(localStorage.getItem(WAHA_CHAT_HISTORY_KEY) || '{}');

init();

async function init() {
  const user = await initCrmShell({ page: 'whatsappBroadcast', allowedRoles: ['admin', 'owner', 'manager'] });
  if (!user) return;
  els.whatsappApp.classList.remove('hidden');
  loadWahaSettings();
  bindEvents();
  renderChat();
  await loadCustomers();
  checkWaha();
  startChatPolling();
}

function bindEvents() {
  els.refreshButton.addEventListener('click', loadCustomers);
  els.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadCustomers();
  });
  els.searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadCustomers, 250);
  });
  els.customerTypeFilter.addEventListener('change', loadCustomers);
  els.customersList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-customer-id]');
    if (!item) return;
    const customer = getVisibleContacts().find((entry) => entry.id === item.dataset.customerId);
    if (customer) selectContact(customer);
  });
  els.manualContactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const phone = els.manualPhoneInput.value.trim();
    if (!phone) {
      els.manualPhoneInput.focus();
      setWahaStatus('Введите номер.', 'error');
      return;
    }
    selectContact({
      id: `manual:${phone.replace(/\D/g, '') || phone}`,
      name: els.manualNameInput.value.trim() || phone,
      phone,
      whatsappPhone: phone.replace(/\D/g, ''),
      customerTypeLabel: 'Номер'
    });
  });
  els.checkWahaButton.addEventListener('click', checkWaha);
  els.connectWahaButton.addEventListener('click', connectWaha);
  els.chatForm.addEventListener('submit', sendChatMessage);
  els.bulkForm.addEventListener('submit', startBulkSend);
  els.bulkPhonesInput.addEventListener('input', updateBulkCounter);
  [els.wahaBackendUrl, els.wahaBackendKey].forEach((element) => {
    element.addEventListener('change', persistWahaSettings);
    element.addEventListener('input', persistWahaSettings);
  });
  updateBulkCounter();
}

function loadWahaSettings() {
  const saved = JSON.parse(localStorage.getItem(WAHA_SETTINGS_KEY) || '{}');
  els.wahaBackendUrl.value = saved.url || 'http://127.0.0.1:3300';
  els.wahaBackendKey.value = saved.apiKey || 'change-me';
}

function persistWahaSettings() {
  localStorage.setItem(WAHA_SETTINGS_KEY, JSON.stringify(getWahaSettings()));
}

function getWahaSettings() {
  return {
    url: (els.wahaBackendUrl.value || 'http://127.0.0.1:3300').trim().replace(/\/+$/, ''),
    apiKey: (els.wahaBackendKey.value || '').trim()
  };
}

async function loadCustomers() {
  els.customersStatus.textContent = 'Загружаю...';
  const params = new URLSearchParams({ limit: '500' });
  if (els.searchInput.value.trim()) params.set('search', els.searchInput.value.trim());
  if (els.customerTypeFilter.value) params.set('customerType', els.customerTypeFilter.value);
  try {
    const data = await api(`/api/whatsapp/customers?${params}`);
    customers = Array.isArray(data.customers) ? data.customers : [];
    await loadIncomingChats();
    renderCustomers();
    els.customersStatus.textContent = `${formatNumber(getVisibleContacts().length)} чатов`;
  } catch (error) {
    customers = [];
    incomingChats = [];
    renderCustomers();
    els.customersStatus.textContent = error.message;
  }
}

async function loadIncomingChats() {
  try {
    const data = await callWaha('/api/messages?limit=200');
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const byChat = new Map();
    for (const message of messages) {
      if (!message.chatId) continue;
      byChat.set(message.chatId, message);
    }
    const customerPhones = new Set(customers.map((customer) => normalizeDigits(customer.whatsappPhone || customer.phone)).filter(Boolean));
    incomingChats = [...byChat.values()]
      .filter((message) => {
        const phone = normalizeDigits(message.phone || message.chatId);
        return !phone || !customerPhones.has(phone);
      })
      .map((message) => ({
        id: `chat:${message.chatId}`,
        name: message.name || message.phone || message.chatId,
        phone: message.phone || message.chatId,
        whatsappPhone: message.phone || '',
        chatId: message.chatId,
        customerTypeLabel: 'Входящее',
        lastMessage: message.text || ''
      }))
      .reverse();
  } catch {
    incomingChats = [];
  }
}

function getVisibleContacts() {
  return [...incomingChats, ...customers];
}

function renderCustomers() {
  const contacts = getVisibleContacts();
  els.customersList.innerHTML = contacts.map((customer) => {
    const active = activeContact?.id === customer.id;
    return `<button class="wa-customer ${active ? 'active' : ''}" type="button" data-customer-id="${escapeAttr(customer.id)}">
      <span class="wa-customer-avatar">${escapeHtml(getInitials(customer.name))}</span>
      <span class="wa-customer-main">
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.phone || customer.chatId || '')}${customer.inn ? ` · ИНН ${escapeHtml(customer.inn)}` : ''}</span>
        ${customer.lastMessage ? `<em>${escapeHtml(customer.lastMessage)}</em>` : ''}
      </span>
      <b>${escapeHtml(customer.customerTypeLabel || 'Клиент')}</b>
    </button>`;
  }).join('') || '<div class="empty">Контакты с номерами не найдены.</div>';
}

function selectContact(contact) {
  const aliasChat = findIncomingAliasForContact(contact);
  activeContact = {
    id: contact.id,
    name: contact.name || contact.phone || contact.chatId || 'Клиент',
    phone: contact.phone || contact.whatsappPhone || '',
    whatsappPhone: contact.whatsappPhone || contact.phone || '',
    chatId: contact.chatId || aliasChat?.chatId || ''
  };
  els.manualPhoneInput.value = activeContact.phone;
  els.manualNameInput.value = activeContact.name;
  renderCustomers();
  renderChat({ forceScroll: true });
  refreshActiveChatMessages();
  els.chatMessageInput.focus();
}

function findIncomingAliasForContact(contact) {
  const phone = normalizeDigits(contact.whatsappPhone || contact.phone);
  if (!phone) return null;
  return incomingChats.find((chat) => normalizeDigits(chat.phone) === phone) || null;
}

function renderChat(options = {}) {
  const hasContact = Boolean(activeContact);
  els.chatMessageInput.disabled = !hasContact;
  els.sendMessageButton.disabled = !hasContact;

  if (!hasContact) {
    els.chatAvatar.textContent = '?';
    els.chatName.textContent = 'Выберите контакт';
    els.chatPhone.textContent = 'Номер не выбран';
    els.chatMessages.innerHTML = '<div class="wa-empty-chat">Выберите клиента слева или введите номер вручную.</div>';
    return;
  }

  els.chatAvatar.textContent = getInitials(activeContact.name);
  els.chatName.textContent = activeContact.name;
  els.chatPhone.textContent = activeContact.phone || activeContact.chatId;
  const messages = getMessages(activeContact.id);
  const previousScrollTop = els.chatMessages.scrollTop;
  const shouldStickToBottom = Boolean(options.forceScroll) || isChatNearBottom();
  els.chatMessages.innerHTML = messages.map((message) => `
    <article class="wa-message ${message.direction}">
      <div>${escapeHtml(message.text)}</div>
      <time>${escapeHtml(formatTime(message.createdAt))}${message.status ? ` · ${escapeHtml(message.status)}` : ''}</time>
    </article>
  `).join('') || '<div class="wa-empty-chat">Сообщений пока нет.</div>';
  if (shouldStickToBottom) {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  } else {
    els.chatMessages.scrollTop = previousScrollTop;
  }
}

function isChatNearBottom() {
  const distance = els.chatMessages.scrollHeight - els.chatMessages.scrollTop - els.chatMessages.clientHeight;
  return distance < 80;
}

async function sendChatMessage(event) {
  event.preventDefault();
  if (!activeContact) return;
  const text = els.chatMessageInput.value.trim();
  if (!text) return;

  const draft = addMessage(activeContact.id, {
    direction: 'out',
    text,
    status: 'отправляю',
    createdAt: new Date().toISOString()
  });
  els.chatMessageInput.value = '';
  renderChat({ forceScroll: true });
  els.sendMessageButton.disabled = true;

  try {
    const payload = activeContact.chatId
      ? { chatId: activeContact.chatId, text }
      : { phone: activeContact.whatsappPhone || activeContact.phone, text };
    await callWaha('/api/send-text', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    draft.status = 'отправлено';
    setWahaStatus(`Сообщение отправлено на ${activeContact.phone || activeContact.chatId}.`, 'ok');
    await refreshActiveChatMessages();
  } catch (error) {
    draft.status = 'ошибка';
    setWahaStatus(error.message, 'error');
    if (shouldReconnectWaha(error.message)) {
      await connectWaha();
    } else {
      window.alert(`WAHA: ${error.message}`);
    }
  } finally {
    persistHistory();
    renderChat({ forceScroll: true });
    els.sendMessageButton.disabled = false;
  }
}

async function startBulkSend(event) {
  event.preventDefault();
  const recipients = parseBulkRecipients(els.bulkPhonesInput.value);
  const textTemplate = els.bulkMessageInput.value.trim();
  const videoLinks = els.bulkVideosInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (!recipients.length) {
    setBulkStatus('Добавьте хотя бы один номер.', 'error');
    els.bulkPhonesInput.focus();
    return;
  }
  if (!textTemplate) {
    setBulkStatus('Напишите текст сообщения.', 'error');
    els.bulkMessageInput.focus();
    return;
  }

  els.bulkStartButton.disabled = true;
  setBulkStatus(`Создаю очередь на ${formatNumber(recipients.length)} номеров...`, 'pending');
  try {
    const data = await callWaha('/api/send-batch', {
      method: 'POST',
      body: JSON.stringify({
        recipients,
        textTemplate,
        videoLinks,
        dryRun: els.bulkDryRunInput.checked
      })
    });
    const job = data.job;
    setBulkStatus(formatBulkJob(job), job?.dryRun ? 'pending' : 'ok');
    pollBulkJob(job.id);
  } catch (error) {
    setBulkStatus(error.message, 'error');
    window.alert(`WAHA рассылка: ${error.message}`);
    els.bulkStartButton.disabled = false;
  }
}

function pollBulkJob(jobId) {
  window.clearTimeout(bulkJobPollTimer);
  bulkJobPollTimer = window.setTimeout(async () => {
    try {
      const data = await callWaha(`/api/jobs/${encodeURIComponent(jobId)}`);
      const job = data.job;
      setBulkStatus(formatBulkJob(job), job.failed ? 'error' : 'pending');
      if (['queued', 'running'].includes(job.status)) {
        pollBulkJob(jobId);
        return;
      }
      els.bulkStartButton.disabled = false;
    } catch (error) {
      setBulkStatus(error.message, 'error');
      els.bulkStartButton.disabled = false;
    }
  }, 2500);
}

function parseBulkRecipients(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[\n,;]+/)
    .map((rawPhone) => {
      const phone = normalizeDigits(rawPhone);
      return { phone, rawPhone: rawPhone.trim() };
    })
    .filter((recipient) => {
      if (!recipient.phone || recipient.phone.length < 10 || recipient.phone.length > 15 || seen.has(recipient.phone)) return false;
      seen.add(recipient.phone);
      return true;
    });
}

function updateBulkCounter() {
  const count = parseBulkRecipients(els.bulkPhonesInput.value).length;
  els.bulkCounter.textContent = `${formatNumber(count)} ${plural(count, 'номер', 'номера', 'номеров')}`;
}

function setBulkStatus(message, tone = 'default') {
  els.bulkStatus.textContent = message;
  els.bulkStatus.dataset.tone = tone;
}

function formatBulkJob(job) {
  if (!job) return 'Очередь создана.';
  const status = {
    queued: 'в очереди',
    running: 'идет отправка',
    completed: 'завершено',
    completed_with_errors: 'завершено с ошибками',
    failed: 'ошибка'
  }[job.status] || job.status;
  return `Рассылка: ${status}. Отправлено ${formatNumber(job.sent)} из ${formatNumber(job.total)}, ошибок ${formatNumber(job.failed)}.`;
}

function startChatPolling() {
  window.clearInterval(chatPollTimer);
  chatPollTimer = window.setInterval(async () => {
    await loadIncomingChats();
    renderCustomers();
    await refreshActiveChatMessages();
  }, 3000);
}

async function refreshActiveChatMessages() {
  if (!activeContact) return;
  try {
    const phone = activeContact.whatsappPhone || activeContact.phone;
    const query = activeContact.chatId
      ? `chatId=${encodeURIComponent(activeContact.chatId)}`
      : `phone=${encodeURIComponent(phone)}`;
    const data = await callWaha(`/api/messages?${query}&limit=120`);
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (!messages.length) return;
    history[activeContact.id] = messages.map((message) => ({
      direction: message.direction === 'in' ? 'in' : 'out',
      text: message.text || '',
      status: message.direction === 'in' ? '' : 'отправлено',
      createdAt: message.timestamp || new Date().toISOString()
    }));
    persistHistory();
    renderChat();
  } catch {
    // Polling should not interrupt typing or sending.
  }
}

async function checkWaha() {
  setWahaStatus('Проверяю WAHA...', 'pending');
  els.checkWahaButton.disabled = true;
  try {
    const health = await callWaha('/health', { requireAuth: false });
    const session = await callWaha('/api/waha/session');
    const status = getWahaSessionStatus(session.status);
    const connected = isWahaConnected(status);
    setConnection(connected ? 'connected' : 'pending', connected ? `Подключен: ${session.status?.me?.pushName || 'WhatsApp'}` : `Сессия: ${status || 'unknown'}`);
    setWahaStatus(`Backend OK · ${health.defaultSession || 'default'} · ${status || 'unknown'}`, connected ? 'ok' : 'pending');
  } catch (error) {
    setConnection('error', 'WAHA недоступен');
    setWahaStatus(error.message, 'error');
  } finally {
    els.checkWahaButton.disabled = false;
  }
}

async function connectWaha() {
  persistWahaSettings();
  setWahaStatus('Запускаю WhatsApp сессию...', 'pending');
  els.connectWahaButton.disabled = true;
  const previousText = els.connectWahaButton.textContent;
  els.connectWahaButton.textContent = 'Открываю QR...';
  try {
    await callWaha('/api/waha/session/start', {
      method: 'POST',
      body: JSON.stringify({})
    });
    await refreshWahaQrWithRestart();
    pollWahaSession();
  } catch (error) {
    setConnection('error', 'QR недоступен');
    setWahaStatus(error.message, 'error');
    window.alert(`WAHA QR: ${error.message}`);
  } finally {
    els.connectWahaButton.disabled = false;
    els.connectWahaButton.textContent = previousText;
  }
}

async function refreshWahaQrWithRestart() {
  try {
    await refreshWahaQr();
  } catch (error) {
    const message = String(error.message || '');
    if (!message.includes('Session status is not as expected') && !message.includes('restart the session')) {
      throw error;
    }
    setWahaStatus('Сессия зависла. Перезапускаю...', 'pending');
    await callWaha('/api/waha/session/restart', {
      method: 'POST',
      body: JSON.stringify({})
    });
    await wait(2500);
    await refreshWahaQr();
  }
}

async function refreshWahaQr() {
  setConnection('pending', 'Ожидает сканирования');
  setWahaStatus('Получаю QR код...', 'pending');
  const data = await callWaha(`/api/waha/session/qr?t=${Date.now()}`);
  if (!data.qr) throw new Error('WAHA не вернула QR код.');
  els.wahaQrImage.src = data.qr;
  els.wahaQrBox.classList.remove('hidden');
  els.wahaQrHint.textContent = 'Откройте WhatsApp на телефоне: Настройки -> Связанные устройства -> Привязка устройства.';
  setWahaStatus('QR готов. Отсканируйте его телефоном.', 'pending');
  els.wahaQrBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function pollWahaSession() {
  window.clearTimeout(wahaSessionPollTimer);
  wahaSessionPollTimer = window.setTimeout(async () => {
    try {
      const data = await callWaha('/api/waha/session');
      const status = getWahaSessionStatus(data.status);
      if (isWahaConnected(status)) {
        els.wahaQrBox.classList.add('hidden');
        setConnection('connected', `Подключен: ${data.status?.me?.pushName || 'WhatsApp'}`);
        setWahaStatus(`Телефон подключен · ${status}`, 'ok');
        return;
      }
      if (needsQrRefresh(status)) await refreshWahaQrWithRestart();
      else setWahaStatus(`Жду подключение · ${status || 'unknown'}`, 'pending');
      pollWahaSession();
    } catch (error) {
      setConnection('error', 'Ошибка подключения');
      setWahaStatus(error.message, 'error');
    }
  }, 3000);
}

function getMessages(contactId) {
  return Array.isArray(history[contactId]) ? history[contactId] : [];
}

function addMessage(contactId, message) {
  if (!Array.isArray(history[contactId])) history[contactId] = [];
  history[contactId].push(message);
  persistHistory();
  return message;
}

function persistHistory() {
  localStorage.setItem(WAHA_CHAT_HISTORY_KEY, JSON.stringify(history));
}

async function callWaha(path, options = {}) {
  const settings = getWahaSettings();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.requireAuth !== false && settings.apiKey) headers['X-Api-Key'] = settings.apiKey;

  const response = await fetch(`${settings.url}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `WAHA backend вернул HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function setConnection(tone, title) {
  els.connectionDot.dataset.tone = tone;
  els.connectionTitle.textContent = title;
}

function setWahaStatus(message, tone = 'default') {
  els.wahaStatus.textContent = message;
  els.wahaStatus.dataset.tone = tone;
}

function getWahaSessionStatus(status) {
  return status?.status || status?.name || status?.state || status?.engine?.state || '';
}

function isWahaConnected(status) {
  return ['WORKING', 'CONNECTED', 'READY'].includes(String(status || '').toUpperCase());
}

function needsQrRefresh(status) {
  return ['SCAN_QR_CODE', 'STARTING', 'STOPPED', 'FAILED'].includes(String(status || '').toUpperCase());
}

function shouldReconnectWaha(message) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('whatsapp не подключен')
    || normalized.includes('подключить qr')
    || normalized.includes('session status is not as expected')
    || normalized.includes('restart the session');
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить данные.');
  return data;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getInitials(name) {
  const words = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0] || '').join('').toUpperCase() || '?';
}

function formatTime(value) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function normalizeDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 9) return `996${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `996${digits.slice(1)}`;
  return digits;
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
