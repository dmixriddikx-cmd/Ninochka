// Shared family budget. Local data remains the recovery copy; Dropbox is authoritative only after activation.
const SYNC_API = String(globalThis.NINOCHKA_SYNC_API || '').replace(/\/$/, '');
const SYNC_KEY = 'ninochka-sync-key';
const SYNC_REV = 'ninochka-sync-rev';
const SYNC_READY = 'ninochka-sync-ready';
const SYNC_DIRTY = 'ninochka-sync-dirty';
const sync = { key: localStorage.getItem(SYNC_KEY) || '', rev: localStorage.getItem(SYNC_REV) || null,
  connected: false, staged: null, busy: false, paused: false, error: '', actor: '', dirty: localStorage.getItem(SYNC_DIRTY) === '1' };
const saveLocalOnly = save;

function syncPanel() {
  if (!SYNC_API) return '<p class="ct-profile-note">Общий доступ пока не включён. Данные на этом устройстве сохранены.</p>';
  if (sync.staged && !sync.connected) return `<p class="ct-profile-note">Ключ принят для ${sync.actor === 'nina' ? 'Нины' : 'Вовы'}. ${sync.staged.data ? 'Общий бюджет уже есть. Перед переходом сохраним местную копию.' : 'Общий бюджет пока пуст. Можно взять данные с этого устройства за основу.'}</p><button class="ct-primary ct-full" data-sync="activate">${sync.staged.data ? 'Открыть общий бюджет' : 'Создать общий бюджет'}</button>`;
  if (sync.connected) return `<p class="ct-profile-note">${sync.paused ? 'Изменения на двух устройствах столкнулись. Эта копия сохранена здесь; перед выбором скачай её.' : sync.error ? 'Нет связи с Dropbox. Изменения сохранены на этом устройстве и ждут отправки.' : sync.busy || sync.dirty ? 'Сохраняем изменения…' : `Общий бюджет подключён · ${sync.actor === 'nina' ? 'Нина' : 'Вова'}`}</p><div class="ct-sync-actions"><button class="ct-soft" data-sync="refresh">Обновить</button><button class="ct-soft" data-sync="backup">Скачать копию</button>${sync.paused ? '<button class="ct-soft" data-sync="use-remote">Открыть свежую общую версию</button>' : ''}</div>`;
  return `<p class="ct-profile-note">Нина и Вова видят один бюджет. Введи личный ключ доступа на своём устройстве.</p><label class="field"><span>Личный ключ</span><input class="ct-sync-input" type="password" autocomplete="off" data-sync-key placeholder="Ключ доступа"></label><button class="ct-primary ct-full" data-sync="connect">Подключиться</button>${sync.error ? `<p class="ct-sync-error">${escape(sync.error)}</p>` : ''}`;
}

function syncBanner() {
  return sync.paused ? '<div class="ct-sync-banner">Есть конфликт изменений. Местная копия сохранена. Открой «Ещё» и скачай её перед переходом к общей версии.</div>' : sync.connected && sync.error ? '<div class="ct-sync-banner">Нет связи с общим бюджетом. Новые изменения сохранены здесь и будут отправлены после восстановления связи.</div>' : '';
}
globalThis.NinochkaSync = { panel: syncPanel, banner: syncBanner, get connected() { return sync.connected; } };

