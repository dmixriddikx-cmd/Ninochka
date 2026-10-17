// Per-transaction bank outcome guard for screenshot recognition / inbox ingestion.
// Only consider text attached to THIS transaction, never an entire screenshot
// containing multiple rows (where a decline label may belong to another row).
const DECLINED = /(?:отклон(?:ен[аоы]?|ено|ена|ено\s+банком)|отказано|не\s+прош[её]л|не\s+выполнен[ао]?|не\s+провед[её]н[ао]?|відхилен[аоі]?|відмовлено|не\s+виконан[ао]?|declined|rejected|denied\s+by\s+(?:the\s+)?bank|\bfailed\b|\berror\b|payment\s+failed|transaction\s+failed|unsuccessful|not\s+approved)/i;
const UNSETTLED = /(?:^|\b)(?:pending|awaiting\s+approval|authorization\s+only)(?:\b|$)|(?:в\s+обработке|ожидает\s+подтверждения|очікує\s+підтвердження)/i;

function label(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

export function bankOutcome(item) {
  if (!item || typeof item !== 'object') return 'unknown';
  const fields = [
    item.bankStatus, item.transactionStatus, item.paymentStatus,
    item.statusText, item.result, item.description, item.name,
    // "status" is overloaded by the cloud inbox: "pending" there means
    // "awaiting user import", not necessarily a pending bank charge.
    item.status && item.status !== 'pending' ? item.status : ''
  ];
  const txt = fields.map(label).filter(Boolean).join(' | ');
  if (DECLINED.test(txt)) return 'declined';
  const bankOnly = [item.bankStatus, item.transactionStatus, item.paymentStatus,
    item.statusText, item.status !== 'pending' ? item.status : ''].map(label).join(' | ');
  if (UNSETTLED.test(bankOnly) || /unknown|unconfirmed|неизвест|невідом/i.test(bankOnly)) return 'unsettled';
  return 'review';
}

export function excludeUnsuccessful(rows) {
  if (!Array.isArray(rows)) throw new TypeError('invalid_batch');
  const eligible = [];
  const excluded = [];
  for (const row of rows) {
    const outcome = bankOutcome(row);
    if (outcome === 'declined' || outcome === 'unsettled')
      excluded.push({ id: row?.id ?? null, reason: outcome });
    else eligible.push(row);
  }
  return { eligible, excluded };
}
