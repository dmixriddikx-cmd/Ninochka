import { createHash } from 'node:crypto';
import { bankOutcome } from './transaction-status.js';

const CURRENCIES = new Set(['EUR', 'USD', 'MDL', 'UAH']);
const CATEGORIES = new Set(['products','transport','clothes','leisure','other','household','health','gifts']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function exactMinor(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(s)) return null;
  const [a,b=''] = s.split('.');
  const minor = Number(a)*100 + Number((b+'00').slice(0,2));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 100000000000 ? minor : null;
}
export function validDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const parsed = new Date(s + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0,10) === s;
}
export function bankRows(raw, imageDigest) {
  if (!raw || !Array.isArray(raw.transactions) || raw.transactions.length > 35)
    throw new Error('invalid_recognition');
  const accepted=[], excluded=[], uncertain=[];
  const seen = new Set();
  raw.transactions.forEach((t,i) => {
    const result=bankOutcome({
      // Bank screenshots use 'status' for actual posting state. Unlike inbox
      // queue status, 'Pending' here must be excluded before any staging.
      bankStatus:t.bankStatus || t.status, transactionStatus:t.status,
      paymentStatus:t.paymentStatus, statusText:t.statusText,
      name:t.name, description:t.description
    });
    if (result === 'declined' || result === 'unsettled') {
      excluded.push({reason:result, label:String(t.name||'').slice(0,80)});
      return;
    }
    const name=String(t.name||'').trim().slice(0,120);
    const date=t.date;
    const currency=String(t.currency||'').toUpperCase();
    const amount=exactMinor(t.amount);
    const category=CATEGORIES.has(t.category)?t.category:'other';
    if(!name || !validDate(date) || !CURRENCIES.has(currency) || amount===null) {
      uncertain.push({reason:'missing_details',label:name.slice(0,80)});
      return;
    }
    const bank=String(t.bank||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,90);
    const ref=String(t.reference||'').trim().toLowerCase().slice(0,100);
    const time=String(t.time||'').trim().slice(0,30);
    // Bank reference or timestamp is ideal for deduplication. Without either,
    // identify the row inside this screenshot. Never conflate two purchases
    // for identical amounts at one merchant on the same day.
    const identity = ref || time
      ? ['bank',bank,ref,time,date,name.toLowerCase(),currency,amount].join('|')
      : ['screenshot',imageDigest,i,date,name.toLowerCase(),currency,amount].join('|');
    const id='scan_'+createHash('sha256').update(identity).digest('hex').slice(0,40);
    if(seen.has(id))return;
    seen.add(id);
    accepted.push({id,name,date,currency,amount,category});
  });
  return {items:accepted,excluded,uncertain};
}
