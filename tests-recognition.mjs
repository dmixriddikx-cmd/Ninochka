import assert from 'node:assert/strict';
import {bankRows,exactMinor,validDate} from './sync-service/lib/recognition.js';

assert.equal(exactMinor('45.00'),4500);
assert.equal(exactMinor('4,50'),450);
assert.equal(exactMinor('250'),25000);
assert.equal(exactMinor('0'),null);
assert.equal(exactMinor('4.555'),null);
assert.equal(exactMinor('-10'),null);
assert.equal(validDate('2026-10-14'),true);
assert.equal(validDate('2026-02-31'),false);
assert.equal(validDate('2026-99-31'),false);
const sample = [
 ['Demo Souvenir Shop','45.00','USD','gifts','Completed'],
 ['Demo Electronics Card A','21.00','USD','other','Completed'],
 ['Demo Electronics Card B','9.80','USD','other','Completed'],
 ['Demo Deli','7.30','USD','products','Completed'],
 ['Demo Bakery','6.50','USD','products','Completed'],
 ['Demo Cafe','5.25','USD','products','Completed'],
 ['Demo Grocer','4.05','USD','products','Completed'],
 ['Demo Taxi','31.00','USD','transport','Completed'],
 ['Demo Mobile','250.00','UAH','other','Completed'],
 ['Demo Taxi','9.90','USD','transport','Отклонено банком'],
 ['Demo Deli','7.30','USD','products','Declined'],
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
assert.equal(processed.items.filter(x=>x.currency==='USD').reduce((sum,x)=>sum+x.amount,0),12990);
assert.equal(processed.items.filter(x=>x.currency==='UAH').reduce((sum,x)=>sum+x.amount,0),25000);
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
