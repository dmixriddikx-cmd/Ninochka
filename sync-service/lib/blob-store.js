import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export class WriteConflict extends Error {}

export function retryableStorageError(error) {
  return error instanceof WriteConflict ||
    String(error?.constructor?.name || '').startsWith('Blob') ||
    ['TypeError', 'AbortError', 'TimeoutError'].includes(error?.name);
}
export async function storageRetry(attempt) {
  await new Promise(resolve => setTimeout(resolve, Math.min(800, 100 * 2 ** attempt)));
}

export function storagePath(path) {
  if (process.env.VERCEL_ENV !== 'preview') return path;
  // Each immutable preview has its own synthetic store, even if Vercel inherited
  // the production Blob token. Fail closed when deployment identity is missing.
  const deployment = process.env.VERCEL_URL;
  if (!deployment || !/^[a-zA-Z0-9.-]+$/.test(deployment)) throw new Error('preview_storage_not_isolated');
  return `previews/${deployment}/${path}`;
}

export async function readDocument(path) {
  // Compression can give GET a representation ETag that differs from Blob's
  // stored-object ETag. Conditional writes must use the identity representation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await get(storagePath(path), { access: 'private', useCache: false,
        headers: { 'accept-encoding': 'identity' }, abortSignal: AbortSignal.timeout(6000) });
      if (!result) return { data: null, etag: null };
      const etag = result.blob.etag;
      if (!etag) throw new Error('blob_etag_missing');
      return { data: JSON.parse(await new Response(result.stream).text()), etag };
    } catch (error) {
      if (attempt === 2 || !retryableStorageError(error)) throw error;
      await storageRetry(attempt);
    }
  }
}

export async function replaceDocument(path, snapshot, next) {
  try {
    await put(storagePath(path), JSON.stringify(next), {
      access: 'private', addRandomSuffix: false, contentType: 'application/json',
      ...(snapshot.etag ? { ifMatch: snapshot.etag } : { allowOverwrite: false })
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) throw new WriteConflict();
    // First-create races may be reported as a generic BlobError. Only classify
    // as a conflict when an actual competing document now exists; never overwrite.
    if (!snapshot.etag && (await readDocument(path)).data !== null) throw new WriteConflict();
    throw error;
  }
}