async function syncRequest(method, body) {
  const response = await fetch(`${SYNC_API}/api/sync`, { method, headers: { Authorization: `Bearer ${sync.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const result = await response.json();
  if (response.status === 409) return { conflict: true, ...result };
  if (!response.ok) throw new Error(response.status === 401 ? 'Неверный ключ доступа.' : 'Не удалось связаться с общим бюджетом.');
  return result;
}

function adoptRemote(data) {
  const preferences = { ...state.preferences };
  state = core.migrate(data);
  state.preferences = { ...state.preferences, ...preferences, actor: sync.actor };
  core.ensureCurrentMonth(state);
  saveLocalOnly();
  view.week = firstOpenWeekId();
  render();
}

function backupLocal() {
  const content = localStorage.getItem(STORE);
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `ninochka-local-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function zeroBudget() {
  const preferences = { ...state.preferences };
  const storageCurrency = state.storage?.currency || 'EUR';
  const clean = core.createState();
  clean.preferences = preferences;
  clean.storage.currency = storageCurrency;
  for (const month of clean.months) {
    for (const week of month.weeks) {
      week.fund.amount = 0;
      week.fund.currency = storageCurrency;
      week.fund.rate = 1;
    }
  }
  return clean;
}

function resetTestData() {
  if (!confirm('Сбросить все суммы, расходы, планы, доходы и историю? Перед сбросом скачается резервная копия.')) return;
  if (prompt('Для подтверждения введи СБРОС')?.trim().toUpperCase() !== 'СБРОС') return;
  backupLocal();
  localStorage.setItem(`ninochka-before-reset-${Date.now()}`, localStorage.getItem(STORE) || '');
  state = zeroBudget();
  view.week = 1;
  view.weekMode = 'detail';
  save();
  render();
  notify(sync.connected ? 'Бюджет обнулён. Отправляем чистую копию в общий доступ.' : 'Тестовые данные сброшены. Все суммы теперь по нулям.');
}

async function connectSync(key, restoring = false) {
  if (!SYNC_API || !key) return;
  sync.key = key.trim(); sync.error = '';
  try {
    const remote = await syncRequest('GET');
    sync.actor = remote.actor;
    if (restoring && localStorage.getItem(SYNC_READY) === '1') {
      sync.connected = true; sync.rev = localStorage.getItem(SYNC_REV) || null;
      state.preferences.actor = sync.actor;
      if (sync.dirty) { sync.paused = false; queueSync(); }
      else { sync.rev = remote.rev; localStorage.setItem(SYNC_REV, sync.rev || ''); if (remote.data) adoptRemote(remote.data); }
    } else sync.staged = remote;
  } catch (error) { sync.error = error.message || 'Не удалось подключиться.'; sync.connected = false; }
  render();
}

function activateSync() {
  if (!sync.staged) return;
  if (!localStorage.getItem('ninochka-before-shared')) localStorage.setItem('ninochka-before-shared', localStorage.getItem(STORE) || '');
  localStorage.setItem(SYNC_KEY, sync.key);
  localStorage.setItem(SYNC_READY, '1');
  sync.connected = true; sync.rev = sync.staged.rev; sync.paused = false; sync.error = '';
  state.preferences.actor = sync.actor;
  if (sync.staged.data) {
    localStorage.setItem(SYNC_REV, sync.rev);
    localStorage.removeItem(SYNC_DIRTY); sync.dirty = false;
    adoptRemote(sync.staged.data);
  } else {
    sync.dirty = true; localStorage.setItem(SYNC_DIRTY, '1');
    saveLocalOnly(); queueSync();
  }
  sync.staged = null; render();
}

let syncAgain = false;
async function queueSync() {
  if (!sync.connected || sync.paused || !SYNC_API) return;
  if (sync.busy) { syncAgain = true; return; }
  sync.busy = true;
  do {
    syncAgain = false;
    const snapshot = JSON.parse(JSON.stringify(state));
    // Each device keeps its own appearance and onboarding preference.
    snapshot.preferences = { ...snapshot.preferences, actor: 'nina', theme: 'dark', language: 'ru', onboardingSeen: true };
    try {
      const result = await syncRequest('PUT', { rev: sync.rev, data: snapshot });
      if (result.conflict) { sync.paused = true; sync.error = 'Конфликт версий'; break; }
      sync.rev = result.rev; localStorage.setItem(SYNC_REV, sync.rev);
      sync.error = '';
      if (!syncAgain) { sync.dirty = false; localStorage.removeItem(SYNC_DIRTY); }
    } catch (error) { sync.error = error.message || 'Сеть недоступна'; break; }
  } while (syncAgain);
  sync.busy = false; render();
}

save = function () {
  saveLocalOnly();
  if (sync.connected) { sync.dirty = true; localStorage.setItem(SYNC_DIRTY, '1'); queueSync(); }
};

async function refreshSync() {
  if (!sync.connected || sync.busy || sync.paused) return;
  if (sync.dirty) return queueSync();
  try {
    const remote = await syncRequest('GET');
    sync.error = '';
    if (remote.rev !== sync.rev) {
      sync.rev = remote.rev; localStorage.setItem(SYNC_REV, sync.rev || '');
      if (remote.data) adoptRemote(remote.data);
    }
  } catch (error) { sync.error = error.message || 'Сеть недоступна'; }
  if (view.tab === 'more' || sync.error) render();
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-sync]');
  if (!button) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const action = button.dataset.sync;
  if (action === 'connect') connectSync(document.querySelector('[data-sync-key]')?.value || '');
  if (action === 'activate') activateSync();
  if (action === 'refresh') refreshSync();
  if (action === 'backup') backupLocal();
  if (action === 'reset') resetTestData();
  if (action === 'use-remote') {
    if (!confirm('Местные изменения ещё не попали в общий бюджет. Скачай копию перед переходом. Открыть общую версию?')) return;
    localStorage.setItem(`ninochka-conflict-${Date.now()}`, localStorage.getItem(STORE) || '');
    backupLocal();
    sync.paused = false; sync.dirty = false; localStorage.removeItem(SYNC_DIRTY);
    syncRequest('GET').then(remote => { sync.rev = remote.rev; localStorage.setItem(SYNC_REV, remote.rev || ''); if (remote.data) adoptRemote(remote.data); render(); }).catch(error => { sync.paused = true; sync.error = error.message; render(); });
  }
}, true);

if (SYNC_API && sync.key && localStorage.getItem(SYNC_READY) === '1') connectSync(sync.key, true);
if (SYNC_API) {
  setInterval(() => { if (!document.hidden) refreshSync(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSync(); });
}
