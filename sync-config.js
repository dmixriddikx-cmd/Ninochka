// The NEW VNN uses only its own same-origin backend. Never connect to the old API.
// GitHub Pages cannot host the API; sync stays disabled there until an isolated
// backend/origin is available. This deliberately fails closed.
const host = globalThis.location?.hostname || '';
globalThis.NINOCHKA_SYNC_API = host && !host.endsWith('.github.io') &&
  (host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1')
  ? globalThis.location.origin : '';
