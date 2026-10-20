import test from 'node:test';
import assert from 'node:assert/strict';
import { browserOrigin } from '../lib/browser-origin.js';

function request({ method = 'GET', origin, host, site, referer } = {}) {
  return {
    method,
    headers: {
      ...(origin === undefined ? {} : { origin }),
      ...(host === undefined ? {} : { host }),
      ...(site === undefined ? {} : { 'sec-fetch-site': site }),
      ...(referer === undefined ? {} : { referer })
    }
  };
}

async function previewEnv(fn) {
  const before = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL
  };
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'ninochka-sync-exact-owner.vercel.app';
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('GitHub Pages is the only permanent browser origin', () => {
  assert.equal(browserOrigin(request({ origin: 'https://dmixriddikx-cmd.github.io' })),
    'https://dmixriddikx-cmd.github.io');
  assert.equal(browserOrigin(request({ origin: 'https://dmixriddikx-cmd.github.io.evil.example' })), null);
});

test('preview accepts only its exact immutable VERCEL_URL origin', async () => {
  await previewEnv(() => {
    const exact = 'https://ninochka-sync-exact-owner.vercel.app';
    assert.equal(browserOrigin(request({ origin: exact })), exact);
    assert.equal(browserOrigin(request({ origin: 'https://other.vercel.app' })), null);
    assert.equal(browserOrigin(request({ origin: 'https://ninochka-sync-exact-owner.vercel.app.evil.example' })), null);
  });
});

test('same-origin preview GET without Origin requires fetch metadata and exact Referer', async () => {
  await previewEnv(() => {
    const exact = 'https://ninochka-sync-exact-owner.vercel.app';
    const base = {
      host: 'ninochka-sync-exact-owner.vercel.app',
      site: 'same-origin',
      referer: exact + '/app'
    };
    assert.equal(browserOrigin(request(base)), exact);
    assert.equal(browserOrigin(request({ ...base, referer: 'https://other.vercel.app/app' })), null);
    assert.equal(browserOrigin(request({ ...base, host: 'other.vercel.app' })), null);
    assert.equal(browserOrigin(request({ ...base, site: 'cross-site' })), null);
    assert.equal(browserOrigin(request({ ...base, method: 'POST' })), null);
  });
});

test('direct address-bar navigation remains denied without exact Referer', async () => {
  await previewEnv(() => {
    assert.equal(browserOrigin(request({
      host: 'ninochka-sync-exact-owner.vercel.app',
      site: 'same-origin'
    })), null);
  });
});

test('malformed VERCEL_URL can never create an allowed origin', async () => {
  await previewEnv(() => {
    process.env.VERCEL_URL = 'ninochka-sync.vercel.app/attacker';
    assert.equal(browserOrigin(request({ origin: 'https://ninochka-sync.vercel.app/attacker' })), null);
  });
});
