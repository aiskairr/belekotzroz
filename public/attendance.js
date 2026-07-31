import { initCrmShell } from '/crm-shell.js';

const app = document.querySelector('#attendanceApp');
const attendanceHeroEyebrow = document.querySelector('#attendanceHeroEyebrow');
const attendanceHeroTitle = document.querySelector('#attendanceHeroTitle');
const attendanceHeroText = document.querySelector('#attendanceHeroText');
const workStatus = document.querySelector('#workStatus');
const workTimer = document.querySelector('#workTimer');
const qrTokenInput = document.querySelector('#qrTokenInput');
const scanCard = document.querySelector('.scan-card');
const scanButton = document.querySelector('#scanButton');
const startCameraButton = document.querySelector('#startCameraButton');
const qrVideo = document.querySelector('#qrVideo');
const scanStatus = document.querySelector('#scanStatus');
const managerPanel = document.querySelector('#managerPanel');
const adminPanel = document.querySelector('#adminPanel');
const filtersForm = document.querySelector('#filtersForm');
const dateFrom = document.querySelector('#dateFrom');
const dateTo = document.querySelector('#dateTo');
const userFilter = document.querySelector('#userFilter');
const storeFilter = document.querySelector('#storeFilter');
const recordsList = document.querySelector('#recordsList');
const storesList = document.querySelector('#storesList');
const storeForm = document.querySelector('#storeForm');
const exportButton = document.querySelector('#exportButton');
const useCurrentLocationButton = document.querySelector('#useCurrentLocationButton');
const storeModal = document.querySelector('#storeModal');
const storeModalTitle = document.querySelector('#storeModalTitle');
const openStoreModalButton = document.querySelector('#openStoreModalButton');
const closeStoreModalButton = document.querySelector('#closeStoreModalButton');
const adminOpenShiftForm = document.querySelector('#adminOpenShiftForm');
const adminOpenUser = document.querySelector('#adminOpenUser');
const adminOpenStore = document.querySelector('#adminOpenStore');

let currentUser = null;
let statusData = null;
let reportData = null;
let timerId = 0;
let cameraStream = null;
let scannerTimer = 0;
let scanInProgress = false;

const params = new URLSearchParams(window.location.search);
if (params.get('token')) qrTokenInput.value = params.get('token');
const nextPage = getSafeNextPage(params.get('next') || '');
const closeShiftMode = params.get('close') === '1';

const today = new Date().toISOString().slice(0, 10);
dateFrom.value = today;
dateTo.value = today;

currentUser = await initCrmShell({ page: 'attendance', allowedRoles: ['admin', 'owner', 'manager', 'seller', 'logistics', 'accountant', 'employee'] });
if (currentUser) {
  app.classList.remove('hidden');
  renderHero();
  adminPanel.classList.toggle('hidden', !['admin', 'owner'].includes(currentUser.role));
  scanCard.classList.toggle('hidden', !shouldShowScanCard());
  bindEvents();
  await refreshAll();
  if (params.get('token') && shouldShowGateMode()) {
    await scanAttendance();
  }
}

function bindEvents() {
  scanButton.addEventListener('click', scanAttendance);
  startCameraButton.addEventListener('click', startQrCamera);
  filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadReport();
  });
  storeForm.addEventListener('submit', saveStore);
  useCurrentLocationButton.addEventListener('click', fillStoreLocationFromDevice);
  openStoreModalButton?.addEventListener('click', () => openStoreModal());
  closeStoreModalButton?.addEventListener('click', closeStoreModal);
  storeModal?.addEventListener('click', (event) => {
    if (event.target === storeModal) closeStoreModal();
  });
  adminOpenShiftForm?.addEventListener('submit', adminOpenShift);
  exportButton.addEventListener('click', exportCsv);
}

function renderHero() {
  if (['admin', 'owner', 'manager'].includes(currentUser?.role) && !closeShiftMode) {
    attendanceHeroEyebrow.textContent = 'Контроль смен';
    attendanceHeroTitle.textContent = 'Посещаемость сотрудников';
    attendanceHeroText.textContent = 'Отчеты, рабочие точки и QR-коды для отметки прихода и ухода.';
    return;
  }
  attendanceHeroEyebrow.textContent = 'QR отметка';
  attendanceHeroTitle.textContent = 'Приход и уход';
  attendanceHeroText.textContent = 'Сканируйте QR рабочей точки и разрешите геолокацию. Радиус проверки задается для каждой точки.';
}

