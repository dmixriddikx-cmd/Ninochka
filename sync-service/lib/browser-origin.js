export function browserOrigin(req) {
  const origin = req.headers.origin;
  if (origin === 'https://dmixriddikx-cmd.github.io') return origin;
  // Only the exact immutable preview may host the existing frontend for QA.
  // Never accept arbitrary vercel.app subdomains or a client-provided hostname.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL &&
      /^[a-zA-Z0-9.-]+$/.test(process.env.VERCEL_URL) &&
      origin === 'https://' + process.env.VERCEL_URL) return origin;
  return null;
}
