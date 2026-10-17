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
const nested=c.addExpense(s,w,{name:'продукты',category:'products',subcategory:'Супермаркет',amount:'10',currency:'EUR'});eq(nested.subcategory,'Супермаркет','nested category saved');
c.updateExpense(s,w,nested.id,{subcategory:'Фермерский рынок'});eq(w.expenses.find(x=>x.id===nested.id).subcategory,'Фермерский рынок','nested category updated');
c.updateExpense(s,w,nested.id,{subcategory:''});eq(Object.hasOwn(w.expenses.find(x=>x.id===nested.id),'subcategory'),false,'nested category can be cleared');
const incomeBefore=s.storage.balance;c.adjustStorage(s,'25','EUR','Зарплата','income');eq(s.storage.balance,incomeBefore+2500,'income credits storage');eq(s.storage.history[0].type,'income','income history type');
const before=s.storage.balance;c.closeWeek(s,w);eq(s.storage.balance,before+c.weekResult(s,w),'close settlement');c.updateExpense(s,w,w.expenses[0].id,{amount:'60',currency:'EUR',name:'рестик',category:'leisure'});eq(s.storage.balance,before+c.weekResult(s,w),'closed edit reconcile');
c.deleteExpense(s,w,nested.id);eq(w.expenses.some(x=>x.id===nested.id),false,'expense deleted');eq(s.storage.balance,before+c.weekResult(s,w),'closed delete reconcile');
c.reopenWeek(s,w);eq(s.storage.balance,before,'reopen rollback after delete');
console.log('V4 tests PASS');
let s2=c.createState(); c.setRate(s2,'USD','EUR',0.9,'manual'); c.adjustStorage(s2,'1000','EUR','seed'); let m2=c.month(s2); c.setWeekFund(s2,m2.weeks[0],'200','USD');
const oldFundEur=c.fundInStorage(s2,m2.weeks[0]); c.changeStorageCurrency(s2,'USD',1/0.9); eq(s2.storage.currency,'USD','storage currency'); eq(s2.storage.balance,111111,'converted storage rounded'); eq(c.fundInStorage(s2,m2.weeks[0]),20000,'fund rebased to USD'); eq(oldFundEur,18000,'old fund EUR');
let legacy={schemaVersion:3,storageCurrency:'USD',adjustments:[{amount:99999999}],preferences:{language:'ru',theme:'dark'}};let migrated=c.migrate(legacy);eq(migrated.storage.balance,0,'legacy finance reset');eq(migrated.storage.currency,'USD','legacy currency preference');eq(migrated.preferences.theme,'dark','theme preserved');
console.log('V4 extended tests PASS');

let s3=c.createState();
if(!c.CURRENCIES.includes('UAH')) throw new Error('UAH missing from supported currencies');
c.setRate(s3,'UAH','EUR',0.02,'manual');
let m3=c.month(s3),w3=m3.weeks[0];
c.setWeekFund(s3,w3,'200','EUR');
const uahExpense=c.addExpense(s3,w3,{name:'Проверка UAH',category:'leisure',amount:'1123',currency:'UAH'});
eq(uahExpense.amount,112300,'UAH amount preserved');
eq(uahExpense.category,'leisure','UAH leisure category');
eq(c.weekSpent(s3,w3),2246,'UAH expense converts into storage currency');
console.log('UAH integration tests PASS');

const uahUsdRate=0.02222;
let s4=c.createState();s4.storage.currency='USD';c.setRate(s4,'UAH','USD',uahUsdRate,'manual');let m4=c.month(s4),w4=m4.weeks[0];c.setWeekFund(s4,w4,'200','USD');
const probe=c.addExpense(s4,w4,{name:'UAH live-route probe',category:'clothes',amount:'350',currency:'UAH'});
eq(c.weekSpent(s4,w4),778,'350 UAH converts to USD cents');
console.log('UAH 350 conversion test PASS');

// A closed week's settlement is stored in the Storage denomination too.
// Reopening after changing EUR -> USD must reverse exactly the converted sum.
let rebased=c.createState();
rebased.storage.balance=10000;
const rebasedWeek=c.month(rebased).weeks[0];
c.setWeekFund(rebased,rebasedWeek,'100','EUR');
c.addExpense(rebased,rebasedWeek,{name:'Synthetic expense',amount:'20',currency:'EUR'});
c.closeWeek(rebased,rebasedWeek);
c.changeStorageCurrency(rebased,'USD',2);
eq(rebasedWeek.settlement,16000,'closed settlement rebased');
eq(c.historicalSaved(rebased),16000,'historical savings rebased');
c.updateExpense(rebased,rebasedWeek,rebasedWeek.expenses[0].id,{amount:'30'});
eq(rebased.storage.balance,34000,'closed correction after currency change');
c.reopenWeek(rebased,rebasedWeek);
eq(rebased.storage.balance,20000,'reopen after currency change restores principal');
console.log('Closed-week FX correction/reopen/savings regression PASS');


let negative=c.createState();
c.adjustStorage(negative,'-50','EUR','Synthetic negative balance');
eq(negative.storage.balance,-5000,'negative storage is preserved');
eq(negative.storage.history[0].type,'manual','negative adjustment history type');

let compatible=c.createState(),compatibleWeek=c.month(compatible).weeks[0];
c.addExpense(compatible,compatibleWeek,{name:'Legacy-compatible nested item',category:'housing',subcategory:'Коммунальные',amount:'12.34',currency:'EUR'});
c.adjustStorage(compatible,'100','EUR','Synthetic salary','income');
const roundTrip=c.migrate(JSON.parse(JSON.stringify(compatible)));
eq(roundTrip.months[0].weeks[0].expenses[0].subcategory,'Коммунальные','subcategory survives schema-4 round trip');
eq(roundTrip.storage.history[0].type,'income','income survives schema-4 round trip');
eq(roundTrip.storage.balance,10000,'income balance survives schema-4 round trip');
console.log('Expense delete, negative Storage and schema-4 compatibility regressions PASS');
