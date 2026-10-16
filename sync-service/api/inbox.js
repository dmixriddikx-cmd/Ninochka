import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { get, put, del } from '@vercel/blob';
import { excludeUnsuccessful } from '../lib/transaction-status.js';

// Independent staging queue; never changes the family budget.
const ORIGIN = 'https://dmixriddikx-cmd.github.io';
const PATH = 'family-expense-inbox.json';
const LOCK = 'family-expense-inbox.lock';
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
function actor(req) {
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(req.headers.authorization || '');
  if (!match || !process.env.NINOCHKA_SESSION_SECRET) return null;
  const pieces = match[1].split('.');
  if (pieces.length !== 2) return null;
  const expected = createHmac('sha256', process.env.NINOCHKA_SESSION_SECRET).update(pieces[0]).digest('base64url');
  if (!equal(expected, pieces[1])) return null;
  try {
    const claim = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
    if (!['nina','volodymyr'].includes(claim.actor) || claim.expiresAt <= Date.now()) return null;
    return claim.actor;
  } catch { return null; }
}
function cleanItem(item) {
  if (!item || typeof item !== 'object') throw new Error('invalid_item');
  const id = String(item.id || '');
  const name = String(item.name || '').trim();
  const date = String(item.date || '');
  const amount = Number(item.amount);
  const currency = String(item.currency || '');
  const category = String(item.category || 'other');
  if (!/^[a-zA-Z0-9:_-]{4,120}$/.test(id) || !name || name.length > 120 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date ||
      !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000000 ||
      !CURRENCIES.has(currency) || !CATEGORIES.has(category)) throw new Error('invalid_item');
  return { id, name, date, amount, currency, category, status: 'pending' };
}
function seed() {
  const raw = process.env.NINOCHKA_INBOX_INITIAL_BATCH;
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > LIMIT) throw new Error('invalid_seed');
  const { eligible } = excludeUnsuccessful(data);
  const cleaned = eligible.map(cleanItem);
  if (new Set(cleaned.map(x => x.id)).size !== cleaned.length) throw new Error('duplicate_seed');
  return cleaned;
}
async function readFile(path) {
  const found = await get(path, { access: 'private', useCache: false });
  return found ? JSON.parse(await new Response(found.stream).text()) : null;
}
async function readInbox() {
  const data = await readFile(PATH);
  if (data) {
    if (!Number.isInteger(data.rev) || !Array.isArray(data.items)) throw new Error('invalid_inbox');
    return data;
  }
  return { rev: 0, items: seed() };
}
async function acquire() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = randomUUID();
    try {
      await put(LOCK, JSON.stringify({ id, timestamp: Date.now() }), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false
      });
      return id;
    } catch {
      const lock = await readFile(LOCK).catch(() => null);
      if (lock && Date.now() - Number(lock.timestamp) > 20000) {
        await del(LOCK).catch(() => {});
      }
      await new Promise(ok => setTimeout(ok, 100 + attempt * 25));
    }
  }
  throw new Error('inbox_busy');
}
async function mutate(fn) {
  const lockId = await acquire();
  try {
    const current = await readInbox();
    const result = fn(current);
    if (!result.changed) return { rev: current.rev, ...result };
    const next = { rev: current.rev + 1, items: result.items };
    await put(PATH, JSON.stringify(next), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false,
      allowOverwrite: current.rev > 0
    });
    return { rev: next.rev, ...result };
  } finally {
    const owned = await readFile(LOCK).catch(() => null);
    if (owned?.id === lockId) await del(LOCK).catch(() => {});
  }
}
export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return reply(res, 403, { error: 'origin_denied' });
  if (origin === ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') return origin === ORIGIN ? res.status(204).end() : reply(res, 403, { error: 'origin_denied' });
  try {
    if (req.method === 'POST') {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const authorizedImporter = Boolean(process.env.NINOCHKA_INBOX_INGEST_TOKEN &&
        equal(token, process.env.NINOCHKA_INBOX_INGEST_TOKEN));
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
        if (current.items.length + additions.length > LIMIT) throw new Error('queue_full');
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
      const result = await mutate(current => {
        let changed = false;
        const items = current.items.map(row => {
          if (chosen.has(row.id) && row.status === 'pending') {
            changed = true;
            return { ...row, status: 'imported', importedAt: new Date().toISOString(), importedBy: user };
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
