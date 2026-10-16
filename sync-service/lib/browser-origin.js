export function browserOrigin(req) {
  const origin = req.headers.origin;
  if (origin === 'https://dmixriddikx-cmd.github.io') return origin;
  // Only the exact immutable preview may host the existing frontend for QA.
  // Never accept arbitrary vercel.app subdomains or a client-provided hostname.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL &&
      /^[a-zA-Z0-9.-]+$/.test(process.env.VERCEL_URL)) {
    const preview = 'https://' + process.env.VERCEL_URL;
    if (origin === preview) return origin;
    // Same-origin browser GETs omit Origin. Require browser fetch metadata,
    // the exact deployment Host and an exact-origin Referer before accepting
    // this case. Session verification still gates every budget/inbox read.
    if (!origin && req.method === 'GET' &&
        req.headers['sec-fetch-site'] === 'same-origin' &&
        req.headers.host === process.env.VERCEL_URL) {
      try { if (new URL(req.headers.referer).origin === preview) return preview; }
      catch { /* Missing or malformed Referer: fail closed. */ }
    }
  }
  return null;
}
