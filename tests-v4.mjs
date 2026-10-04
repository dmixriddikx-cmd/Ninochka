import * as c from './corefix.js';
const eq=(a,b,m)=>{if(a!==b)throw new Error(`${m}: ${a} != ${b}`)};
let s=c.createState();let m=c.month(s);
c.setRate(s,'USD','EUR',0.9,'manual');c.setRate(s,'MDL','EUR',0.05,'manual');
c.adjustStorage(s,'5000','EUR','seed');eq(s.storage.balance,500000,'storage');
m.obligations=[
 {id:c.uid(),kind:'housing',name:'rent',amount:55500,currency:'EUR',rate:1},
 {id:c.uid(),kind:'housing',name:'utilities',amount:35000,currency:'USD',rate:.9},
 {id:c.uid(),kind:'study',name:'school',amount:60000,currency:'EUR',rate:1},
 {id:c.uid(),kind:'custom',name:'transport',amount:100000,currency:'MDL',rate:.05},
];
for(const w of m.weeks)c.setWeekFund(s,w,'200','USD');
let p=c.planSummary(s,m);eq(p.mandatory,152000,'mandatory');eq(p.weekly,72000,'weeks');eq(p.total,224000,'total');eq(p.reserve,276000,'reserve');
let w=m.weeks[0];c.addExpense(s,w,{name:'рестик',category:'leisure',amount:'50',currency:'EUR'});eq(w.expenses.at(-1).name,'рестик','expense name');
const before=s.storage.balance;c.closeWeek(s,w);eq(s.storage.balance,before+c.weekResult(s,w),'close settlement');c.updateExpense(s,w,w.expenses[0].id,{amount:'60',currency:'EUR',name:'рестик',category:'leisure'});eq(s.storage.balance,before+c.weekResult(s,w),'closed edit reconcile');
c.reopenWeek(s,w);eq(s.storage.balance,before,'reopen rollback');
console.log('V4 tests PASS');
let s2=c.createState(); c.setRate(s2,'USD','EUR',0.9,'manual'); c.adjustStorage(s2,'1000','EUR','seed'); let m2=c.month(s2); c.setWeekFund(s2,m2.weeks[0],'200','USD');
const oldFundEur=c.fundInStorage(s2,m2.weeks[0]); c.changeStorageCurrency(s2,'USD',1/0.9); eq(s2.storage.currency,'USD','storage currency'); eq(s2.storage.balance,111111,'converted storage rounded'); eq(c.fundInStorage(s2,m2.weeks[0]),20000,'fund rebased to USD'); eq(oldFundEur,18000,'old fund EUR');
let legacy={schemaVersion:3,storageCurrency:'USD',adjustments:[{amount:99999999}],preferences:{language:'ru',theme:'dark'}};let migrated=c.migrate(legacy);eq(migrated.storage.balance,0,'legacy finance reset');eq(migrated.storage.currency,'USD','legacy currency preference');eq(migrated.preferences.theme,'dark','theme preserved');
console.log('V4 extended tests PASS');
