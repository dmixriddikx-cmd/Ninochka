import { createHash } from 'node:crypto';
import { del, get, list, put } from '@vercel/blob';
import { actorFromSession } from './sync.js';

const ORIGIN = 'https://dmixriddikx-cmd.github.io';
const PREFIX = 'expense-inbox/';
const MAX_ITEMS = 50;
const MAX_BATCH_BYTES = 32000;

function respond(res, code, body) {
  return res.status(code).setHeader('Cache-Control', 'no-store').json(body);
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === date;
}
function normalizeBatch(input) {
  if (!input || !Array.isArray(input.rows) || !input.rows.length || input.rows.length > MAX_ITEMS) throw Error('invalid_rows');
  const seen = new Set();
  const rows = input.rows.map((r,i) => {
    const name = String(r.name || '').trim().slice(0,120);
    const sourceId = String(r.sourceId || '').trim().slice(0,128);
    const amount = String(r.amount || '').trim().replace(',', '.');
    const currency = String(r.currency || '');
    const category = String(r.category || 'other');
    const date = String(r.date || '');
    if (!name || !sourceId || seen.has(sourceId) ||
        !/^\d{1,9}\.\d{2}$/.test(amount) || Number(amount) <= 0 ||
        !['EUR','USD','MDL','UAH'].includes(currency) ||
        !['products','transport','clothes','leisure','other'].includes(category) ||
        !validDate(date)) throw Error('invalid_row_' + (i+1));
    seen.add(sourceId);
    return { sourceId, name, amount, currency, category, date,
      note: String(r.note || '').trim().slice(0,160) };
  });
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,32);
  const supplied = String(input.batchId || '').trim();
  const batchId = /^[a-zA-Z0-9_-]{12,80}$/.test(supplied) ? supplied : fingerprint;
  const batch = { version:1, batchId, rows, createdAt:new Date().toISOString(), source:'chatgpt', count:rows.length };
  if (Buffer.byteLength(JSON.stringify(batch)) > MAX_BATCH_BYTES) throw Error('batch_too_large');
  return batch;
}
function pathFor(id) {
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(id || ''))) return null;
  return PREFIX + id + '.json';
}
async function readBatch(path) {
  const result = await get(path, { access:'private', useCache:false });
  return result ? JSON.parse(await new Response(result.stream).text()) : null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== ORIGIN) return respond(res,403,{error:'origin_denied'});
  if (origin === ORIGIN) res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // No shared or hard-coded bank secret: this endpoint uses the existing family login.
  const actor = actorFromSession(req);
  if (!actor) return respond(res,401,{error:'invalid_session'});
  try {
    if (req.method === 'POST') {
      const batch = normalizeBatch(req.body);
      const path = pathFor(batch.batchId);
      const existing = await readBatch(path);
      if (existing) {
        if (JSON.stringify(existing.rows) !== JSON.stringify(batch.rows)) return respond(res,409,{error:'batch_id_collision'});
        return respond(res,200,{batchId:batch.batchId, count:existing.rows.length, alreadyExists:true});
      }
      await put(path,JSON.stringify({...batch,submittedBy:actor}),{
        access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'
      });
      const verified = await readBatch(path);
      if (!verified || verified.batchId !== batch.batchId || verified.rows.length !== batch.rows.length)
        return respond(res,503,{error:'inbox_write_unverified'});
      return respond(res,201,{batchId:batch.batchId,count:verified.rows.length,verified:true});
    }
    if (req.method === 'GET') {
      const result = await list({prefix:PREFIX,limit:100});
      const batches = [];
      for (const item of (result.blobs || []).slice(0,50)) {
        const batch = await readBatch(item.pathname);
        if (batch?.version === 1 && Array.isArray(batch.rows)) batches.push(batch);
      }
      batches.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      return respond(res,200,{batches,actor});
    }
    if (req.method === 'DELETE') {
      const path = pathFor(req.query?.batchId);
      if (!path) return respond(res,400,{error:'invalid_batch_id'});
      await del(path);
      return respond(res,200,{deleted:true,batchId:req.query.batchId});
    }
    return respond(res,405,{error:'method_not_allowed'});
  } catch(err) {
    console.error('Expense inbox:',err?.message || err);
    return respond(res,503,{error:'inbox_unavailable'});
  }
}
