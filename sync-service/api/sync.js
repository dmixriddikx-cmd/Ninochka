import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';
import { readDocument, replaceDocument, storagePath, WriteConflict, retryableStorageError, storageRetry } from '../lib/blob-store.js';
import { applyQuickExpense, QuickError } from '../lib/quick-entry.js';
import { signedActor, sessionSecret } from '../lib/token-auth.js';
import { browserOrigin } from '../lib/browser-origin.js';

const DATA_PATH = 'family-budget.json';
const MAX_BYTES = 1024 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QUICK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function validBudget(data) {
  const currencies = ['EUR', 'USD', 'MDL', 'UAH'];
  const money = (item, signed = false) => item && Number.isSafeInteger(item.amount) &&
    (signed || item.amount >= 0) && currencies.includes(item.currency) &&
    (item.rate == null || (Number.isFinite(item.rate) && item.rate > 0));
  return data?.schemaVersion === 4 && Array.isArray(data.months) &&
    new Set(data.months.map(m => m?.id)).size === data.months.length &&
    data.storage && Number.isSafeInteger(data.storage.balance) &&
    currencies.includes(data.storage.currency) && Array.isArray(data.storage.history) &&
    data.months.every(m => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.id) &&
      Array.isArray(m.weeks) && m.weeks.length === 4 &&
      new Set(m.weeks.map(w => w?.id)).size === 4 &&
      m.weeks.every(w => w && [1,2,3,4].includes(w.id) &&
        ['open','closed'].includes(w.status) && money(w.fund) &&
        Number.isSafeInteger(w.settlement) && Array.isArray(w.expenses) &&
        w.expenses.every(item => money(item, true))));
}

function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function normalizeLogin(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function hashCredential(login, pin) {
  return createHash('sha256').update(`${normalizeLogin(login)}\0${String(pin || '')}`).digest('hex');
}

function safeHexEqual(actualHex, expectedHex) {
  if (!/^[a-f0-9]{64}$/i.test(actualHex || '') || !/^[a-f0-9]{64}$/i.test(expectedHex || '')) return false;
  return timingSafeEqual(Buffer.from(actualHex, 'hex'), Buffer.from(expectedHex, 'hex'));
}

function actorFromCredentials(login, pin) {
  const normalized = normalizeLogin(login);
  const actual = hashCredential(normalized, pin);
  const prefix = process.env.VERCEL_ENV === 'preview' ? 'NINOCHKA_PREVIEW_' : '';
  const candidates = normalized === 'нина'
    ? [['nina', process.env[prefix + 'NINA_CREDENTIAL_SHA256']]]
    : normalized === 'вова'
      ? [['volodymyr', process.env[prefix + 'VOLODYMYR_CREDENTIAL_SHA256']]]
      : [];
  for (const [actor, expected] of candidates) {
    if (safeHexEqual(actual, expected)) return actor;
  }
  return null;
}

function signSession(actor) {
  const secret = sessionSecret();
  if (!secret) throw new Error('Session secret is not configured');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ actor, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt };
}

const actorFromSession = req => signedActor(req, 'session');

// Shortcuts get an individually issued, restricted token: it cannot read the family
// budget, change settings, or authenticate as a normal VNN web session.
function issueQuickToken(actor) {
  const expiresAt = Date.now() + QUICK_TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    purpose: 'quick-expense', actor, expiresAt, nonce: randomUUID()
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret())
    .update(payload).digest('base64url');
  return { token: payload + '.' + signature, expiresAt };
}

const actorFromQuickToken = req => signedActor(req, 'quick-expense');

async function readBudgetSnapshot() {
  const snapshot = await readDocument(DATA_PATH);
  const envelope = snapshot.data;
  if (!envelope) return { ...snapshot, data: { rev: 0, data: null, updatedAt: null, updatedBy: null } };
  if (!Number.isInteger(envelope.rev) || envelope.rev < 1 || !validBudget(envelope.data)) {
    throw new Error('Shared budget is invalid');
  }
  return snapshot;
}
async function readBudget() { return (await readBudgetSnapshot()).data; }

