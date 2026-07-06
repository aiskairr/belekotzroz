import axios from 'axios';

export class WahaClient {
  constructor({ baseUrl, apiKey, session, timeoutMs = 15000 }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.session = session || 'default';
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {})
      }
    });
  }

  toChatId(phoneOrChatId) {
    const value = String(phoneOrChatId || '').trim();
    if (!value) throw new Error('Recipient phone/chatId is required.');
    if (value.includes('@')) return value;

    const digits = value.replace(/\D/g, '');
    if (!digits) throw new Error('Recipient phone is invalid.');
    return `${digits}@c.us`;
  }

  async sendText({ phone, chatId, text, session }) {
    const cleanText = String(text || '').trim();
    if (!cleanText) throw new Error('Message text is empty.');

    const payload = {
      session: session || this.session,
      chatId: chatId || this.toChatId(phone),
      text: cleanText
    };

    return this.requestWithRetry(() => this.http.post('/api/sendText', payload));
  }

  async sendImage({ phone, chatId, imageUrl, caption = '', session }) {
    if (!String(imageUrl || '').trim()) throw new Error('imageUrl is required.');

    const payload = {
      session: session || this.session,
      chatId: chatId || this.toChatId(phone),
      file: { url: imageUrl },
      caption: String(caption || '')
    };

    return this.requestWithRetry(() => this.http.post('/api/sendImage', payload));
  }

  async getSessionStatus(session) {
    return this.requestWithRetry(() => this.http.get(`/api/sessions/${encodeURIComponent(session || this.session)}`));
  }

  async startSession(session) {
    const name = session || this.session;
    const attempts = [
      () => this.http.post('/api/sessions', { name, start: true, config: {} }),
      () => this.http.post('/api/sessions/start', { name }),
      () => this.http.post(`/api/sessions/${encodeURIComponent(name)}/start`)
    ];

    let lastError;
    for (const attempt of attempts) {
      try {
        const response = await attempt();
        return response.data;
      } catch (error) {
        lastError = error;
        if (isAlreadyStarted(error)) {
          return this.getSessionStatus(name);
        }
        if (isAlreadyExists(error)) continue;
      }
    }
    throw enrichWahaError(lastError);
  }

  async stopSession(session) {
    const name = session || this.session;
    return this.requestWithRetry(() => this.http.post(`/api/sessions/${encodeURIComponent(name)}/stop`), 0);
  }

  async restartSession(session) {
    const name = session || this.session;
    try {
      await this.stopSession(name);
    } catch (error) {
      const message = String(error.message || '').toLowerCase();
      if (!message.includes('not found') && !message.includes('stopped')) throw error;
    }
    await wait(1000);
    return this.startSession(name);
  }

  async getQrCodeDataUrl(session) {
    const name = session || this.session;
    const response = await this.http.get(`/api/${encodeURIComponent(name)}/auth/qr`, {
      responseType: 'arraybuffer',
      headers: { Accept: 'image/png,image/*,*/*' },
      validateStatus: () => true
    });

    if (response.status >= 400) {
      throw enrichWahaError({ response });
    }

    const contentType = response.headers['content-type'] || 'image/png';
    const buffer = Buffer.from(response.data);
    if (contentType.includes('application/json')) {
      const json = JSON.parse(buffer.toString('utf8'));
      const qr = json.qr || json.data || json.image || json.base64;
      if (!qr) throw new Error(json.error || json.message || 'QR code is not available yet.');
      return String(qr).startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
    }
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  async requestWithRetry(fn, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fn();
        return response.data;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const temporary = !status || status === 429 || status >= 500;
        if (!temporary || attempt === retries) break;
        await wait(1000 * (attempt + 1));
      }
    }

    const message = lastError?.response?.data?.message
      || lastError?.response?.data?.error
      || lastError?.message
      || 'WAHA request failed.';
    throw new Error(message);
  }
}

function isAlreadyExists(error) {
  const status = error.response?.status;
  const message = String(error.response?.data?.message || error.response?.data?.error || error.message || '').toLowerCase();
  return status === 409 || message.includes('already exists');
}

function isAlreadyStarted(error) {
  const message = String(error.response?.data?.message || error.response?.data?.error || error.message || '').toLowerCase();
  return message.includes('already started') || message.includes('already running');
}

function enrichWahaError(error) {
  const data = error?.response?.data;
  let parsedData = data;
  if (Buffer.isBuffer(data)) {
    try {
      parsedData = JSON.parse(data.toString('utf8'));
    } catch {
      parsedData = data.toString('utf8');
    }
  }
  const message = parsedData?.message
    || parsedData?.error
    || (typeof parsedData === 'string' ? parsedData : '')
    || error?.message
    || 'WAHA request failed.';
  return new Error(message);
}

export function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 9) digits = `996${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) digits = `996${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return '';
  return digits;
}

export function buildMessage(template, recipient = {}, videoLinks = []) {
  const videos = videoLinks.filter(Boolean).join('\n');
  return String(template || '')
    .replaceAll('{name}', recipient.name || '')
    .replaceAll('{phone}', recipient.phone || '')
    .replaceAll('{videos}', videos)
    .trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
