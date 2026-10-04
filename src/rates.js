import { CURRENCIES, parseRate } from './money.js';

/** Replaceable provider contract: getRate(source, target, signal) -> {value,date}. */
export class FrankfurterProvider {
  constructor(fetcher = globalThis.fetch.bind(globalThis)) { this.fetcher = fetcher; }
  async getRate(source, target, signal) {
    if (!CURRENCIES.includes(source) || !CURRENCIES.includes(target) || source === target) throw new Error('Некоректна валютна пара.');
    const response = await this.fetcher(`https://api.frankfurter.dev/v2/rate/${source.toLowerCase()}/${target.toLowerCase()}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Сервіс курсів недоступний. Попередній курс збережено; можна ввести ручний.');
    const data = await response.json();
    if (data.base?.toUpperCase() !== source || data.quote?.toUpperCase() !== target || typeof data.rate !== 'number' || !Number.isFinite(data.rate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('Сервіс повернув некоректний курс. Попередній курс збережено.');
    return { value: parseRate(String(data.rate)), date: data.date };
  }
}
export async function fetchAutomaticRate(provider, source, target) {
  return provider.getRate(source, target, AbortSignal.timeout(10000));
}
