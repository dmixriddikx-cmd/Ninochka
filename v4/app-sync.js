// Shared family budget. Local data stays as the recovery copy; the Vercel store is authoritative after activation.
const SYNC_API = String(globalThis.NINOCHKA_SYNC_API || '').replace(/\/$/, '');
const SYNC_TOKEN = 'ninochka-sync-token';
const SYNC_LOGIN = 'ninochka-sync-login';
const SYNC_REV = 'ninochka-sync-rev';
const SYNC_READY = 'ninochka-sync-ready';
const SYNC_DIRTY = 'ninochka-sync-dirty';
const sync = {
  token: localStorage.getItem(SYNC_TOKEN) || '',
  login: localStorage.getItem(SYNC_LOGIN) || '',
  rev: localStorage.getItem(SYNC_REV) || null,
  connected: false,
  staged: null,
  busy: false,
  paused: false,
  error: '',
  actor: '',
  dirty: localStorage.getItem(SYNC_DIRTY) === '1'
};
const saveLocalOnly = save;

function syncActorName() {
  return sync.actor === 'volodymyr' ? 'Вова' : 'Нина';
}

function syncPanel() {
  if (!SYNC_API) return '<p class="ct-profile-note">Общий доступ пока не включён. Данные на этом устройстве сохранены.</p>';

  if (sync.staged && !sync.connected) {
    return `<p class="ct-profile-note">Вход выполнен: <b>${syncActorName()}</b>. ${sync.staged.data ? 'Общий бюджет уже существует. Перед переходом местная копия сохранится.' : 'Общий бюджет пока пуст. Можно взять данные с этого устройства за основу.'}</p><button class="ct-primary ct-full" data-sync="activate">${sync.staged.data ? 'Открыть общий бюджет' : 'Создать общий бюджет'}</button>`;
  }

  if (sync.connected) {
    const status = sync.paused
      ? 'Изменения на двух устройствах столкнулись. Местная копия сохранена — перед выбором скачай её.'
      : sync.error
        ? 'Нет связи с общим бюджетом. Изменения сохранены на этом устройстве и ждут отправки.'
        : sync.busy || sync.dirty
          ? 'Сохраняем изменения…'
          : `Общий бюджет подключён · ${syncActorName()}`;
    return `<p class="ct-profile-note">${status}</p><div class="ct-sync-actions"><button class="ct-soft" data-sync="refresh">Обновить</button><button class="ct-soft" data-sync="backup">Скачать копию</button><button class="ct-soft" data-sync="logout">Выйти</button>${sync.paused ? '<button class="ct-soft" data-sync="use-remote">Открыть свежую общую версию</button>' : ''}</div>`;
  }

  return `<p class="ct-profile-note">Нина и Вова видят один бюджет. Войди под своим именем — новые записи автоматически получат автора.</p><label class="field"><span>Логин</span><input class="ct-sync-input" type="text" autocomplete="username" data-sync-login value="${escape(sync.login)}" placeholder="Нина или Вова"></label><label class="field"><span>Пароль</span><input class="ct-sync-input" type="password" autocomplete="current-password" data-sync-pin placeholder="Пароль"></label><button class="ct-primary ct-full" data-sync="connect">Войти</button>${sync.error ? `<p class="ct-sync-error">${escape(sync.error)}</p>` : ''}`;
}

function syncBanner() {
  return sync.paused
    ? '<div class="ct-sync-banner">Есть конфликт изменений. Местная копия сохранена. Открой «Ещё» и скачай её перед переходом к общей версии.</div>'
    : sync.connected && sync.error
      ? '<div class="ct-sync-banner">Нет связи с общим бюджетом. Новые изменения сохранены здесь и будут отправлены после восстановления связи.</div>'
      : '';
}

globalThis.NinochkaSync = {
  panel: syncPanel,
  banner: syncBanner,
  get connected() { return sync.connected; },
  get actor() { return sync.actor; }
};

