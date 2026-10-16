import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Audit the actual releaseLock implementation without requiring live Vercel Blob credentials.
const source = fs.readFileSync(new URL('./sync-service/api/sync.js', import.meta.url), 'utf8');
const start = source.indexOf('async function releaseLock(');
const end = source.indexOf('\nasync function writeBudget(', start);
assert.ok(start >= 0 && end > start, 'Budget lock release function must exist');
assert.equal((source.match(/await releaseLock\(lockId\)/g) || []).length, 2,
  'Both budget writers must release only their own lock ID');

let lock = { id: 'replacement-writer' };
const deleted = [];
let readError = false;
const scope = {
  LOCK_PATH: 'family-budget.lock',
  readJsonBlob: async () => {
    if (readError) throw new Error('transient blob read error');
    return lock;
  },
  del: async path => { deleted.push(path); }
};
const release = vm.runInNewContext(source.slice(start, end) + '\nreleaseLock', scope);
await release('expired-writer');
assert.deepEqual(deleted, [], 'An expired request must not remove another writer lock');
await release('replacement-writer');
assert.deepEqual(deleted, ['family-budget.lock'], 'Lock owner can release its own lock');
lock = null;
await release('replacement-writer');
assert.equal(deleted.length, 1, 'Missing lock must not cause an unrelated deletion');
lock = { id: 'third-writer' };
readError = true;
await release('third-writer');
assert.equal(deleted.length, 1, 'On read error, fail closed instead of deleting blindly');
console.log('VNN budget lock ownership regression PASS');
