export const CURRENCIES = ['EUR','USD','MDL','UAH'];
export const SCHEMA = 4;
export const MONEY_LIMIT = 1_000_000_000_00;

export const nowMonth = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const cents = value => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  const raw=String(value??'').trim().replace(/\s/g,'').replace(',','.');
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(raw)) throw new Error('invalid_money');
  const n=Math.round(Number(raw)*100);
  if (!Number.isSafeInteger(n) || Math.abs(n)>MONEY_LIMIT) throw new Error('invalid_money');
  return n;
};
export const moneyInput = minor => (minor/100).toFixed(2);
export const round = n => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

export function blankWeek(id, prevFund=null){
  return {id,status:'open',fund:prevFund || {amount:20000,currency:'USD',rate:null},expenses:[],settlement:0,closedAt:null};
}
export function blankMonth(id=nowMonth(), previous=null){
  const defaults=[
    {kind:'housing',name:'rent',amount:0,currency:'EUR',rate:null},
    {kind:'housing',name:'utilities',amount:0,currency:'EUR',rate:null},
    {kind:'study',name:'school',amount:0,currency:'EUR',rate:null},
  ];
  const obligations = previous?.obligations?.map(x=>({...x,id:uid(),amount:x.amount||0,rate:null})) || defaults.map(x=>({...x,id:uid()}));
  const prevFunds = previous?.weeks?.map(w=>({amount:w.fund.amount,currency:w.fund.currency,rate:null})) || [];
  return {id,status:'active',obligations,weeks:[1,2,3,4].map((id,i)=>blankWeek(id,prevFunds[i])),createdAt:new Date().toISOString()};
}
export function createState(){
  return {
    schemaVersion:SCHEMA,
    preferences:{language:'ru',theme:'dark',onboardingSeen:false},
    storage:{balance:0,currency:'EUR',history:[]},
    rates:{},
    months:[blankMonth()],
    nbEntries:[],
    createdAt:new Date().toISOString()
  };
}
export function migrate(raw){
  if (!raw || typeof raw!=='object') return createState();
  if (raw.schemaVersion===SCHEMA) return normalize(raw);
  const next=createState();
  try {
    const oldBalance = Array.isArray(raw.adjustments) ? raw.adjustments.reduce((s,x)=>s+Number(x.amount||0),0) : 0;
    if (Number.isSafeInteger(oldBalance)) next.storage.balance=oldBalance;
    if (CURRENCIES.includes(raw.storageCurrency)) next.storage.currency=raw.storageCurrency;
    if (raw.preferences?.language==='uk') next.preferences.language='uk';
    if (['light','dark','auto'].includes(raw.preferences?.theme)) next.preferences.theme=raw.preferences.theme;
  } catch {}
  return next;
}
function normalize(state){
  const next=structuredClone(state);
  next.preferences ||= {language:'ru',theme:'auto',onboardingSeen:false};
  next.preferences.language = next.preferences.language==='uk'?'uk':'ru';
  next.preferences.theme = ['light','dark','auto'].includes(next.preferences.theme)?next.preferences.theme:'auto';
  next.storage ||= {balance:0,currency:'EUR',history:[]};
  if (!CURRENCIES.includes(next.storage.currency)) next.storage.currency='EUR';
  next.storage.history ||= [];
  next.rates ||= {};
  next.months ||= [blankMonth()];
  next.nbEntries ||= [];
  return next;
}
export const month = (state,id=nowMonth()) => state.months.find(m=>m.id===id) || state.months.at(-1);
export const week = (m,id) => m.weeks.find(w=>w.id===Number(id));

export function rateKey(from,to){return `${from}_${to}`;}
export function setRate(state,from,to,value,source='manual',date=new Date().toISOString().slice(0,10)){
  const n=Number(value);
  if(!CURRENCIES.includes(from)||!CURRENCIES.includes(to)||from===to||!Number.isFinite(n)||n<=0) throw new Error('invalid_rate');
  state.rates[rateKey(from,to)]={value:round(n),source,date};
  state.rates[rateKey(to,from)]={value:round(1/n),source,date};
}
export function getRate(state,from,to,embeddedRate=null){
  if(from===to) return 1;
  if(embeddedRate && Number.isFinite(embeddedRate) && embeddedRate>0) return embeddedRate;
  return state.rates[rateKey(from,to)]?.value || null;
}
export function convert(state,minor,from,to=state.storage.currency,embeddedRate=null){
  if(from===to) return minor;
  const r=getRate(state,from,to,embeddedRate);
  if(!r) throw new Error(`missing_rate:${from}:${to}`);
  return Math.round(minor*r);
}
export function itemInStorage(state,item){return convert(state,item.amount,item.currency,state.storage.currency,item.rate);}
export function fundInStorage(state,w){return convert(state,w.fund.amount,w.fund.currency,state.storage.currency,w.fund.rate);}
export function weekSpent(state,w){return w.expenses.reduce((s,x)=>s+itemInStorage(state,x),0);}
export function weekResult(state,w){return fundInStorage(state,w)-weekSpent(state,w);}
export function monthSaved(state,m){return m.weeks.filter(w=>w.status==='closed').reduce((s,w)=>s+Math.max(0,w.settlement||0),0);}
export function historicalSaved(state){return state.months.reduce((s,m)=>s+monthSaved(state,m),0);}
export function obligationsTotal(state,m){return m.obligations.reduce((s,x)=>s+itemInStorage(state,x),0);}
export function plannedWeeksTotal(state,m){return m.weeks.reduce((s,w)=>s+fundInStorage(state,w),0);}
export function planSummary(state,m){
  const mandatory=obligationsTotal(state,m), weekly=plannedWeeksTotal(state,m), total=mandatory+weekly;
  return {mandatory,weekly,total,reserve:state.storage.balance-total};
}

