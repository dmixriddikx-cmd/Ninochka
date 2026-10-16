import { createHmac, timingSafeEqual } from 'node:crypto';

// Never let a preview accept production family tokens, even if Vercel inherits
// production environment variables. Test credentials are provisioned separately.
export function sessionSecret() {
  return process.env.VERCEL_ENV === 'preview'
    ? process.env.NINOCHKA_PREVIEW_SESSION_SECRET
    : process.env.NINOCHKA_SESSION_SECRET;
}

// Single verifier for family sessions and restricted iPhone quick-expense tokens.
// A quick-expense token must never be accepted as a session (read/write) token.
export function signedActor(req, purpose = 'session') {
  const authorization = req?.headers?.authorization;
  const secret = sessionSecret();
  if (typeof authorization !== 'string' || authorization.length > 4096 || !secret) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
  if (!match) return null;
  const [ , payload, signature ] = match;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['nina', 'volodymyr'].includes(claim.actor) ||
        !Number.isFinite(claim.expiresAt) || claim.expiresAt <= Date.now()) return null;
    const authorizedPurpose = purpose === 'session'
      ? claim.purpose === undefined || claim.purpose === 'session'
      : claim.purpose === purpose;
    return authorizedPurpose ? claim.actor : null;
  } catch {
    return null;
  }
}
