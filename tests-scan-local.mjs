import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('v4/app-scan.js','utf8');
const methods=script.slice(script.indexOf('function scanCategory('),script.indexOf('const originalScanBanner'));
const context={Date};vm.createContext(context);vm.runInContext(methods,context);
const output=context.parseLocalBankText([
  '14.10.2026',
  'Demo Grocery 125,40 MDL',
  'Card 1234 5678 9012 3456',
  'Demo Taxi 7.30 USD',
  'Declined 9.99 EUR',
  'Pending 12.00 EUR'
].join('\n'),'2026-10-15','a'.repeat(64));
assert.equal(output.items.length,2);
assert.equal(output.items[0].amount,12540);
assert.equal(output.items[0].date,'2026-10-14');
assert.equal(output.items[0].currency,'MDL');
assert.equal(output.items[0].category,'products');
assert.equal(output.items[1].amount,730);
assert.equal(output.items[1].category,'transport');
assert.ok(output.items.every(item=>!item.name.includes('1234')));
assert.equal(output.excludedCount,2);
assert.equal(context.parseLocalBankText('Card 1234 5678 9012 3456',null,'b'.repeat(64)).items.length,0);
assert.equal(context.scanDate('31.02.2026','2026-10-15'),'2026-10-15');
assert.ok(!script.includes("SYNC_API+'/api/recognize'"));
console.log('On-device OCR parsing: amounts, date, currency, categories, rejected operations and card redaction PASS');
