// Guarded one-time legacy -> generation-2 budget copy. Does not run on deployment.
// Requires a separately verified encrypted family backup and a matching private
// legacy budget hash. Never migrates the inbox or applies expenses.
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export class MigrationBlocked extends Error {}
const LEGACY = 'family-budget.json';
const NEXT = 'generation-2/family-budget.json';
const CURRENCIES = new Set(['EUR', 'USD', 'MDL', 'UAH']);

function blocked(message) { throw new MigrationBlocked(message); }
function validEnvelope(envelope) {
  if (!envelope || !Number.isSafeInteger(envelope.rev) || envelope.rev < 1 ||
      !envelope.data || envelope.data.schemaVersion !== 4 ||
      !Array.isArray(envelope.data.months) || !envelope.data.storage ||
      !Number.isSafeInteger(envelope.data.storage.balance) ||
      !CURRENCIES.has(envelope.data.storage.currency) ||
      !Array.isArray(envelope.data.storage.history)) return false;
  const months = envelope.data.months;
  if (new Set(months.map(m => m?.id)).size !== months.length) return false;
  return months.every(m => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.id) &&
    Array.isArray(m.weeks) && m.weeks.length === 4 &&
    new Set(m.weeks.map(w => w?.id)).size === 4 &&
    m.weeks.every(w => w && [1,2,3,4].includes(w.id) &&
      ['open','closed'].includes(w.status) &&
      w.fund && Number.isSafeInteger(w.fund.amount) && w.fund.amount >= 0 &&
      CURRENCIES.has(w.fund.currency) && Number.isSafeInteger(w.settlement) &&
      Array.isArray(w.expenses)));
}
export function envelopeHash(envelope) {
  return createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
}
function exactHash(a,b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a)) || !/^[a-f0-9]{64}$/i.test(String(b))) return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}

// read returns {data,etag}; write(path, snapshot, data) must be CAS/first-create.
export async function migrateGeneration2({read, write, expectedLegacyHash, commit = false}) {
  if (typeof read !== 'function' || (commit && typeof write !== 'function')) blocked('invalid_migration_adapter');
  if (!/^[a-f0-9]{64}$/i.test(String(expectedLegacyHash || ''))) blocked('expected_backup_sha256_required');
  const legacy = await read(LEGACY);
  if (!legacy?.etag || !validEnvelope(legacy.data)) blocked('legacy_budget_missing_or_invalid');
  const fingerprint = envelopeHash(legacy.data);
  if (!exactHash(fingerprint, expectedLegacyHash)) blocked('legacy_budget_differs_from_verified_backup');
  const target = await read(NEXT);
  if (!target || target.etag || target.data !== null) blocked('generation2_already_initialized_no_overwrite');
  if (!commit) return {status:'DRY_RUN',revision:legacy.data.rev,sha256:fingerprint,destinationEmpty:true,wrote:false};

  // Ensure no legacy write happened between preflight and the conditional copy.
  const latest = await read(LEGACY);
  if (!latest?.etag || latest.etag !== legacy.etag ||
      !exactHash(envelopeHash(latest.data), fingerprint)) blocked('legacy_changed_during_preflight');
  const targetNow = await read(NEXT);
  if (!targetNow || targetNow.etag || targetNow.data !== null) blocked('generation2_initialized_during_preflight');

  // The supplied writer must perform allowOverwrite:false. Never retry blindly.
  await write(NEXT, targetNow, structuredClone(latest.data));
  const copied = await read(NEXT);
  if (!copied?.etag || !exactHash(envelopeHash(copied.data), fingerprint)) blocked('generation2_readback_mismatch_do_not_release');
  const legacyAfter = await read(LEGACY);
  if (!legacyAfter?.etag || legacyAfter.etag !== latest.etag ||
      !exactHash(envelopeHash(legacyAfter.data), fingerprint)) blocked('legacy_changed_during_copy_do_not_release');
  return {status:'COPIED_READBACK_VERIFIED',revision:copied.data.rev,sha256:fingerprint,wrote:true,
    legacyPreserved:true,productionReleased:false};
}

async function main() {
  const commit = process.argv.includes('--commit');
  if (process.env.VERCEL_ENV === 'preview' || process.env.VNN_MIGRATION_TARGET !== 'production')
    blocked('production_target_must_be_explicit');
  if (!process.env.BLOB_READ_WRITE_TOKEN) blocked('private_blob_credential_missing');
  if (commit && (process.env.VNN_PRIVATE_BACKUP_VERIFIED !== '1' ||
      process.env.VNN_MIGRATION_CONFIRM !== 'COPY_LEGACY_TO_GENERATION_2'))
    blocked('verified_private_backup_and_explicit_commit_confirmation_required');
  // Blob dependency is loaded only after all environment safety gates.
  const { readDocument, replaceDocument } = await import('../lib/blob-store.js');
  const result = await migrateGeneration2({read:readDocument,write:replaceDocument,
    expectedLegacyHash:process.env.VNN_EXPECTED_LEGACY_SHA256,commit});
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{
    console.error('MIGRATION_BLOCKED:', error instanceof MigrationBlocked ? error.message : 'private_storage_error');
    process.exitCode = 1;
  });
}
