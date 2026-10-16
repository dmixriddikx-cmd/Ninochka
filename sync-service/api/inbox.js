import { timingSafeEqual } from 'node:crypto';
import { signedActor as actor } from '../lib/token-auth.js';
import { readDocument, replaceDocument, retryableStorageError, storageRetry } from '../lib/blob-store.js';
import { excludeUnsuccessful } from '../lib/transaction-status.js';
import { browserOrigin } from '../lib/browser-origin.js';
import { BUDGET_PATH, INBOX_PATH as PATH } from '../lib/data-generation.js';

// Independent staging queue; never changes the family budget.
const LIMIT = 200;
const CURRENCIES = new Set(['EUR', 'USD', 'MDL', 'UAH']);
const CATEGORIES = new Set(['products', 'transport', 'clothes', 'leisure', 'other', 'household', 'health', 'gifts']);

function reply(res, status, json) {
  return res.status(status).setHeader('Cache-Control', 'no-store').json(json);
}
function equal(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function cleanItem(item) {
  if (!item || typeof item !== 'object') throw new Error('invalid_item');
  const id = String(item.id || '');
  const name = String(item.name || '').trim();
  const date = String(item.date || '');
  const amount = Number(item.amount);
  const currency = String(item.currency || '');
  const category = String(item.category || 'other');
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + 'T12:00:00Z') : null;
  const validDate = parsedDate && Number.isFinite(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date;
  if (!/^[a-zA-Z0-9:_-]{4,120}$/.test(id) || !name || name.length > 120 ||
      !validDate ||
      !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000000 ||
      !CURRENCIES.has(currency) || !CATEGORIES.has(category)) throw new Error('invalid_item');
  return { id, name, date, amount, currency, category, status: 'pending' };
}
function seed() {
  // Private historical batches must never be copied into preview/test stores.
  const raw = process.env.VERCEL_ENV === 'preview' ? null : process.env.NINOCHKA_INBOX_INITIAL_BATCH;
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > LIMIT) throw new Error('invalid_seed');
  const { eligible } = excludeUnsuccessful(data);
  const cleaned = eligible.map(cleanItem);
  if (new Set(cleaned.map(x => x.id)).size !== cleaned.length) throw new Error('duplicate_seed');
  return cleaned;
}
async function readInboxSnapshot() {
  const snapshot = await readDocument(PATH);
  const data = snapshot.data;
  if (data) {
    if (!Number.isSafeInteger(data.rev) || data.rev < 1 || !Array.isArray(data.items)) throw new Error('invalid_inbox');
    return snapshot;
  }
  return { ...snapshot, data: { rev: 0, items: seed() } };
}
async function readInbox() { return (await readInboxSnapshot()).data; }
async function mutate(fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
    const snapshot = await readInboxSnapshot();
    const current = snapshot.data;
    const result = fn(current);
    if (!result.changed) return { rev: current.rev, ...result };
    const next = { rev: current.rev + 1, items: result.items };
      await replaceDocument(PATH, snapshot, next);
      return { rev: next.rev, ...result };
    } catch (error) {
      if (!retryableStorageError(error)) throw error;
      if (attempt < 4) await storageRetry(attempt);
    }
  }
  throw new Error('inbox_busy');
}
export default async function handler(req, res) {
  const origin = req.headers.origin;
  const ORIGIN = browserOrigin(req);
  if (origin && !ORIGIN) return reply(res, 403, { error: 'origin_denied' });
  if (ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') return ORIGIN ? res.status(204).end() : reply(res, 403, { error: 'origin_denied' });
  try {
    if (req.method === 'POST') {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const ingestToken = process.env.VERCEL_ENV === 'preview'
        ? process.env.NINOCHKA_PREVIEW_INBOX_INGEST_TOKEN : process.env.NINOCHKA_INBOX_INGEST_TOKEN;
      const authorizedImporter = Boolean(ingestToken && equal(token, ingestToken));
      // A signed family login may stage recognized rows for one final confirmation.
      // The old ingestion token still works for trusted external automation.
      const authorizedFamilyScan = req.body?.action === 'stage-recognized' && Boolean(actor(req));
      if (!authorizedImporter && !authorizedFamilyScan) {
        return reply(res, 401, { error: 'invalid_ingest_token' });
      }
      const rows = req.body?.items;
      if (!Array.isArray(rows) || !rows.length || rows.length > 50) return reply(res, 400, { error: 'invalid_batch' });
      // Drop bank-declined and bank-unsettled rows BEFORE validating amounts:
      // rejected payments often lack a normal posted amount/date.
      const { eligible, excluded } = excludeUnsuccessful(rows);
      const incoming = eligible.map(cleanItem);
      if (new Set(incoming.map(x => x.id)).size !== incoming.length) return reply(res, 400, { error: 'duplicate_ids_in_batch' });
      if (!incoming.length) {
        const current = await readInbox();
        return reply(res, 200, { rev: current.rev, accepted: 0, duplicates: 0,
          skippedDeclined: excluded.filter(x => x.reason === 'declined').length,
          skippedUnsettled: excluded.filter(x => x.reason === 'unsettled').length });
      }
      const result = await mutate(current => {
        const known = new Set(current.items.map(x => x.id));
        const additions = incoming.filter(x => !known.has(x.id));
        if (current.items.filter(x => x.status === 'pending').length + additions.length > LIMIT) throw new Error('queue_full');
        return { changed: Boolean(additions.length), items: current.items.concat(additions), accepted: additions.length, duplicates: incoming.length - additions.length };
      });
      return reply(res, 200, { rev: result.rev, accepted: result.accepted, duplicates: result.duplicates,
        skippedDeclined: excluded.filter(x => x.reason === 'declined').length,
        skippedUnsettled: excluded.filter(x => x.reason === 'unsettled').length });
    }
    const user = actor(req);
    if (!user) return reply(res, 401, { error: 'invalid_session' });
    if (req.method === 'GET') {
      const data = await readInbox();
      return reply(res, 200, { rev: data.rev, items: data.items.filter(x => x.status === 'pending'), actor: user });
    }
    if (req.method === 'PATCH') {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(x => typeof x === 'string')) {
        return reply(res, 400, { error: 'invalid_ids' });
      }
      const chosen = new Set(ids);
      // Acknowledgement must never hide purchases that did not reach the budget.
      const saved = (await readDocument(BUDGET_PATH)).data?.data;
      const recorded = new Set((saved?.months || []).flatMap(month =>
        (month.weeks || []).flatMap(week => (week.expenses || []).map(row => row.importId))));
      if (ids.some(id => !recorded.has(id))) return reply(res, 409, { error: 'expenses_not_confirmed' });
      const result = await mutate(current => {
        let changed = false;
        const items = current.items.map(row => {
          if (chosen.has(row.id) && row.status === 'pending') {
            changed = true;
            // Retain the exact ID as a replay tombstone, without retaining a
            // second full copy of the financial record in the staging queue.
            return { id: row.id, status: 'imported', importedAt: new Date().toISOString(), importedBy: user };
          }
          return row;
        });
        return { changed, items };
      });
      return reply(res, 200, { rev: result.rev, acknowledged: ids.length });
    }
    return reply(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    const invalid = ['invalid_item','invalid_seed','duplicate_seed','queue_full'].includes(err.message);
    return reply(res, invalid ? 400 : 503, { error: invalid ? err.message : 'inbox_unavailable' });
  }
}