async function refreshAll() {
  await loadStatus();
  if (shouldLeaveEmployeeAttendancePage()) {
    window.location.replace(nextPage || getDefaultWorkPage(currentUser));
    return;
  }
  applyGateMode();
  if (!shouldShowGateMode()) await loadReport();
}

async function loadStatus() {
  try {
    const data = await api('/api/attendance/status');
    statusData = data;
    renderStatus();
  } catch (error) {
    workStatus.textContent = error.message;
  }
}

function renderStatus() {
  const working = statusData?.status === 'working';
  workStatus.textContent = working ? 'На работе' : 'Не на работе';
  window.clearInterval(timerId);
  const renderTimer = () => {
    if (!working || !statusData.openRecord?.checkInTime) {
      workTimer.textContent = '00:00';
      return;
    }
    const diff = Math.max(0, Date.now() - new Date(statusData.openRecord.checkInTime).getTime());
    workTimer.textContent = formatDuration(Math.floor(diff / 60000));
  };
  renderTimer();
  timerId = window.setInterval(renderTimer, 15000);
}

async function scanAttendance() {
  if (scanInProgress) return;
  const token = qrTokenInput.value.trim();
  if (!token) {
    setScanStatus('Наведите камеру на QR-код рабочей точки.', true);
    return;
  }
  scanInProgress = true;
  scanButton.disabled = true;
  setScanStatus('Запрашиваю геолокацию...', false);
  try {
    const position = await getCurrentPosition();
    setScanStatus('Проверяю расстояние...', false);
    const data = await api('/api/attendance/scan', {
      method: 'POST',
      body: {
        qrToken: token,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        deviceInfo: navigator.userAgent
      }
    });
    setScanStatus(`${data.message} Расстояние: ${formatMeters(data.distanceMeters)}.`, false);
    stopQrCamera();
    await refreshAll();
    if ((data.action === 'check_in' || data.action === 'check_out') && nextPage) {
      window.setTimeout(() => {
        window.location.replace(nextPage);
      }, 900);
    }
  } catch (error) {
    setScanStatus(error.message || 'Не удалось отметиться.', true);
  } finally {
    scanButton.disabled = false;
    scanInProgress = false;
  }
}

function applyGateMode() {
  const gateMode = shouldShowGateMode();
  document.body.classList.toggle('attendance-gate-mode', gateMode);
  managerPanel.classList.toggle('hidden', gateMode);
  scanCard.classList.toggle('hidden', !shouldShowScanCard());
  qrTokenInput.closest('label')?.classList.toggle('token-fallback', gateMode);
  scanButton.textContent = gateMode ? 'Проверить QR' : 'Отметить вручную';
  startCameraButton.classList.toggle('hidden', !gateMode);
  if (gateMode && !cameraStream && !qrTokenInput.value.trim()) {
    startQrCamera();
  }
}

function shouldShowGateMode() {
  return isAttendanceRequiredForUser(currentUser) && (statusData?.status !== 'working' || closeShiftMode);
}

function shouldShowScanCard() {
  if (closeShiftMode) return true;
  if (['admin', 'owner', 'manager'].includes(currentUser?.role)) return false;
  return isAttendanceRequiredForUser(currentUser) && statusData?.status !== 'working';
}

function isAttendanceRequiredForUser(user) {
  return ['manager', 'seller', 'logistics', 'accountant', 'employee'].includes(user?.role);
}

function shouldLeaveEmployeeAttendancePage() {
  return isAttendanceRequiredForUser(currentUser)
    && !['admin', 'owner', 'manager'].includes(currentUser?.role)
    && statusData?.status === 'working'
    && !closeShiftMode;
}

function getDefaultWorkPage(user) {
  if (user?.role === 'accountant') return '/report.html';
  if (user?.role === 'logistics') return '/deliveries.html';
  if (user?.role === 'employee') return '/about.html';
  return '/sales.html';
}

