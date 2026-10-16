import assert from 'node:assert/strict';
import {bankRows,exactMinor,validDate} from './sync-service/lib/recognition.js';

assert.equal(exactMinor('125.60'),12560);
assert.equal(exactMinor('4,50'),450);
assert.equal(exactMinor('200'),20000);
assert.equal(exactMinor('0'),null);
assert.equal(exactMinor('4.555'),null);
assert.equal(exactMinor('-10'),null);
assert.equal(validDate('2026-10-14'),true);
assert.equal(validDate('2026-02-31'),false);
assert.equal(validDate('2026-99-31'),false);
const sample = [
 ['Hard Rock New York','125.60','USD','gifts','Completed'],
 ['Best Buy MAIB','177.27','USD','other','Completed'],
 ['Best Buy Accent','40.47','USD','other','Completed'],
 ['Sam Halal Food','6.18','USD','products','Completed'],
 ['99 Cents Delicious Pizza','4.61','USD','products','Completed'],
 ['Hudson River Halal','5.44','USD','products','Completed'],
 ['Prestige Marketplace 29','72.38','USD','products','Completed'],
 ['Uber','92.69','USD','transport','Completed'],
 ['Kyivstar','200.00','UAH','other','Completed'],
 ['Uber','60.55','USD','transport','Отклонено банком'],
 ['Sam Halal Food','6.18','USD','products','Declined'],
 ['Unknown payment',null,'USD','other','Completed'],
 ['Coffee','3.20','USD','products','Pending']
];
const raw={transactions:sample.map(([name,amount,currency,category,status])=>({
  name,amount,currency,category,status,date:'2026-10-14',bank:'Demo Bank'
}))};
const processed=bankRows(raw,'image123');
assert.equal(processed.items.length,9);
assert.equal(processed.excluded.length,3);
assert.equal(processed.uncertain.length,1);
assert.equal(processed.items.filter(x=>x.currency==='USD').reduce((sum,x)=>sum+x.amount,0),52464);
assert.equal(processed.items.filter(x=>x.currency==='UAH').reduce((sum,x)=>sum+x.amount,0),20000);
assert.deepEqual(bankRows(raw,'image123').items.map(x=>x.id),processed.items.map(x=>x.id));
assert.notEqual(bankRows(raw,'another-image').items[0].id,processed.items[0].id);
const sameMerchant={transactions:[
 {name:'Coffee',amount:'4.00',currency:'EUR',date:'2026-10-15',status:'Completed'},
 {name:'Coffee',amount:'4.00',currency:'EUR',date:'2026-10-15',status:'Completed'}
]};
const collisions=bankRows(sameMerchant,'imageXYZ').items;
assert.equal(collisions.length,2,'same-day repeat purchases must not collapse without bank ref');
assert.notEqual(collisions[0].id,collisions[1].id);
const sameRef={transactions:[
 {name:'Coffee',amount:'4.00',currency:'EUR',date:'2026-10-15',status:'Completed',reference:'abc123',bank:'MAIB'}
]};
assert.equal(bankRows(sameRef,'img1').items[0].id,bankRows(sameRef,'img2').items[0].id,
  'bank reference dedupes across screenshots');
assert.deepEqual(bankRows({transactions:[]},'empty').items,[]);
assert.throws(()=>bankRows({transactions:'invalid'},'hash'),/invalid_recognition/);
console.log('VNN screenshot recognition normalization PASS: 9 confirmed, 2 declined, 1 pending, 1 unreadable, exact currencies and duplicate behavior');
