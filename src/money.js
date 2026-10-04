/** All financial arithmetic uses integer cents and BigInt rational conversion. */
export const CURRENCIES = ['EUR', 'USD', 'MDL'];
export const RATE_SCALE = 100_000_000;
export const MONEY_LIMIT = 1_000_000_000_000;
export const RATE_LIMIT = 1_000_000_000_000;
export function safeInt(value, limit = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > limit) throw new Error('Завелика або некоректна сума.');
  return value;
}
export function decimalToInteger(input, places, limit) {
  const value = String(input).trim().replace(',', '.');
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[3] || '').length > places) throw new Error(`Введіть число, до ${places} знаків після коми.`);
  const number = BigInt(match[2]) * 10n ** BigInt(places) + BigInt((match[3] || '').padEnd(places, '0') || '0');
  return safeInt(Number(match[1] === '-' ? -number : number), limit);
}
export const parseMoney = input => decimalToInteger(input, 2, MONEY_LIMIT);
export function parseRate(input) {
  const rate = decimalToInteger(input, 8, RATE_LIMIT);
  if (rate <= 0) throw new Error('Курс має бути більшим за нуль.');
  return rate;
}
export function roundedDivide(numerator, denominator) {
  if (denominator <= 0n) throw new Error('Некоректний курс.');
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return sign * ((magnitude + denominator / 2n) / denominator);
}
export function convert(minor, rate) {
  safeInt(minor, MONEY_LIMIT); safeInt(rate, RATE_LIMIT);
  if (rate <= 0) throw new Error('Курс має бути більшим за нуль.');
  return safeInt(Number(roundedDivide(BigInt(minor) * BigInt(rate), BigInt(RATE_SCALE))));
}
export const sum = values => safeInt(Number(values.reduce((total, value) => total + BigInt(safeInt(value)), 0n)));
export function decimalString(minor) {
  safeInt(minor);
  const value = BigInt(minor), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function rateString(rate) {
  return `${Math.floor(rate / RATE_SCALE)}.${String(rate % RATE_SCALE).padStart(8, '0')}`.replace(/\.?0+$/, '');
}
export function formatMoney(minor, currency = 'EUR', signed = false) {
  const value = BigInt(safeInt(minor)), abs = value < 0n ? -value : value;
  const integer = new Intl.NumberFormat('uk-UA').format(abs / 100n);
  const cents = String(abs % 100n).padStart(2, '0');
  const symbol = { EUR: '€', USD: '$', MDL: 'L' }[currency];
  return `${value < 0n ? '−' : signed && value > 0n ? '+' : ''}${integer},${cents} ${symbol}`;
}
export function inDisplayCurrency(minor, state) {
  const currency = state.displayCurrency;
  if (currency === state.storageCurrency) return minor;
  const rate = state.rates[currency]?.value;
  if (!rate) throw new Error('Додайте курс валюти відображення.');
  return safeInt(Number(roundedDivide(BigInt(minor) * BigInt(RATE_SCALE), BigInt(rate))));
}
