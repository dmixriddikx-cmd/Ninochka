import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { del, get, put } from '@vercel/blob';

const ORIGIN = 'https://dmixriddikx-cmd.github.io';
const DATA_PATH = 'family-budget.json';
const LOCK_PATH = 'family-budget.lock';
const MAX_BYTES = 1024 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function validBudget(data) {
  return data?.schemaVersion === 4 && Array.isArray(data.months) &&
    data.storage && typeof data.storage === 'object';
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
  const candidates = normalized === 'нина'
    ? [['nina', process.env.NINA_CREDENTIAL_SHA256]]
    : normalized === 'вова'
      ? [['volodymyr', process.env.VOLODYMYR_CREDENTIAL_SHA256]]
      : [];
  for (const [actor, expected] of candidates) {
    if (safeHexEqual(actual, expected)) return actor;
  }
  return null;
}

function signSession(actor) {
  const secret = process.env.NINOCHKA_SESSION_SECRET;
  if (!secret) throw new Error('Session secret is not configured');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ actor, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt };
}

function actorFromSession(req) {
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return null;
  const secret = process.env.NINOCHKA_SESSION_SECRET;
  if (!secret) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['nina', 'volodymyr'].includes(parsed.actor) || Number(parsed.expiresAt) <= Date.now()) return null;
    return parsed.actor;
  } catch {
    return null;
  }
}

async function streamText(stream) {
  return new Response(stream).text();
}

async function readJsonBlob(path) {
  const result = await get(path, { access: 'private', useCache: false });
  if (!result) return null;
  return JSON.parse(await streamText(result.stream));
}

async function readBudget() {
  const envelope = await readJsonBlob(DATA_PATH);
  if (!envelope) return { rev: 0, data: null, updatedAt: null, updatedBy: null };
  if (!Number.isInteger(envelope.rev) || envelope.rev < 1 || !validBudget(envelope.data)) {
    throw new Error('Shared budget is invalid');
  }
  return envelope;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function acquireLock() {
  const id = randomUUID();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await put(LOCK_PATH, JSON.stringify({ id, createdAt: Date.now() }), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json'
      });
      return id;
    } catch {
      try {
        const lock = await readJsonBlob(LOCK_PATH);
        if (lock?.createdAt && Date.now() - Number(lock.createdAt) > 15000) {
          await del(LOCK_PATH);
          continue;
        }
      } catch {
        // Another request may have released the lock between operations.
      }
      await sleep(120);
    }
  }
  return null;
}

async function releaseLock() {
  try { await del(LOCK_PATH); } catch {}
}

async function writeBudget(actor, expectedRev, data) {
  const lockId = await acquireLock();
  if (!lockId) return { busy: true };

  try {
    const current = await readBudget();
    if (Number(expectedRev) !== Number(current.rev)) {
      return { conflict: true, current };
    }

    if (current.data) {
      await put(
        `history/${Date.now()}-${current.rev}-${actor}-${randomUUID()}.json`,
        JSON.stringify({ ...current, archivedAt: new Date().toISOString(), archivedBy: actor }),
        { access: 'private', addRandomSuffix: false, contentType: 'application/json' }
      );
    }

    const next = {
      rev: current.rev + 1,
      data,
      updatedAt: new Date().toISOString(),
      updatedBy: actor
    };
    await put(DATA_PATH, JSON.stringify(next), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: Boolean(current.data),
      contentType: 'application/json'
    });
    return next;
  } finally {
    await releaseLock();
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin !== ORIGIN) return send(res, 403, { error: 'origin_denied' });
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const { action, login, pin } = req.body || {};
    if (action !== 'login') return send(res, 400, { error: 'invalid_action' });
    const actor = actorFromCredentials(login, pin);
    if (!actor) return send(res, 401, { error: 'invalid_credentials' });
    const session = signSession(actor);
    return send(res, 200, { actor, token: session.token, expiresAt: session.expiresAt });
  }

  if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { error: 'method_not_allowed' });
  const actor = actorFromSession(req);
  if (!actor) return send(res, 401, { error: 'invalid_session' });

  try {
    if (req.method === 'GET') {
      const current = await readBudget();
      return send(res, 200, { ...current, actor });
    }

    const { rev, data } = req.body || {};
    const serialized = JSON.stringify(data);
    if (!Number.isInteger(Number(rev)) || Number(rev) < 0 || !validBudget(data) || Buffer.byteLength(serialized) > MAX_BYTES) {
      return send(res, 400, { error: 'invalid_budget' });
    }

    const result = await writeBudget(actor, Number(rev), data);
    if (result.busy) return send(res, 503, { error: 'sync_busy' });
    if (result.conflict) return send(res, 409, { error: 'revision_conflict', ...result.current });
    return send(res, 200, { rev: result.rev, actor, updatedAt: result.updatedAt });
  } catch (error) {
    console.error('Ninochka sync:', error?.message || error);
    return send(res, 503, { error: 'sync_unavailable' });
  }
}
