import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signedActor } from './sync-service/lib/token-auth.js';

const old = process.env.NINOCHKA_SESSION_SECRET;
process.env.NINOCHKA_SESSION_SECRET = 'VNN-token-scope-test-only';
function sign(claim) {
  const body = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const mac = createHmac('sha256', process.env.NINOCHKA_SESSION_SECRET)
    .update(body).digest('base64url');
  return body + '.' + mac;
}
function req(token) { return { headers: { authorization: 'Bearer ' + token } }; }

try {
  const validUntil = Date.now() + 3600000;
  const regular = sign({ actor: 'nina', expiresAt: validUntil });
  const explicit = sign({ actor: 'volodymyr', purpose: 'session', expiresAt: validUntil });
  const shortcut = sign({ actor: 'nina', purpose: 'quick-expense', expiresAt: validUntil });
  assert.equal(signedActor(req(regular), 'session'), 'nina');
  assert.equal(signedActor(req(explicit), 'session'), 'volodymyr');
  assert.equal(signedActor(req(shortcut), 'quick-expense'), 'nina',
    'Apple Shortcut must accept an ordinary Bearer header');
  assert.equal(signedActor(req(shortcut), 'session'), null,
    'a quick token must not access shared-budget or inbox session routes');
  assert.equal(signedActor(req(regular), 'quick-expense'), null,
    'a normal session must not be treated as a shortcut credential');
  assert.equal(signedActor(req(shortcut.replace(/.$/, 'x')), 'quick-expense'), null);
  assert.equal(signedActor(req(sign({ actor: 'nina', purpose: 'quick-expense', expiresAt: Date.now() - 1 })), 'quick-expense'), null);
  assert.equal(signedActor(req(sign({ actor: 'admin', expiresAt: validUntil })), 'session'), null);
  assert.equal(signedActor(req(sign({ actor: 'nina', expiresAt: 'never' })), 'session'), null);
  assert.equal(signedActor({ headers: { authorization: 'Basic something' } }), null);
  assert.equal(signedActor({ headers: { authorization: 'Bearer' } }), null);
  assert.equal(signedActor(req(shortcut + '.extra'), 'quick-expense'), null);
  delete process.env.NINOCHKA_SESSION_SECRET;
  assert.equal(signedActor(req(regular)), null);
  console.log('VNN token scope regression PASS: iPhone quick-add allowed; session, inbox and screenshot credentials isolated');
} finally {
  if (old === undefined) delete process.env.NINOCHKA_SESSION_SECRET;
  else process.env.NINOCHKA_SESSION_SECRET = old;
}
