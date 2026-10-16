import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export class WriteConflict extends Error {}

export function storagePath(path) {
  if (process.env.VERCEL_ENV !== 'preview') return path;
  // Each immutable preview has its own synthetic store, even if Vercel inherited
  // the production Blob token. Fail closed when deployment identity is missing.
  const deployment = process.env.VERCEL_URL;
  if (!deployment || !/^[a-zA-Z0-9.-]+$/.test(deployment)) throw new Error('preview_storage_not_isolated');
  return `previews/${deployment}/${path}`;
}

export async function readDocument(path) {
  const result = await get(storagePath(path), { access: 'private', useCache: false });
  if (!result) return { data: null, etag: null };
  const etag = result.blob.etag;
  if (!etag) throw new Error('blob_etag_missing');
  return { data: JSON.parse(await new Response(result.stream).text()), etag };
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
