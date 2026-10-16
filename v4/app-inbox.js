// Expense inbox: pending cloud transactions never alter the budget before one confirmation.
// This module is appended after app-sync.js in the generated single-script bundle.
const expenseInbox = { items: [], loading: false, applying: false, error: '', ready: false };
const originalInboxRender = render;

function inboxWeekId(date) {
  const day = Number(date.slice(8, 10));
  return day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
}
function inboxPreviouslyRecorded(item, data = state) {
  return data.months.some(mm => mm.weeks.some(ww => ww.expenses.some(row =>
    row.importId === item.id ||
    (row.importId == null && String(row.name).toLowerCase() === item.name.toLowerCase() &&
     row.currency === item.currency && row.amount === item.amount &&
     String(row.date).slice(0,10) === item.date)
  )));
}
function inboxPending() { return expenseInbox.items.filter(item => !inboxPreviouslyRecorded(item)); }
function inboxBanner() {
  if (!sync.connected || !expenseInbox.ready) return '';
  const available = inboxPending();
  if (!available.length) return '';
  return '<section class="ct-card ct-inbox-banner" style="margin:12px 0;padding:16px;border:1px solid currentColor;border-radius:15px">' +
    '<div><strong>Новые расходы: ' + available.length + '</strong>' +
    '<p style="margin:5px 0 10px">Уже распознаны. Проверь покупки и подтверди один раз.</p></div>' +
    '<button type="button" class="ct-primary" data-inbox="review">Распределить расходы →</button></section>';
}
render = function () {
  originalInboxRender();
  const root = app.querySelector('.ct-app');
  if (root) root.insertAdjacentHTML('afterbegin', inboxBanner());
};
async function inboxRequest(method, body) {
  const response = await fetch(SYNC_API + '/api/inbox', {
    method, cache: 'no-store',
    headers: { 'Authorization': 'Bearer ' + sync.token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'inbox_unavailable');
    err.status = response.status;
    throw err;
  }
  return data;
}
async function refreshExpenseInbox() {
  if (!sync.connected || expenseInbox.loading || expenseInbox.applying) return;
  expenseInbox.loading = true;
  try {
    const latest = await inboxRequest('GET');
    expenseInbox.items = latest.items || [];
    expenseInbox.ready = true;
    expenseInbox.error = '';
    const acknowledged = expenseInbox.items.filter(item => inboxPreviouslyRecorded(item)).map(x => x.id);
    if (acknowledged.length && !sync.dirty && !sync.paused) {
      // Budget is already saved: acknowledgement is bookkeeping, not a second approval.
      await inboxRequest('PATCH', { ids: acknowledged }).catch(() => {});
      expenseInbox.items = expenseInbox.items.filter(x => !acknowledged.includes(x.id));
    }
  } catch (error) {
    expenseInbox.error = String(error.message || error);
  } finally {
    expenseInbox.loading = false;
    render();
  }
}
function reviewExpenseInbox() {
  const list = inboxPending();
  if (!list.length) return notify('Новых расходов нет');
  const rows = list.map(item => {
    const price = fmt(item.amount, item.currency);
    const category = contractLabel(item.category);
    const target = item.date.slice(0, 7) + ' · неделя ' + inboxWeekId(item.date);
    return '<label class="ct-expense-row" style="display:flex;gap:10px;align-items:center;margin:9px 0">' +
      '<input type="checkbox" data-inbox-check="' + escape(item.id) + '" checked style="width:18px;height:18px">' +
      '<span style="flex:1;min-width:0"><b>' + escape(item.name) + '</b><small style="display:block">' +
      escape(target + ' · ' + category) + '</small></span><strong>' + escape(price) + '</strong></label>';
  }).join('');
  const currencies = [...new Set(list.map(x => x.currency))].map(currency => {
    const sum = list.filter(x => x.currency === currency).reduce((a,x) => a+x.amount,0);
    return fmt(sum,currency);
  }).join(' + ');
  showModal('Проверка расходов', '<p class="note">Подтвердить можно одним нажатием. ' +
    'Расходы попадут в недели по дате, дубли будут пропущены. Прошедшая неделя закроется и её итог изменит Хранилище, даже ниже нуля.</p>' +
    '<div style="max-height:48vh;overflow:auto">' + rows + '</div>' +
    '<p><strong>Всего: ' + escape(currencies) + '</strong></p>' +
    '<div class="modal-actions"><button type="button" class="btn primary" data-inbox="apply">Подтвердить и распределить</button></div>');
}
function inboxMonth(data, id) {
  let target = data.months.find(x => x.id === id);
  if (target) return target;
  target = core.blankMonth(id);
  // Never manufacture a $200 weekly allocation for a historical import.
  for (const ww of target.weeks) ww.fund = { amount: 0, currency: data.storage.currency, rate: 1 };
  data.months.push(target);
  return target;
}
function inboxPeriodFinished(monthId, weekId) {
  const year = Number(monthId.slice(0,4)), month = Number(monthId.slice(5,7));
  const finalDay = weekId === 4 ? new Date(year, month, 0).getDate() : weekId * 7;
  const end = new Date(year, month - 1, finalDay, 23, 59, 59, 999);
  return end.getTime() < Date.now();
}
async function applyExpenseInbox() {
  if (expenseInbox.applying) return;
  const checked = [...modal.querySelectorAll('[data-inbox-check]:checked')].map(x => x.dataset.inboxCheck);
  const selected = inboxPending().filter(x => checked.includes(x.id));
  if (!selected.length) return notify('Выбери хотя бы один расход');
  if (!sync.connected || sync.busy || sync.dirty || sync.paused) {
    return notify('Сначала дождись синхронизации общего бюджета');
  }
  expenseInbox.applying = true;
  sync.busy = true;
  try {
    const latest = await syncRequest('GET');
    if (Number(latest.rev) !== Number(sync.rev)) {
      sync.rev = latest.rev;
      localStorage.setItem(SYNC_REV, String(sync.rev));
      if (latest.data) adoptRemote(latest.data);
      throw new Error('Бюджет обновился на другом телефоне. Проверь расходы и нажми ещё раз.');
    }
    for (const currency of new Set(selected.map(x => x.currency))) await ensureRateFor(currency);
    const draft = structuredClone(state);
    const affected = new Map();
    let inserted = 0;
    for (const item of selected) {
      if (inboxPreviouslyRecorded(item, draft)) continue;
      const monthId = item.date.slice(0, 7);
      const weekId = inboxWeekId(item.date);
      const month = inboxMonth(draft, monthId);
      const target = month.weeks.find(w => w.id === weekId);
      if (!target) throw new Error('Неделя не найдена: ' + monthId + '/' + weekId);
      // addExpense takes major units; cloud queue stores exact integer minor units.
      const created = core.addExpense(draft, target, {
        name: item.name, amount: core.moneyInput(item.amount), currency: item.currency, category: item.category
      });
      created.importId = item.id;
      created.date = item.date + 'T12:00:00.000Z';
      created.actor = sync.actor;
      affected.set(monthId + '/' + weekId, { monthId, weekId, week: target });
      inserted++;
    }
    for (const entry of affected.values()) {
      if (!inboxPeriodFinished(entry.monthId, entry.weekId) || entry.week.status === 'closed') continue;
      const currency = entry.week.fund.currency;
      const rate = currency === draft.storage.currency ? 1 : core.getRate(draft, currency, draft.storage.currency);
      if (!rate) throw new Error('Для закрытия недели нужен курс ' + currency);
      entry.week.fund.rate = rate;
      core.closeWeek(draft, entry.week);
    }
    if (inserted) {
      const committed = await syncRequest('PUT', { rev: Number(sync.rev || 0), data: draft });
      sync.rev = Number(committed.rev);
      localStorage.setItem(SYNC_REV, String(sync.rev));
      adoptRemote(draft);
    }
    try { await inboxRequest('PATCH', { ids: selected.map(x => x.id) }); }
    catch { /* Imported rows are recognized by importId on the next refresh. */ }
    expenseInbox.items = expenseInbox.items.filter(x => !selected.some(s => s.id === x.id));
    closeModal();
    render();
    notify('Зачислено расходов: ' + inserted + '. Дубли пропущены.');
  } catch (error) {
    notify(error.message || 'Не удалось импортировать расходы');
    // Unconfirmed items remain pending; no speculative local expense is saved.
  } finally {
    sync.busy = false;
    expenseInbox.applying = false;
    refreshExpenseInbox();
  }
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-inbox]');
  if (!control) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (control.dataset.inbox === 'review') reviewExpenseInbox();
  if (control.dataset.inbox === 'apply') applyExpenseInbox();
}, true);

// Browser timers must not hold open the Node.js runtime smoke-test process.
function inboxPoll(fn, ms) {
  const timer = setInterval(fn, ms);
  if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
}
inboxPoll(() => {
  if (!document.hidden && sync.connected) refreshExpenseInbox();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && sync.connected) refreshExpenseInbox();
});
inboxPoll(() => {
  if (sync.connected && !expenseInbox.ready) refreshExpenseInbox();
}, 2500);
if (sync.connected) refreshExpenseInbox();
