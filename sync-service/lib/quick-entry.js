// Shared-budget quick add: pure validation + deterministic budget mutation.
// A repeat with the same actor/request id is a no-op, not a second debit.
const CURRENCIES = new Set(['EUR', 'USD', 'MDL', 'UAH']);
export class QuickError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
export function parseMinor(raw) {
  const value = String(raw ?? '').trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value)) throw new QuickError('invalid_amount');
  const [whole, decimals = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 99999999) throw new QuickError('invalid_amount');
  return minor;
}
export function quickWeek(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T12:00:00Z')) ||
      new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date)
    throw new QuickError('invalid_date');
  const day = Number(date.slice(8,10));
  return day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
}
export function applyQuickExpense(data, actor, payload) {
  if (!data || data.schemaVersion !== 4 || !Array.isArray(data.months) || !data.storage)
    throw new QuickError('budget_not_initialized', 409);
  if (!['nina','volodymyr'].includes(actor)) throw new QuickError('invalid_actor', 401);
  const id = String(payload?.id || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new QuickError('invalid_id');
  const importId = 'quick:' + actor + ':' + id;
  if (data.months.some(m => m.weeks?.some(w => w.expenses?.some(x => x.importId === importId))))
    return { duplicate: true, data, importId };

  const date = String(payload?.date || '');
  const weekId = quickWeek(date);
  const minor = parseMinor(payload?.amount);
  const currency = payload?.currency || data.storage.currency;
  if (!CURRENCIES.has(currency)) throw new QuickError('invalid_currency');
  const targetCurrency = data.storage.currency;
  const rate = currency === targetCurrency ? 1 : Number(data.rates?.[currency + '_' + targetCurrency]?.value);
  if (!(rate > 0) || !Number.isFinite(rate)) throw new QuickError('missing_rate', 409);
  const monthId = date.slice(0,7);
  const month = data.months.find(x => x.id === monthId);
  if (!month) throw new QuickError('month_not_initialized', 409);
  const week = month.weeks?.find(x => x.id === weekId);
  if (!week) throw new QuickError('week_not_initialized', 409);

  const row = {
    id: 'quick-' + id,
    importId,
    name: 'Мелкие расходы',
    category: 'leisure',
    amount: minor,
    currency, rate,
    date: date + 'T12:00:00.000Z',
    actor
  };
  // "Save" in the shortcut is the user's single confirmation.
  week.expenses.push(row);
  const converted = Math.round(minor * rate);
  if (week.status === 'closed') {
    // Preserve the existing closed-week settlement rule: only this extra cost is deducted.
    week.settlement = Number(week.settlement || 0) - converted;
    data.storage.balance = Number(data.storage.balance || 0) - converted;
  }
  return { duplicate: false, data, importId, row, weekId, monthId };
}
