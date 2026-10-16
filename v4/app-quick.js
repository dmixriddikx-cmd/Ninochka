// VNN — optional iOS Shortcuts quick expense setup.
// Only creates a personal, restricted quick-add token after normal VNN sign-in.
const originalQuickPanel = globalThis.NinochkaSync.panel;
globalThis.NinochkaSync.panel = function () {
  return originalQuickPanel() + (sync.connected
    ? '<section class="ct-card" style="margin-top:16px;padding:16px">' +
      '<strong>＋ Расход — быстрый ввод</strong>' +
      '<p class="ct-profile-note">Ввести только сумму прямо с экрана iPhone. ' +
      'Категория: «Страна пропитого и прогулянного».</p>' +
      '<button type="button" class="ct-soft" data-quick-setup>Настроить кнопку на iPhone</button>' +
      '</section>'
    : '');
};

async function showQuickSetup() {
  if (!sync.connected || sync.busy || sync.paused) return notify('Сначала войди в общий бюджет');
  try {
    const response = await syncRequest('POST', { action: 'quick-token' });
    const token = String(response.token || '');
    if (!/^[A-Za-z0-9._-]+$/.test(token) || token.length < 32)
      throw new Error('Не удалось создать ключ');
    const expired = new Date(response.expiresAt).toLocaleDateString('ru-RU');
    const endpoint = SYNC_API + '/api/sync';
    showModal('＋ Расход — iPhone', `
      <p class="note">Это личный ключ для команды «＋ Расход». Никому не пересылай его и не добавляй в публичную ссылку.</p>
      <label class="field"><span>Личный ключ (действует до ${escape(expired)})</span>
        <textarea data-quick-token readonly rows="3" spellcheck="false"
          style="width:100%;font-size:12px;overflow-wrap:anywhere">${escape(token)}</textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn primary" data-quick-copy>Скопировать ключ</button>
      </div>
      <p class="note"><b>Настройка команды Apple «Команды»:</b><br>
        1. Добавь «Запросить ввод» → тип «Число» → вопрос «Сколько потратили?».<br>
        2. Добавь «Текущая дата» → «Форматировать дату» → формат yyyy-MM-dd.<br>
        3. Добавь «Создать UUID» (уникальный ID операции).<br>
        4. Добавь «Получить содержимое URL»: POST, JSON, адрес ниже. Заголовок Authorization: Bearer + твой ключ.<br>
        5. Поля JSON: action = quick-add; id = UUID; date = форматированная дата; amount = введённое число.<br>
        6. Добавь «Показать результат» и закрепи команду на экране «Домой» как «＋ Расход».<br>
        Валюта по умолчанию — валюта Хранилища. Если хочешь другую, можно добавить поле currency.
        При ошибке сети повторяй отправку с тем же UUID и теми же полями. Новый UUID означает новую покупку.
        Показывай успех только при ответе saved = true.
      </p>
      <label class="field"><span>Адрес отправки</span>
        <input type="text" readonly value="${escape(endpoint)}" style="width:100%" />
      </label>
      <p class="note">Готовые шаблоны команд по iCloud пока не опубликованы: делиться командой с ключом внутри нельзя.</p>
    `);
  } catch (error) {
    notify(error?.message || 'Не удалось подготовить быстрый ввод');
  }
}
document.addEventListener('click', async event => {
  const setup = event.target.closest('[data-quick-setup]');
  if (setup) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await showQuickSetup();
    return;
  }
  const copy = event.target.closest('[data-quick-copy]');
  if (!copy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const input = modal.querySelector('[data-quick-token]');
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    notify('Ключ скопирован. Вставь его только в свою личную команду.');
  } catch {
    input.focus();
    input.select();
    notify('Выдели и скопируй ключ вручную.');
  }
}, true);
