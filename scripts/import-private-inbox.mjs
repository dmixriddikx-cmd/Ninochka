#!/usr/bin/env node
// Import a PRIVATE bank expense batch into VNN cloud staging, not directly into the budget.
// Do not commit actual customer bank data or API tokens to GitHub.
// Default mode validates only. Use --commit once the cloud backend is authorized.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function validateBatch(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length || data.items.length > 50)
    throw new Error('Expected a nonempty items array (max 50).');
  const ids = new Set();
  const currencies = new Set(['USD','EUR','UAH','MDL']);
  const categories = new Set(['products','transport','clothes','leisure','other','household','health','gifts']);
  for (const row of data.items) {
    if (!row || typeof row !== 'object' || !/^[A-Za-z0-9:_-]{4,120}$/.test(row.id || '') ||
        ids.has(row.id) || !String(row.name || '').trim() ||
        !currencies.has(row.currency) || !categories.has(row.category) ||
        !Number.isSafeInteger(row.amount) || row.amount <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date || ''))
      throw new Error('Invalid item, duplicate ID, currency, amount, category, or date');
    const date = new Date(row.date + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== row.date)
      throw new Error('Nonexistent calendar date in private bank batch');
    ids.add(row.id);
  }
  return data.items;
}
export { validateBatch };

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) {
    process.stdout.write('Usage: node scripts/import-private-inbox.mjs PATH_TO_PRIVATE_PAYLOAD.json [--commit]\n');
    process.stdout.write('For --commit, set VNN_INBOX_BASE_URL and VNN_INBOX_INGEST_TOKEN in environment.\n');
    return;
  }
  const file = args.find(arg => !arg.startsWith('--'));
  if (!file || args.some(arg => arg.startsWith('--') && arg !== '--commit'))
    throw new Error('Unknown argument; see --help');
  const rows = validateBatch(JSON.parse(await readFile(file, 'utf8')));
  const totals = {};
  for (const item of rows) totals[item.currency] = (totals[item.currency] || 0) + item.amount;
  process.stdout.write(JSON.stringify({validation:'VERIFIED_LOCAL',count:rows.length,totalsMinorUnits:totals})+'\n');
  if (!args.includes('--commit')) return;

  const url = process.env.VNN_INBOX_BASE_URL;
  const token = process.env.VNN_INBOX_INGEST_TOKEN;
  if (!url || !/^https:\/\/[^/]+\/?$/.test(url) || !token)
    throw new Error('Cannot commit: missing valid HTTPS VNN_INBOX_BASE_URL or secret VNN_INBOX_INGEST_TOKEN');
  const response = await fetch(url.replace(/\/$/,'')+'/api/inbox', {
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({items:rows}),
    signal:AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error('VNN inbox refused import ('+response.status+'): '+String(result.error || 'unknown'));
  const accepted = Number(result.accepted), duplicates = Number(result.duplicates);
  if (!Number.isSafeInteger(accepted) || !Number.isSafeInteger(duplicates) ||
      accepted+duplicates !== rows.length) throw new Error('Cloud acknowledgement did not reconcile with batch length');
  process.stdout.write(JSON.stringify({status:'STAGED_ACKNOWLEDGED',accepted,duplicates,rev:result.rev})+'\n');
  // Account login is independent. The user must still confirm transactions in VNN.
  const session = process.env.VNN_FAMILY_SESSION_TOKEN;
  if (!session) {
    process.stdout.write('Cloud readback NOT VERIFIED (no VNN_FAMILY_SESSION_TOKEN). No budget debit was requested.\n');
    return;
  }
  const readback = await fetch(url.replace(/\/$/,'')+'/api/inbox',{
    headers:{Authorization:'Bearer '+session},
    signal:AbortSignal.timeout(20000)
  });
  const body=await readback.json().catch(()=>({}));
  if (!readback.ok || !Array.isArray(body.items))
    throw new Error('Cloud readback failed: cannot claim VERIFIED');
  const pending = new Set(body.items.map(item=>item.id));
  const allPending = rows.filter(row=>pending.has(row.id)).length;
  process.stdout.write(JSON.stringify({status:'CLOUD_READBACK',pendingFound:allPending,totalBatch:rows.length,
    note:'Previously imported transactions may be absent from pending; compare the family budget before concluding they are missing.'})+'\n');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err=>{console.error(String(err?.message||err));process.exitCode=1;});
}
