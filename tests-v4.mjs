import * as c from './core.js';
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