async function startQrCamera() {
  if (!shouldShowGateMode()) return;
  if (!('BarcodeDetector' in window)) {
    setScanStatus('Этот браузер не поддерживает сканирование QR камерой. Откройте QR-ссылку камерой телефона или вставьте token вручную.', true);
    return;
  }
  try {
    stopQrCamera();
    setScanStatus('Открываю камеру...', false);
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    qrVideo.srcObject = cameraStream;
    await qrVideo.play();
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scannerTimer = window.setInterval(async () => {
      if (scanInProgress || qrVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      try {
        const codes = await detector.detect(qrVideo);
        const value = codes[0]?.rawValue || '';
        if (!value) return;
        const token = extractTokenFromQr(value);
        if (!token) {
          setScanStatus('QR найден, но token рабочей точки не распознан.', true);
          return;
        }
        qrTokenInput.value = token;
        setScanStatus('QR найден. Проверяю геолокацию...', false);
        await scanAttendance();
      } catch {
        // Камера продолжает работать, следующая попытка будет на следующем кадре.
      }
    }, 450);
    setScanStatus('Наведите камеру на QR-код на стене.', false);
  } catch {
    setScanStatus('Не удалось открыть камеру. Разрешите доступ к камере в браузере.', true);
  }
}

function stopQrCamera() {
  if (scannerTimer) {
    window.clearInterval(scannerTimer);
    scannerTimer = 0;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (qrVideo) qrVideo.srcObject = null;
}

function extractTokenFromQr(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.searchParams.get('token') || '';
  } catch {
    return raw;
  }
}

function getSafeNextPage(value) {
  const next = String(value || '').trim();
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/attendance.html') ? next : '';
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Для отметки прихода/ухода необходимо разрешить доступ к геолокации.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => {
      reject(new Error('Для отметки прихода/ухода необходимо разрешить доступ к геолокации.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

async function loadReport() {
  const query = new URLSearchParams({
    date_from: dateFrom.value,
    date_to: dateTo.value
  });
  if (userFilter.value) query.set('user_id', userFilter.value);
  if (storeFilter.value) query.set('store_id', storeFilter.value);
  recordsList.innerHTML = '<div class="record-row">Загрузка...</div>';
  const data = await api(`/api/attendance/reports?${query}`);
  reportData = data;
  renderFilters(data);
  renderReport(data);
  renderStores(data.stores || []);
}

function renderFilters(data) {
  const selectedUser = userFilter.value;
  const selectedStore = storeFilter.value;
  userFilter.innerHTML = '<option value="">Все сотрудники</option>' + (data.users || []).map((user) =>
    `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)}</option>`
  ).join('');
  storeFilter.innerHTML = '<option value="">Все точки</option>' + (data.stores || []).map((store) =>
    `<option value="${escapeAttr(store.id)}">${escapeHtml(store.name)}</option>`
  ).join('');
  userFilter.value = selectedUser;
  storeFilter.value = selectedStore;
  if (adminOpenUser) {
    adminOpenUser.innerHTML = '<option value="">Выберите сотрудника</option>' + (data.users || []).map((user) =>
      `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)}</option>`
    ).join('');
  }
  if (adminOpenStore) {
    adminOpenStore.innerHTML = (data.stores || []).map((store) =>
      `<option value="${escapeAttr(store.id)}">${escapeHtml(store.name)}</option>`
    ).join('');
  }
}

function renderReport(data) {
  document.querySelector('#totalRecords').textContent = formatNumber(data.totals?.records || 0);
  document.querySelector('#totalOpen').textContent = formatNumber(data.totals?.open || 0);
  document.querySelector('#totalTime').textContent = formatDuration(data.totals?.totalWorkMinutes || 0);
  document.querySelector('#totalFailed').textContent = formatNumber(data.totals?.failedAttempts || 0);

  const rows = data.rows || [];
  if (!rows.length) {
    recordsList.innerHTML = '<div class="record-row">За выбранный период записей нет.</div>';
    return;
  }
  recordsList.innerHTML = rows.map((row) => `
    <article class="record-row">
      <div>
        <strong>${escapeHtml(row.userName || 'Сотрудник')}</strong>
        <small>${escapeHtml(row.storeName || '-')}</small>
      </div>
      <div><small>Приход</small><strong>${formatDateTime(row.checkInTime)}</strong></div>
      <div><small>Уход</small><strong>${row.checkOutTime ? formatDateTime(row.checkOutTime) : '-'}</strong></div>
      <div><small>Время</small><strong>${formatDuration(row.currentWorkMinutes || row.totalWorkMinutes || 0)}</strong></div>
      <div><span class="badge ${row.status === 'closed' ? 'closed' : ''}">${row.status === 'open' ? 'На работе' : 'Закрыто'}</span></div>
      <div><small>Дистанция</small><strong>${formatMeters(row.checkInDistanceMeters)} / ${row.checkOutDistanceMeters === null ? '-' : formatMeters(row.checkOutDistanceMeters)}</strong></div>
    </article>
  `).join('');
}

function renderStores(stores) {
  if (!storesList) return;
  if (!stores.length) {
    storesList.innerHTML = '<div class="store-row">Рабочие точки не созданы.</div>';
    return;
  }
  storesList.innerHTML = stores.map((store) => `
    <article class="store-row">
      <div class="store-main">
        <div><strong>${escapeHtml(store.name)}</strong><small>${escapeHtml(store.address || 'Адрес не указан')}</small></div>
        <span class="badge ${store.qrDisabled || !store.qrUrl ? 'failed' : 'closed'}">${store.qrDisabled || !store.qrUrl ? 'QR отключен' : 'QR активен'}</span>
      </div>
      <div class="store-meta">
        <span>${Number(store.latitude).toFixed(6)}, ${Number(store.longitude).toFixed(6)}</span>
        <span>Радиус ${formatMeters(store.allowedRadiusMeters)}</span>
      </div>
      ${store.qrUrl ? `<img class="attendance-qr-image" src="${escapeAttr(buildQrImageUrl(store))}" alt="QR ${escapeAttr(store.name)}">
      <div class="qr-box">${location.origin}${store.qrUrl}</div>` : '<div class="qr-box">QR отключен. Нажмите “Обновить QR”, чтобы включить новый код.</div>'}
      <div class="store-actions">
        <button type="button" data-edit-store="${escapeAttr(store.id)}">Изменить</button>
        ${store.qrUrl ? `<button class="secondary" type="button" data-copy-qr="${escapeAttr(store.qrUrl)}">Копировать ссылку</button>
        <a class="qr-print-link" href="${escapeAttr(buildQrImageUrl(store))}" target="_blank" rel="noopener">Открыть QR</a>
        <button class="danger" type="button" data-disable-qr="${escapeAttr(store.id)}">Удалить QR</button>` : ''}
        <button class="danger" type="button" data-refresh-qr="${escapeAttr(store.id)}">Обновить QR</button>
      </div>
    </article>
  `).join('');
  storesList.querySelectorAll('[data-edit-store]').forEach((button) => button.addEventListener('click', () => fillStoreForm(button.dataset.editStore)));
  storesList.querySelectorAll('[data-copy-qr]').forEach((button) => button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${location.origin}${button.dataset.copyQr}`);
    setScanStatus('Ссылка QR скопирована.', false);
  }));
  storesList.querySelectorAll('[data-refresh-qr]').forEach((button) => button.addEventListener('click', () => refreshQr(button.dataset.refreshQr)));
  storesList.querySelectorAll('[data-disable-qr]').forEach((button) => button.addEventListener('click', () => disableQr(button.dataset.disableQr)));
}

function fillStoreForm(id) {
  const store = (reportData?.stores || []).find((item) => item.id === id);
  if (!store) return;
  document.querySelector('#storeId').value = store.id;
  document.querySelector('#storeName').value = store.name || '';
  document.querySelector('#storeBranch').value = store.branch || 'ayu';
  document.querySelector('#storeAddress').value = store.address || '';
  document.querySelector('#storeLatitude').value = store.latitude || 0;
  document.querySelector('#storeLongitude').value = store.longitude || 0;
  document.querySelector('#storeRadius').value = store.allowedRadiusMeters || 10;
  openStoreModal(store);
}

function openStoreModal(store = null) {
  if (!store) {
    storeForm.reset();
    document.querySelector('#storeId').value = '';
    document.querySelector('#storeRadius').value = 10;
  }
  storeModalTitle.textContent = store ? 'Изменить точку' : 'Новая точка';
  storeModal.classList.remove('hidden');
}

function closeStoreModal() {
  storeModal.classList.add('hidden');
}

async function saveStore(event) {
  event.preventDefault();
  const id = document.querySelector('#storeId').value;
  const payload = {
    name: document.querySelector('#storeName').value,
    branch: document.querySelector('#storeBranch').value,
    address: document.querySelector('#storeAddress').value,
    latitude: Number(document.querySelector('#storeLatitude').value),
    longitude: Number(document.querySelector('#storeLongitude').value),
    allowedRadiusMeters: Number(document.querySelector('#storeRadius').value || 10)
  };
  await api(id ? `/api/attendance/stores/${id}` : '/api/attendance/stores', {
    method: id ? 'PUT' : 'POST',
    body: payload
  });
  storeForm.reset();
  document.querySelector('#storeId').value = '';
  closeStoreModal();
  await loadReport();
}

async function adminOpenShift(event) {
  event.preventDefault();
  await api('/api/attendance/admin-open', {
    method: 'POST',
    body: {
      userId: adminOpenUser.value,
      storeId: adminOpenStore.value
    }
  });
  setScanStatus('Смена сотруднику открыта администратором. Часы по ней не начисляются.', false);
  await loadReport();
}

async function fillStoreLocationFromDevice() {
  useCurrentLocationButton.disabled = true;
  useCurrentLocationButton.textContent = 'Определяю...';
  setScanStatus('Встаньте прямо возле QR. Запрашиваю координаты устройства...', false);
  try {
    const position = await getCurrentPosition();
    document.querySelector('#storeLatitude').value = Number(position.coords.latitude).toFixed(7);
    document.querySelector('#storeLongitude').value = Number(position.coords.longitude).toFixed(7);
    const accuracy = Math.round(Number(position.coords.accuracy || 0));
    setScanStatus(`Координаты подставлены. Погрешность GPS: примерно ${accuracy} м.`, accuracy > 20);
    if (accuracy > 20 && Number(document.querySelector('#storeRadius').value || 10) < accuracy) {
      document.querySelector('#storeRadius').value = Math.min(100, Math.max(30, accuracy));
    }
  } catch (error) {
    setScanStatus(error.message || 'Не удалось получить координаты.', true);
  } finally {
    useCurrentLocationButton.disabled = false;
    useCurrentLocationButton.textContent = 'Взять мои координаты';
  }
}

async function refreshQr(id) {
  await api(`/api/attendance/stores/${id}/generate-qr`, {
    method: 'POST',
    body: { ttlMinutes: 0 }
  });
  await loadReport();
}

async function disableQr(id) {
  if (!window.confirm('Удалить QR этой рабочей точки? Старый код перестанет работать.')) return;
  await api(`/api/attendance/stores/${id}/qr`, { method: 'DELETE' });
  await loadReport();
}

function exportCsv() {
  const rows = reportData?.rows || [];
  const lines = [
    ['Сотрудник', 'Точка', 'Приход', 'Уход', 'Минут', 'Статус', 'Дистанция прихода', 'Дистанция ухода'],
    ...rows.map((row) => [
      row.userName || '',
      row.storeName || '',
      formatDateTime(row.checkInTime),
      row.checkOutTime ? formatDateTime(row.checkOutTime) : '',
      row.currentWorkMinutes || row.totalWorkMinutes || 0,
      row.status,
      row.checkInDistanceMeters ?? '',
      row.checkOutDistanceMeters ?? ''
    ])
  ];
  const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `attendance-${dateFrom.value}-${dateTo.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса.');
  return data;
}

function setScanStatus(message, error) {
  scanStatus.textContent = message;
  scanStatus.classList.toggle('error', error);
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  return `${Math.floor(value / 60)}ч ${value % 60}м`;
}
function buildQrImageUrl(store) {
  return store.qrUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=14&data=${encodeURIComponent(`${location.origin}${store.qrUrl}`)}` : '';
}
function formatMeters(value) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value) || 0)} м`; }
function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(Number(value) || 0); }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value) { return escapeHtml(value); }
