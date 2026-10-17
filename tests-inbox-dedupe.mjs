import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real browser duplicate-detection functions without changing the UI.
const source = fs.readFileSync(new URL('./v4/app-inbox.js', import.meta.url), 'utf8');
const start = source.indexOf('function inboxPreviouslyRecorded(');
const end = source.indexOf('function inboxPending()', start);
assert.ok(start >= 0 && end > start, 'Inbox duplicate guards must exist');
const sandbox = { expenseInbox: {items: []} };
const guards = vm.runInNewContext(source.slice(start, end) +
  '\n({inboxPreviouslyRecorded, inboxPossibleDuplicate})', sandbox);

const make = (id, importId = null) => ({
  id, importId, name: 'Coffee', amount: 450, currency: 'EUR',
  date: '2026-10-15T12:00:00.000Z'
});
const state = {months:[{weeks:[{expenses:[make('manual-1')]}]}]};
const incoming = {id:'scan_123', name:'Coffee', amount:450, currency:'EUR', date:'2026-10-15'};
assert.equal(guards.inboxPreviouslyRecorded(incoming, state), false,
  'An identical manual payment must not silently erase a second real coffee');
assert.equal(guards.inboxPossibleDuplicate(incoming, state), true,
  'Potentially repeated payments should be flagged for human review');
assert.equal(guards.inboxPreviouslyRecorded({...incoming,id:'manual-1'}, state), false,
  'An expense ID is not a bank import ID');
state.months[0].weeks[0].expenses.push(make('imported-1','scan_123'));
assert.equal(guards.inboxPreviouslyRecorded(incoming, state), true,
  'An exact import ID prevents re-importing the same transaction');
assert.equal(guards.inboxPossibleDuplicate(incoming, {months:[{weeks:[{expenses:[make('imported-1','scan_123')]}]}]}), false,
  'Already imported purchases do not need another duplicate warning');
const different = {...incoming,id:'scan_456', amount:451};
assert.equal(guards.inboxPreviouslyRecorded(different, state), false);
assert.equal(guards.inboxPossibleDuplicate(different, state), false);
// Two screenshots of an identical-looking purchase must both be reviewable,
// but the second is unchecked by default so it cannot silently double-debit.
sandbox.expenseInbox.items = [incoming, {...incoming,id:'scan_999'}];
const cleanState = {months:[{weeks:[{expenses:[]}]}]};
assert.equal(guards.inboxPreviouslyRecorded(sandbox.expenseInbox.items[1], cleanState), false);
assert.equal(guards.inboxPossibleDuplicate(sandbox.expenseInbox.items[0], cleanState), false);
assert.equal(guards.inboxPossibleDuplicate(sandbox.expenseInbox.items[1], cleanState), true);
console.log('VNN duplicate regression PASS: distinct identical purchases are reviewable, exact import IDs remain idempotent');
