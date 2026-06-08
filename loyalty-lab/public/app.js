const state = {
  customer: null,
  transactions: [],
  defaultPercent: 3
};

const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  customerForm: document.getElementById('customerForm'),
  findCustomer: document.getElementById('findCustomer'),
  phone: document.getElementById('phone'),
  name: document.getElementById('name'),
  balance: document.getElementById('balance'),
  customerInfo: document.getElementById('customerInfo'),
  accrueForm: document.getElementById('accrueForm'),
  saleAmount: document.getElementById('saleAmount'),
  percent: document.getElementById('percent'),
  bonusPreview: document.getElementById('bonusPreview'),
  redeemForm: document.getElementById('redeemForm'),
  refreshHistory: document.getElementById('refreshHistory'),
  history: document.getElementById('history'),
  toast: document.getElementById('toast')
};

init();

async function init() {
  bindEvents();

  try {
    const health = await api('/api/health');
    state.defaultPercent = health.defaultPercent || 3;
    els.percent.value = state.defaultPercent;
    els.connectionStatus.textContent = health.supabaseConfigured ? 'Supabase подключен' : 'Нужно заполнить .env';
    els.connectionStatus.classList.toggle('ok', health.supabaseConfigured);
  } catch (error) {
    els.connectionStatus.textContent = 'Ошибка подключения';
    showToast(error.message, true);
  }
}

function bindEvents() {
  els.customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createCustomer();
  });

  els.findCustomer.addEventListener('click', findCustomer);
  els.refreshHistory.addEventListener('click', findCustomer);

  els.saleAmount.addEventListener('input', updateBonusPreview);
  els.percent.addEventListener('input', updateBonusPreview);

  els.accrueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await accrue();
  });

  els.redeemForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await redeem();
  });
}

async function findCustomer() {
  const phone = els.phone.value.trim();
  if (!phone) {
    showToast('Введите телефон клиента', true);
    return;
  }

  try {
    const data = await api(`/api/customers?phone=${encodeURIComponent(phone)}`);
    state.customer = data.customer;
    state.transactions = data.transactions || [];

    if (!state.customer) {
      renderCustomer();
      showToast('Клиент не найден. Можно создать нового.', true);
      return;
    }

    els.name.value = state.customer.name || '';
    renderCustomer();
    showToast('Клиент найден');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function createCustomer() {
  try {
    const data = await api('/api/customers', {
      method: 'POST',
      body: {
        phone: els.phone.value,
        name: els.name.value
      }
    });

    state.customer = data.customer;
    state.transactions = [];
    renderCustomer();
    showToast('Клиент создан');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function accrue() {
  try {
    const data = await api('/api/transactions/accrue', {
      method: 'POST',
      body: {
        phone: els.phone.value,
        name: els.name.value,
        saleAmount: Number(els.saleAmount.value || 0),
        percent: Number(els.percent.value || state.defaultPercent),
        saleId: document.getElementById('saleIdAccrue').value,
        comment: 'Начисление за покупку'
      }
    });

    state.customer = data.customer;
    state.transactions = data.transactions || [];
    renderCustomer();
    els.saleAmount.value = '';
    updateBonusPreview();
    showToast('Бонусы начислены');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function redeem() {
  try {
    const data = await api('/api/transactions/redeem', {
      method: 'POST',
      body: {
        phone: els.phone.value,
        amount: Number(document.getElementById('redeemAmount').value || 0),
        saleId: document.getElementById('saleIdRedeem').value,
        comment: document.getElementById('commentRedeem').value
      }
    });

    state.customer = data.customer;
    state.transactions = data.transactions || [];
    renderCustomer();
    document.getElementById('redeemAmount').value = '';
    showToast('Бонусы списаны');
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderCustomer() {
  if (!state.customer) {
    els.balance.textContent = '0';
    els.customerInfo.textContent = 'Клиент не выбран';
    renderHistory([]);
    return;
  }

  els.balance.textContent = formatNumber(state.customer.bonus_balance);
  els.customerInfo.textContent = `${state.customer.name || 'Без имени'} | ${state.customer.phone}`;
  renderHistory(state.transactions);
}

function renderHistory(transactions) {
  if (!transactions.length) {
    els.history.innerHTML = '<tr><td colspan="6">Истории пока нет</td></tr>';
    return;
  }

  els.history.innerHTML = transactions.map((item) => `
    <tr>
      <td>${formatDate(item.created_at)}</td>
      <td>${item.type === 'accrual' ? 'Начисление' : 'Списание'}</td>
      <td class="${item.type === 'accrual' ? 'plus' : 'minus'}">${item.type === 'accrual' ? '+' : '-'}${formatNumber(item.amount)}</td>
      <td>${formatNumber(item.balance_after)}</td>
      <td>${escapeHtml(item.sale_id || '')}</td>
      <td>${escapeHtml(item.comment || '')}</td>
    </tr>
  `).join('');
}

function updateBonusPreview() {
  const saleAmount = Number(els.saleAmount.value || 0);
  const percent = Number(els.percent.value || 0);
  els.bonusPreview.textContent = formatNumber(Math.floor(saleAmount * percent / 100));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }

  return data;
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.toggle('error', isError);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3500);
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