export function adjustStorage(state,amount,currency,note=''){
  const minor=cents(amount);
  const converted=convert(state,minor,currency,state.storage.currency);
  state.storage.balance += converted;
  state.storage.history.unshift({id:uid(),type:'manual',amount:minor,currency,converted,note:String(note||''),date:new Date().toISOString()});
}
export function setStorageBalance(state,target,currency=state.storage.currency,note='Сверка баланса'){
  const targetMinor=cents(target);
  const converted=convert(state,targetMinor,currency,state.storage.currency);
  const diff=converted-state.storage.balance;
  state.storage.balance=converted;
  state.storage.history.unshift({id:uid(),type:'reconcile',amount:targetMinor,currency,converted:diff,note,date:new Date().toISOString()});
}
export function changeStorageCurrency(state,newCurrency,rate){
  if(!CURRENCIES.includes(newCurrency)||newCurrency===state.storage.currency) return;
  const old=state.storage.currency;
  const r=Number(rate);
  if(!Number.isFinite(r)||r<=0) throw new Error('invalid_rate');
  state.storage.balance=Math.round(state.storage.balance*r);
  setRate(state,old,newCurrency,r,'automatic');
  state.storage.currency=newCurrency;
  state.storage.history.unshift({id:uid(),type:'currency',from:old,to:newCurrency,rate:r,date:new Date().toISOString()});
}

export function upsertObligation(state,m,item){
  const idx=m.obligations.findIndex(x=>x.id===item.id);
  const next={...item,id:item.id||uid(),amount:cents(item.amount),currency:item.currency,rate:item.currency===state.storage.currency?1:getRate(state,item.currency,state.storage.currency)};
  if(next.currency!==state.storage.currency && !next.rate) throw new Error(`missing_rate:${next.currency}:${state.storage.currency}`);
  if(idx>=0)m.obligations[idx]=next; else m.obligations.push(next);
}
export function setWeekFund(state,w,amount,currency){
  const r=currency===state.storage.currency?1:getRate(state,currency,state.storage.currency);
  if(currency!==state.storage.currency&&!r) throw new Error(`missing_rate:${currency}:${state.storage.currency}`);
  w.fund={amount:cents(amount),currency,rate:r};
  if(w.status==='closed') reconcileWeek(state,w);
}
export function addExpense(state,w,{name,category='other',amount,currency}){
  const clean=String(name||'').trim(); if(!clean) throw new Error('name_required');
  const r=currency===state.storage.currency?1:getRate(state,currency,state.storage.currency);
  if(currency!==state.storage.currency&&!r) throw new Error(`missing_rate:${currency}:${state.storage.currency}`);
  const item={id:uid(),name:clean,category,amount:cents(amount),currency,rate:r,date:new Date().toISOString()};
  w.expenses.push(item);
  if(w.status==='closed') reconcileWeek(state,w);
  return item;
}
export function updateExpense(state,w,id,patch){
  const i=w.expenses.findIndex(x=>x.id===id); if(i<0)throw new Error('not_found');
  const old=w.expenses[i];
  const currency=patch.currency||old.currency;
  const r=currency===state.storage.currency?1:getRate(state,currency,state.storage.currency);
  if(currency!==state.storage.currency&&!r) throw new Error(`missing_rate:${currency}:${state.storage.currency}`);
  w.expenses[i]={...old,...patch,name:String(patch.name??old.name).trim(),amount:cents(patch.amount??moneyInput(old.amount)),currency,rate:r};
  if(w.status==='closed') reconcileWeek(state,w);
}
export function deleteExpense(state,w,id){
  const i=w.expenses.findIndex(x=>x.id===id); if(i<0)return;
  w.expenses.splice(i,1); if(w.status==='closed') reconcileWeek(state,w);
}
export function closeWeek(state,w){
  if(w.status==='closed') return;
  const result=weekResult(state,w);
  w.settlement=result; w.status='closed'; w.closedAt=new Date().toISOString();
  state.storage.balance += result;
  state.storage.history.unshift({id:uid(),type:'week',weekId:w.id,converted:result,date:w.closedAt});
}
export function reopenWeek(state,w){
  if(w.status!=='closed') return;
  state.storage.balance -= (w.settlement||0);
  w.settlement=0; w.status='open'; w.closedAt=null;
}
export function reconcileWeek(state,w){
  if(w.status!=='closed') return;
  state.storage.balance -= (w.settlement||0);
  w.settlement=weekResult(state,w);
  state.storage.balance += w.settlement;
}
export function addNb(state,{name,amount,currency}){
  const clean=String(name||'').trim(); if(!clean)throw new Error('name_required');
  state.nbEntries.unshift({id:uid(),name:clean,amount:cents(amount),currency,date:new Date().toISOString()});
}
export function ensureCurrentMonth(state){
  const id=nowMonth(); if(state.months.some(m=>m.id===id))return;
  const prev=[...state.months].sort((a,b)=>b.id.localeCompare(a.id))[0];
  state.months.push(blankMonth(id,prev));
}
