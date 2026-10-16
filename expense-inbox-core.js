// Expense intake rules shared by review UI and offline tests; no access to bank credentials.
export const INBOX_CURRENCIES = Object.freeze(['EUR','USD','MDL','UAH']);
export const INBOX_CATEGORIES = Object.freeze(['products','transport','clothes','leisure','other']);

export function importWeekForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw Error('invalid_date');
  const dt = new Date(date + 'T12:00:00Z');
  if (Number.isNaN(+dt) || dt.toISOString().slice(0,10) !== date) throw Error('invalid_date');
  const day = Number(date.slice(8,10));
  return { month:date.slice(0,7),week:Math.min(4,Math.floor((day-1)/7)+1) };
}
export function validateExpenseRow(raw) {
  const r = raw || {};
  const name = String(r.name || '').trim();
  const sourceId = String(r.sourceId || '').trim();
  const date = String(r.date || '');
  const currency = String(r.currency || '');
  const category = String(r.category || 'other');
  const amount = String(r.amount || '').replace(',','.').trim();
  const {month,week} = importWeekForDate(date);
  if (!name || !sourceId || name.length>120 || sourceId.length>128 ||
      !INBOX_CURRENCIES.includes(currency) || !INBOX_CATEGORIES.includes(category) ||
      !/^\d{1,9}\.\d{2}$/.test(amount) || !(Number(amount)>0)) throw Error('invalid_expense');
  return {name,sourceId,date,currency,category,amount,month,week};
}
export function classifyExpense(state,raw) {
  const row = validateExpenseRow(raw);
  const month = (state?.months || []).find(x=>x.id===row.month);
  if (!month || !month.weeks?.some(x=>x.id===row.week)) return {...row,status:'missing_month'};
  const expenses = (state.months || []).flatMap(m=>(m.weeks || []).flatMap(w=>w.expenses || []));
  const exact = expenses.some(x=>x.sourceId === row.sourceId);
  if (exact) return {...row,status:'duplicate'};
  // Older manually entered expenses may not carry sourceId. Surface a warning, never silently discard.
  const possible = expenses.some(x=>x.name?.toLowerCase().trim()===row.name.toLowerCase() &&
    x.currency===row.currency && x.amount===Math.round(Number(row.amount)*100) &&
    String(x.date || '').slice(0,10)===row.date);
  return {...row,status:possible?'possible_duplicate':'new'};
}
export function applyExpenseRows(draft,rows,core) {
  const keys = new Set();
  const inserted = [];
  for (const input of rows) {
    const row = classifyExpense(draft,input);
    if (row.status!=='new' && row.status!=='possible_duplicate') throw Error('row_not_new:'+row.sourceId);
    if (keys.has(row.sourceId)) throw Error('duplicate_in_batch');
    keys.add(row.sourceId);
    const month = draft.months.find(x=>x.id===row.month);
    const week = month.weeks.find(x=>x.id===row.week);
    const expense = core.addExpense(draft,week,{name:row.name,category:row.category,amount:row.amount,currency:row.currency});
    expense.sourceId = row.sourceId;
    expense.date = row.date + 'T12:00:00.000Z';
    inserted.push(expense);
  }
  return inserted;
}
