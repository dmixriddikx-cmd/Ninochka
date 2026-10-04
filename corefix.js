import * as base from './core.js';
export * from './core.js';

export function migrate(raw){
  if(raw?.schemaVersion===base.SCHEMA) return base.migrate(raw);
  const next=base.createState();
  try{
    if(base.CURRENCIES.includes(raw?.storageCurrency)){
      next.storage.currency=raw.storageCurrency;
      for(const item of next.months[0].obligations){item.currency=next.storage.currency;item.rate=1;}
      for(const w of next.months[0].weeks){if(w.fund.currency===next.storage.currency)w.fund.rate=1;}
    }
    if(raw?.preferences?.language==='uk') next.preferences.language='uk';
    if(['light','dark','auto'].includes(raw?.preferences?.theme)) next.preferences.theme=raw.preferences.theme;
  }catch{}
  next.storage.balance=0; next.storage.history=[]; next.nbEntries=[]; next.preferences.onboardingSeen=false;
  return next;
}

export function changeStorageCurrency(state,newCurrency,rate){
  if(!base.CURRENCIES.includes(newCurrency)||newCurrency===state.storage.currency) return;
  const old=state.storage.currency, r=Number(rate);
  if(!Number.isFinite(r)||r<=0) throw new Error('invalid_rate');
  const oldRates=structuredClone(state.rates);
  state.storage.balance=Math.round(state.storage.balance*r);
  for(const m of state.months){
    for(const item of m.obligations){
      if(item.currency===newCurrency)item.rate=1;
      else if(item.currency===old)item.rate=r;
      else if(item.rate)item.rate=base.round(item.rate*r);
    }
    for(const w of m.weeks){
      if(w.fund.currency===newCurrency)w.fund.rate=1;
      else if(w.fund.currency===old)w.fund.rate=r;
      else if(w.fund.rate)w.fund.rate=base.round(w.fund.rate*r);
      for(const item of w.expenses){
        if(item.currency===newCurrency)item.rate=1;
        else if(item.currency===old)item.rate=r;
        else if(item.rate)item.rate=base.round(item.rate*r);
      }
    }
  }
  state.rates={};
  for(const c of base.CURRENCIES){
    if(c===newCurrency)continue;
    let cr=null;
    if(c===old)cr=r;
    else if(oldRates[base.rateKey(c,old)]?.value)cr=oldRates[base.rateKey(c,old)].value*r;
    if(cr)base.setRate(state,c,newCurrency,cr,'automatic');
  }
  state.storage.currency=newCurrency;
  state.storage.history.unshift({id:base.uid(),type:'currency',from:old,to:newCurrency,rate:r,date:new Date().toISOString()});
}

export function closeMonth(state,m){
  if(m.status==='closed')return;
  for(const w of m.weeks)if(w.status!=='closed')base.closeWeek(state,w);
  m.status='closed';m.closedAt=new Date().toISOString();
}
export function ensureCurrentMonth(state){
  const id=base.nowMonth();
  for(const old of state.months)if(old.id<id&&old.status!=='closed')closeMonth(state,old);
  if(state.months.some(m=>m.id===id))return;
  const prev=[...state.months].sort((a,b)=>b.id.localeCompare(a.id))[0];
  const next=base.blankMonth(id,prev);
  if(!prev){for(const item of next.obligations){item.currency=state.storage.currency;item.rate=1;}}
  state.months.push(next);
}
