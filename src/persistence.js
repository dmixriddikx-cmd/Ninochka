import { migrateState, validateState } from './validation.js';

export const CURRENT_KEY = 'nina-finance.state.v2';
export const PREVIOUS_KEY = 'nina-finance.previous.v2';
function readEnvelope(raw) {
  const envelope = JSON.parse(raw);
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 1) throw new Error('Некоректна версія сховища.');
  return { revision: envelope.revision, state: migrateState(envelope.state) };
}
/** localStorage single-key writes are atomic. Keep a validated previous generation. */
export class StateRepository {
  constructor(storage) { this.storage = storage; this.revision = 0; this.lastRaw = null; }
  load() {
    const raw = this.storage.getItem(CURRENT_KEY);
    if (!raw) {
      const previous = this.storage.getItem(PREVIOUS_KEY);
      if (!previous) return { state: null, recovered: false };
      const envelope = readEnvelope(previous);
      this.revision = envelope.revision; this.lastRaw = null;
      return { state: envelope.state, recovered: true };
    }
    try {
      const envelope = readEnvelope(raw);
      this.revision = envelope.revision; this.lastRaw = raw;
      return { state: envelope.state, recovered: false };
    } catch {
      const previous = this.storage.getItem(PREVIOUS_KEY);
      if (!previous) throw new Error('Збережені дані пошкоджено. Завантажте резервну копію; пошкоджений запис не буде перезаписано автоматично.');
      const envelope = readEnvelope(previous);
      this.revision = envelope.revision; this.lastRaw = raw;
      return { state: envelope.state, recovered: true };
    }
  }
  save(state) {
    validateState(state);
    const currentRaw = this.storage.getItem(CURRENT_KEY);
    if (currentRaw !== this.lastRaw) throw new Error('Дані змінилися в іншій вкладці. Оновіть сторінку перед наступною зміною.');
    const nextRaw = JSON.stringify({ revision: this.revision + 1, state });
    try {
      if (this.lastRaw) {
        try { readEnvelope(this.lastRaw); this.storage.setItem(PREVIOUS_KEY, this.lastRaw); } catch (error) {
          if (error.name === 'QuotaExceededError' || error.name === 'SecurityError') throw error;
        }
      }
      this.storage.setItem(CURRENT_KEY, nextRaw);
    } catch { throw new Error('Не вдалося зберегти. Перевірте вільне місце й дозвіл браузера на зберігання. Зміна не застосована.'); }
    this.lastRaw = nextRaw; this.revision += 1;
  }
  import(state) {
    validateState(state);
    this.lastRaw = this.storage.getItem(CURRENT_KEY);
    this.save(state);
  }
}
