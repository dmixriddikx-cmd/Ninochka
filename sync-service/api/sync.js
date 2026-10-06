import { createHash, timingSafeEqual } from 'node:crypto';

const ORIGIN = 'https://dmixriddikx-cmd.github.io';
const PATH = '/family-budget.json'; // Relative to the dedicated Dropbox app folder.
const MAX_BYTES = 1024 * 1024;

function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function actorFor(req) {
  const token = /^Bearer (\S{24,})$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return null;
  const actual = createHash('sha256').update(token).digest();
  for (const [actor, key] of [['nina', 'NINA_KEY_SHA256'], ['volodymyr', 'VOLODYMYR_KEY_SHA256']]) {
    const expected = process.env[key];
    if (/^[a-f0-9]{64}$/i.test(expected || '') && timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return actor;
  }
  return null;
}

async function dropboxToken() {
  const { DROPBOX_APP_KEY: key, DROPBOX_APP_SECRET: secret, DROPBOX_REFRESH_TOKEN: refresh } = process.env;
  if (!key || !secret || !refresh) throw new Error('Dropbox is not configured');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: key, client_secret: secret });
  const response = await fetch('https://api.dropbox.com/oauth2/token', { method: 'POST', body });
  if (!response.ok) throw new Error('Dropbox authorization failed');
  const data = await response.json();
  return data.access_token;
}

async function readBudget(token) {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: PATH }) }
  });
  if (response.status === 409) {
    const failure = await response.json().catch(() => ({}));
    if (failure?.error?.['.tag'] === 'path' && failure?.error?.path?.['.tag'] === 'not_found') return { rev: null, data: null };
    throw new Error('Dropbox read conflict');
  }
  if (!response.ok) throw new Error(`Dropbox read failed (${response.status})`);
  const metadata = JSON.parse(response.headers.get('dropbox-api-result') || '{}');
  const data = await response.json();
  if (!metadata.rev || data?.version !== 4 || !Array.isArray(data.months)) throw new Error('Shared budget is invalid');
  return { rev: metadata.rev, data };
}

async function writeBudget(token, rev, data) {
  const args = { path: PATH, mode: rev ? { '.tag': 'update', update: rev } : 'add', autorename: false, mute: true };
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify(args) },
    body: JSON.stringify(data)
  });
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new Error(`Dropbox write failed (${response.status})`);
  const metadata = await response.json();
  if (!metadata.rev) throw new Error('Dropbox did not return a revision');
  return { rev: metadata.rev };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin !== ORIGIN) return send(res, 403, { error: 'origin_denied' });
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const actor = actorFor(req);
  if (!actor) return send(res, 401, { error: 'invalid_access_key' });
  if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { error: 'method_not_allowed' });
  try {
    const token = await dropboxToken();
    if (req.method === 'GET') return send(res, 200, { ...(await readBudget(token)), actor });
    const { rev, data } = req.body || {};
    if (!(rev === null || typeof rev === 'string') || !data || data.version !== 4 || !Array.isArray(data.months) || Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) {
      return send(res, 400, { error: 'invalid_budget' });
    }
    const result = await writeBudget(token, rev, data);
    if (result.conflict) return send(res, 409, { error: 'revision_conflict', ...(await readBudget(token)) });
    return send(res, 200, { rev: result.rev, actor });
  } catch (error) {
    console.error('Ninochka sync:', error.message);
    return send(res, 503, { error: 'sync_unavailable' });
  }
}