async function syncRequest(method, body, authenticated = true) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (authenticated && sync.token) headers.Authorization = `Bearer ${sync.token}`;

  const response = await fetch(`${SYNC_API}/api/sync`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 409) return { conflict: true, ...result };
  if (!response.ok) {
    const message = response.status === 401
      ? (authenticated ? 'Сессия закончилась. Войди снова.' : 'Неверный логин или пароль.')
      : response.status === 503
        ? 'Общий бюджет занят или временно недоступен. Изменения остаются на этом устройстве.'
        : 'Не удалось связаться с общим бюджетом.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
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
  link.href = url;
  link.download = `ninochka-local-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
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
  notify(sync.connected
    ? 'Бюджет обнулён. Чистая копия отправляется в общий доступ.'
    : 'Тестовые данные сброшены. Все суммы теперь по нулям.');
}

function clearSyncSession(message = '') {
  sync.token = '';
  sync.rev = null;
  sync.connected = false;
  sync.staged = null;
  sync.paused = false;
  sync.busy = false;
  sync.dirty = false;
  sync.actor = '';
  sync.error = message;
  localStorage.removeItem(SYNC_TOKEN);
  localStorage.removeItem(SYNC_REV);
  localStorage.removeItem(SYNC_READY);
  localStorage.removeItem(SYNC_DIRTY);
}

async function connectSync(login = '', pin = '', restoring = false) {
  if (!SYNC_API) return;
  sync.error = '';

  try {
    if (!restoring) {
      const auth = await syncRequest('POST', { action: 'login', login: login.trim(), pin }, false);
      sync.token = auth.token;
      sync.actor = auth.actor;
      sync.login = login.trim();
      localStorage.setItem(SYNC_TOKEN, sync.token);
      localStorage.setItem(SYNC_LOGIN, sync.login);
    }

    const remote = await syncRequest('GET');
    sync.actor = remote.actor;
    sync.connected = true;
    sync.rev = remote.rev;
    sync.staged = null;
    sync.paused = false;
    localStorage.setItem(SYNC_READY, '1');
    localStorage.setItem(SYNC_REV, String(sync.rev ?? 0));
    state.preferences.actor = sync.actor;

    if (!restoring && !localStorage.getItem(`ninochka-onboarding-${sync.actor}`)) {
      state.preferences.onboardingSeen = false;
    }

    if (sync.dirty) {
      queueSync();
    } else if (remote.data) {
      adoptRemote(remote.data);
    } else {
      sync.dirty = true;
      localStorage.setItem(SYNC_DIRTY, '1');
      saveLocalOnly();
      queueSync();
    }
  } catch (error) {
    if (restoring && error.status === 401) clearSyncSession('Сессия закончилась. Войди снова.');
    else {
      sync.error = error.message || 'Не удалось подключиться.';
      sync.connected = false;
    }
  }
  render();
}

function activateSync() {
  if (!sync.staged) return;
  if (!localStorage.getItem('ninochka-before-shared')) {
    localStorage.setItem('ninochka-before-shared', localStorage.getItem(STORE) || '');
  }

  localStorage.setItem(SYNC_TOKEN, sync.token);
  localStorage.setItem(SYNC_LOGIN, sync.login);
  localStorage.setItem(SYNC_READY, '1');
  sync.connected = true;
  sync.rev = sync.staged.rev;
  sync.paused = false;
  sync.error = '';
  state.preferences.actor = sync.actor;

  if (sync.staged.data) {
    localStorage.setItem(SYNC_REV, String(sync.rev ?? 0));
    localStorage.removeItem(SYNC_DIRTY);
    sync.dirty = false;
    adoptRemote(sync.staged.data);
  } else {
    sync.dirty = true;
    localStorage.setItem(SYNC_DIRTY, '1');
    saveLocalOnly();
    queueSync();
  }

  sync.staged = null;
  render();
}

let syncAgain = false;
async function queueSync() {
  if (!sync.connected || sync.paused || !SYNC_API) return;
  if (sync.busy) {
    syncAgain = true;
    return;
  }

  sync.busy = true;
  do {
    syncAgain = false;
    const snapshot = JSON.parse(JSON.stringify(state));
    // Appearance and onboarding remain local to each device.
    snapshot.preferences = {
      ...snapshot.preferences,
      actor: sync.actor,
      theme: 'dark',
      language: 'ru',
      onboardingSeen: true
    };

    try {
      const result = await syncRequest('PUT', { rev: Number(sync.rev || 0), data: snapshot });
      if (result.conflict) {
        sync.paused = true;
        sync.error = 'Конфликт версий';
        break;
      }
      sync.rev = result.rev;
      localStorage.setItem(SYNC_REV, String(sync.rev));
      sync.error = '';
      if (!syncAgain) {
        sync.dirty = false;
        localStorage.removeItem(SYNC_DIRTY);
      }
    } catch (error) {
      if (error.status === 401) {
        clearSyncSession('Сессия закончилась. Войди снова.');
        break;
      }
      sync.error = error.message || 'Сеть недоступна';
      break;
    }
  } while (syncAgain);

  sync.busy = false;
  render();
}

save = function () {
  saveLocalOnly();
  if (sync.connected) {
    sync.dirty = true;
    localStorage.setItem(SYNC_DIRTY, '1');
    queueSync();
  }
};

async function refreshSync() {
  if (!sync.connected || sync.busy || sync.paused) return;
  if (sync.dirty) return queueSync();

  try {
    const remote = await syncRequest('GET');
    sync.error = '';
    if (Number(remote.rev) !== Number(sync.rev)) {
      sync.rev = remote.rev;
      localStorage.setItem(SYNC_REV, String(sync.rev ?? 0));
      if (remote.data) adoptRemote(remote.data);
    }
  } catch (error) {
    if (error.status === 401) clearSyncSession('Сессия закончилась. Войди снова.');
    else sync.error = error.message || 'Сеть недоступна';
  }

  if (view.tab === 'more' || sync.error) render();
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-sync]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const action = button.dataset.sync;
  if (action === 'connect') {
    connectSync(
      document.querySelector('[data-sync-login]')?.value || '',
      document.querySelector('[data-sync-pin]')?.value || ''
    );
  }
  if (action === 'activate') activateSync();
  if (action === 'refresh') refreshSync();
  if (action === 'backup') backupLocal();
  if (action === 'reset') resetTestData();
  if (action === 'logout') {
    clearSyncSession();
    render();
  }
  if (action === 'use-remote') {
    if (!confirm('Местные изменения ещё не попали в общий бюджет. Скачай копию перед переходом. Открыть общую версию?')) return;
    localStorage.setItem(`ninochka-conflict-${Date.now()}`, localStorage.getItem(STORE) || '');
    backupLocal();
    sync.paused = false;
    sync.dirty = false;
    localStorage.removeItem(SYNC_DIRTY);
    syncRequest('GET')
      .then(remote => {
        sync.rev = remote.rev;
        localStorage.setItem(SYNC_REV, String(remote.rev ?? 0));
        if (remote.data) adoptRemote(remote.data);
        render();
      })
      .catch(error => {
        sync.paused = true;
        sync.error = error.message;
        render();
      });
  }
}, true);

const renderBudget = render;

function authScreen() {
  const remembered = escape(sync.login || '');
  return `<main class="ct-auth-shell">
    <section class="ct-auth-card">
      <div class="ct-auth-brand">
        <div class="ct-auth-title">Ниночка <span>♡</span></div>
        <div class="ct-auth-subtitle">СЕМЕЙНЫЙ БЮДЖЕТ</div>
        <div class="ct-auth-motto">Наш дом <i>•</i> Наши планы <i>•</i> Вместе</div>
      </div>
      <form class="ct-auth-form" data-auth-form>
        <label><span>♡</span><input type="text" autocomplete="username" data-sync-login value="${remembered}" placeholder="Логин" required></label>
        <label><span>⌑</span><input type="password" autocomplete="current-password" data-sync-pin placeholder="Пароль" required><button type="button" class="ct-auth-eye" data-auth-eye aria-label="Показать пароль">◉</button></label>
        <button class="ct-auth-submit" type="submit" ${sync.busy?'disabled':''}>Войти <b>→</b></button>
      </form>
      ${sync.error ? `<p class="ct-auth-error">${escape(sync.error)}</p>` : ''}
      <div class="ct-auth-family"><span>Нина</span><i>♥</i><span>Вова</span></div>
      <div class="ct-auth-note">Один бюджет на нашу новую главу ♡</div>
    </section>
  </main>`;
}

render = function () {
  setDoc();
  if (!sync.connected) {
    modal.open && modal.close();
    app.innerHTML = authScreen();
    return;
  }
  renderBudget();
};

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  sync.busy = true;
  render();
  connectSync(
    form.querySelector('[data-sync-login]')?.value || '',
    form.querySelector('[data-sync-pin]')?.value || ''
  ).finally(() => { sync.busy = false; render(); });
}, true);

document.addEventListener('click', event => {
  const eye = event.target.closest('[data-auth-eye]');
  if (!eye) return;
  const input = eye.closest('label')?.querySelector('[data-sync-pin]');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}, true);

document.addEventListener('click', event => {
  const onboard = event.target.closest('[data-onboard="done"]');
  if (onboard && sync.actor) localStorage.setItem(`ninochka-onboarding-${sync.actor}`, '1');
}, true);

if (SYNC_API && sync.token && localStorage.getItem(SYNC_READY) === '1') {
  render();
  connectSync('', '', true);
} else {
  render();
}
if (SYNC_API) {
  setInterval(() => { if (!document.hidden) refreshSync(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSync(); });
}