async function commitBudget(snapshot, actor, data) {
  const current = snapshot.data;
  if (current.data) {
    await put(storagePath(`history/${Date.now()}-${current.rev}-${actor}-${randomUUID()}.json`),
      JSON.stringify({ ...current, archivedAt: new Date().toISOString(), archivedBy: actor }),
      { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
  }
  const next = { rev: current.rev + 1, data,
    updatedAt: new Date().toISOString(), updatedBy: actor };
  await replaceDocument(DATA_PATH, snapshot, next);
  return next;
}
async function writeBudget(actor, expectedRev, data) {
  const snapshot = await readBudgetSnapshot();
  if (expectedRev !== snapshot.data.rev) return { conflict: true, current: snapshot.data };
  try { return await commitBudget(snapshot, actor, data); }
  catch (error) {
    if (!(error instanceof WriteConflict)) throw error;
    return { conflict: true, current: await readBudget() };
  }
}
async function writeQuickBudget(actor, payload) {
  // Recompute against the winning revision; never retry an unconditional overwrite.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
    const snapshot = await readBudgetSnapshot();
    const current = snapshot.data;
    if (!current.data) throw new QuickError('budget_not_initialized', 409);
    const draft = structuredClone(current.data);
    const result = applyQuickExpense(draft, actor, payload);
    if (result.duplicate) return { duplicate: true, rev: current.rev };
    if (Buffer.byteLength(JSON.stringify(draft)) > MAX_BYTES) throw new QuickError('budget_too_large', 409);
      const next = await commitBudget(snapshot, actor, draft);
      return { duplicate: false, rev: next.rev, monthId: result.monthId,
        weekId: result.weekId, currency: result.row.currency, amountMinor: result.row.amount };
    } catch (error) {
      if (!retryableStorageError(error)) throw error;
      if (attempt < 4) await storageRetry(attempt);
    }
  }
  return { busy: true };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const ORIGIN = browserOrigin(req);
  const action = req.body?.action;
  // An iOS Shortcut sends no Origin header; accept only a signed, quick-add POST.
  // All other endpoints retain the existing same-origin browser restriction.
  const shortcutCall = !origin && req.method === 'POST' && action === 'quick-add';
  if (!ORIGIN && !shortcutCall) return send(res, 403, { error: 'origin_denied' });
  if (ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    if (action === 'login') {
      const actor = actorFromCredentials(req.body?.login, req.body?.pin);
      if (!actor) return send(res, 401, { error: 'invalid_credentials' });
      if (!sessionSecret()) return send(res, 503, { error: 'login_not_configured' });
      const session = signSession(actor);
      return send(res, 200, { actor, token: session.token, expiresAt: session.expiresAt });
    }
    if (action === 'quick-token') {
      const actor = actorFromSession(req);
      if (!actor) return send(res, 401, { error: 'invalid_session' });
      return send(res, 200, issueQuickToken(actor));
    }
    if (action === 'quick-add') {
      const actor = actorFromQuickToken(req);
      if (!actor) return send(res, 401, { error: 'invalid_quick_token' });
      try {
        const result = await writeQuickBudget(actor, req.body);
        if (result.busy) return send(res, 503, { error: 'sync_busy' });
        return send(res, 200, { saved: true, ...result });
      } catch (error) {
        if (error instanceof QuickError)
          return send(res, error.status, { error: error.message });
        console.error('Quick expense unavailable');
        return send(res, 503, { error: 'quick_unavailable' });
      }
    }
    return send(res, 400, { error: 'invalid_action' });
  }

  if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { error: 'method_not_allowed' });
  const actor = actorFromSession(req);
  if (!actor) return send(res, 401, { error: 'invalid_session' });

  try {
    if (req.method === 'GET') {
      const current = await readBudget();
      return send(res, 200, { ...current, actor,
        environment: process.env.VERCEL_ENV || 'development',
        ...(process.env.VERCEL_ENV === 'preview' ? { storageNamespace: storagePath('') } : {}) });
    }

    const { rev, data } = req.body || {};
    const serialized = JSON.stringify(data);
    if (!Number.isSafeInteger(rev) || rev < 0 || !validBudget(data) || Buffer.byteLength(serialized) > MAX_BYTES) {
      return send(res, 400, { error: 'invalid_budget' });
    }

    const result = await writeBudget(actor, Number(rev), data);
    if (result.busy) return send(res, 503, { error: 'sync_busy' });
    if (result.conflict) return send(res, 409, { error: 'revision_conflict', ...result.current });
    return send(res, 200, { rev: result.rev, actor, updatedAt: result.updatedAt });
  } catch (error) {
    console.error('Ninochka sync unavailable');
    return send(res, 503, { error: 'sync_unavailable' });
  }
}
