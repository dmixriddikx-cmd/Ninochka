import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from './sync.js';

const access = 'ninochka-test-key-with-enough-entropy';
const origin = 'https://dmixriddikx-cmd.github.io';
const budget = { schemaVersion: 4, months: [], storage: { balance: 0, currency: 'EUR', history: [] } };

function response(headers, method, body) {
  const result = { statusCode: 200, headers: {}, body: null, ended: false };
  const res = {
    status(code) { result.statusCode = code; return this; },
    setHeader(key, value) { result.headers[key] = value; return this; },
    json(value) { result.body = value; return this; },
    end() { result.ended = true; return this; }
  };
  return handler({ headers, method, body }, res).then(() => result);
}

test('authenticates both people and rejects other origins', async () => {
  process.env.NINA_KEY_SHA256 = createHash('sha256').update(access).digest('hex');
  const denied = await response({ origin: 'https://evil.example', authorization: `Bearer ${access}` }, 'GET');
  assert.equal(denied.statusCode, 403);
  const unknown = await response({ origin, authorization: 'Bearer wrong-key-with-enough-entropy' }, 'GET');
  assert.equal(unknown.statusCode, 401);
});

test('first write and revision conflict preserve the existing budget', async () => {
  process.env.NINA_KEY_SHA256 = createHash('sha256').update(access).digest('hex');
  process.env.DROPBOX_APP_KEY = 'app';
  process.env.DROPBOX_APP_SECRET = 'secret';
  process.env.DROPBOX_REFRESH_TOKEN = 'refresh';
  let remote = null, rev = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'test-access' }), { status: 200 });
    if (url.includes('/files/download')) {
      if (!remote) return new Response(JSON.stringify({ error: { '.tag': 'path', path: { '.tag': 'not_found' } } }), { status: 409 });
      return new Response(JSON.stringify(remote), { status: 200, headers: { 'dropbox-api-result': JSON.stringify({ rev: String(rev) }) } });
    }
    const args = JSON.parse(options.headers['Dropbox-API-Arg']);
    if ((args.mode === 'add' && remote) || (args.mode?.update && args.mode.update !== String(rev))) return new Response('{}', { status: 409 });
    remote = JSON.parse(options.body); rev++;
    return new Response(JSON.stringify({ rev: String(rev) }), { status: 200 });
  };
  try {
    const headers = { origin, authorization: `Bearer ${access}` };
    const first = await response(headers, 'PUT', { rev: null, data: budget });
    assert.equal(first.body.rev, '1');
    const conflict = await response(headers, 'PUT', { rev: null, data: { ...budget, storage: { balance: 999 } } });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.rev, '1');
    assert.equal(conflict.body.data.storage.balance, 0);
    const updated = await response(headers, 'PUT', { rev: '1', data: { ...budget, storage: { balance: 42 } } });
    assert.equal(updated.body.rev, '2');
    assert.equal(remote.storage.balance, 42);
  } finally { globalThis.fetch = originalFetch; }
});

test('rejects a payload that does not use the application schema', async () => {
  process.env.NINA_KEY_SHA256 = createHash('sha256').update(access).digest('hex');
  process.env.DROPBOX_APP_KEY = 'app';
  process.env.DROPBOX_APP_SECRET = 'secret';
  process.env.DROPBOX_REFRESH_TOKEN = 'refresh';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'test-access' }), { status: 200 });
  try {
    const result = await response({ origin, authorization: `Bearer ${access}` }, 'PUT', {
      rev: null,
      data: { version: 4, months: [], storage: { balance: 0 } }
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error, 'invalid_budget');
  } finally { globalThis.fetch = originalFetch; }
});
