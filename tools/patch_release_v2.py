from pathlib import Path
import re, sys

p=Path(sys.argv[1])
h=p.read_text(encoding='utf-8')

h=h.replace("const DEFAULT_PREFERENCES = { language: 'uk', theme: 'auto', helpEnabled: true, onboardingSeen: false };",
            "const DEFAULT_PREFERENCES = { language: 'ru', theme: 'auto', helpEnabled: true, onboardingSeen: false };")

steps="""const steps = [
  {cat:'storage',preview:'home',uk:['Головна: тут усе починається','Після входу відкриється «Головна». Угорі — Хранилище: скільки грошей зараз реально є на рахунку. Нижче — «В плюс», обов’язкові витрати та чотири тижні. Перший крок: натисни «Додати / відняти» й внеси поточний баланс.'],ru:['Главная: здесь всё начинается','После входа откроется «Главная». Сверху — Хранилище: сколько денег сейчас реально есть на счёте. Ниже — «В плюс», обязательные расходы и четыре недели. Первый шаг: нажми «Добавить / вычесть» и внеси текущий баланс.']},
  {cat:'pencil',preview:'plan',uk:['План: обов’язкове та 4 тижні','Унизу натисни «План». Тут перевіряються Житло, Навчання та інші обов’язкові витрати, а нижче задається фонд для кожного з чотирьох тижнів. Усе Хранилище розподіляти не потрібно — залишок буде резервом. Валюту можна вибрати біля кожної суми.'],ru:['План: обязательное и 4 недели','Внизу нажми «План». Здесь проверяются Жильё, Учёба и другие обязательные расходы, а ниже задаётся фонд для каждой из четырёх недель. Всё Хранилище распределять не нужно — остаток останется резервом. Валюту можно выбрать возле каждой суммы.']},
  {cat:'weekly',preview:'spending',uk:['Витрати: що буде протягом місяця','У «Витратах» вибери потрібний тиждень і натисни «+ Додати». На екрані завжди видно фонд тижня, скільки вже витрачено і скільки залишилось. Після закриття тижня залишок піде у «В плюс» і Хранилище, а перевитрата спишеться з Хранилища. Фонд наступного тижня не зміниться. У «Ще» — мова, тема, курси та резервна копія.'],ru:['Расходы: что будет в течение месяца','В «Расходах» выбери нужную неделю и нажми «+ Добавить». На экране всегда видно фонд недели, сколько уже потрачено и сколько осталось. После закрытия недели остаток уйдёт в «В плюс» и Хранилище, а перерасход спишется из Хранилища. Фонд следующей недели не изменится. В «Ещё» — язык, тема, курсы и резервная копия.']},
  {cat:'sleeping',preview:'love',final:true,uk:['І останнє ❤️','Ніночко, просто нагадаю: я тебе люблю. Дуже. ❤️'],ru:['И последнее ❤️','Ниночка, просто напомню: я тебя люблю. Очень. ❤️']}
];"""
h,n=re.subn(r"const steps = \[.*?\n\];\nconst tutorialLength",steps+"\nconst tutorialLength",h,count=1,flags=re.S)
if n!=1: raise SystemExit('steps replacement failed')

preview="""const tutorialPreview = (type, language=getLanguage()) => {
  const ru=language==='ru';
  if(type==='home')return `<div class="tutorial-preview"><span>Хранилище</span><strong>12 450 €</strong><small>${ru?'Сколько сейчас есть на счёте':'Скільки зараз є на рахунку'}</small><div class="preview-row"><b>В плюс</b><b>${ru?'4 недели':'4 тижні'}</b></div></div>`;
  if(type==='plan')return `<div class="tutorial-preview"><div class="preview-title">${ru?'План месяца':'План місяця'}</div><div class="preview-list"><span>🏠 ${ru?'Жильё':'Житло'}</span><span>🎓 ${ru?'Учёба':'Навчання'}</span></div><div class="preview-weeks"><i>1</i><i>2</i><i>3</i><i>4</i></div></div>`;
  if(type==='spending')return `<div class="tutorial-preview"><div class="preview-title">${ru?'Неделя 2':'Тиждень 2'}</div><div class="preview-stats"><span><small>${ru?'Фонд':'Фонд'}</small><b>625 €</b></span><span><small>${ru?'Потрачено':'Витрачено'}</small><b>580 €</b></span><span><small>${ru?'Осталось':'Залишилось'}</small><b>45 €</b></span></div><div class="preview-nav"><b>⌂ ${ru?'Главная':'Головна'}</b><b>🧺 ${ru?'Расходы':'Витрати'}</b><b>⚙ ${ru?'Ещё':'Ще'}</b></div></div>`;
  return '';
};
const tutorialStep = index => {
  const step=steps[index], language=getLanguage(), [title,copy]=step[language];
  return {title,copy,cat:step.cat,preview:step.preview,final:Boolean(step.final),action:step.final ? (language==='ru'?'Открыть калькулятор':'Відкрити калькулятор') : null};
};"""
h,n=re.subn(r"const tutorialStep = index => \{.*?\n\};",preview,h,count=1,flags=re.S)
if n!=1: raise SystemExit('tutorialStep replacement failed')

old="${cat(step.cat)}<p>${escape(step.copy)}</p>"
new="${cat(step.cat)}<div class=\"tutorial-copy\">${step.preview && !isLast ? tutorialPreview(step.preview) : ''}<p>${escape(step.copy)}</p></div>"
if old not in h: raise SystemExit('tutorial card render not found')
h=h.replace(old,new,1)

style="""<style>
.help-card{align-items:flex-start!important}.help-card .tutorial-copy{flex:1;min-width:0}.help-card .tutorial-copy>p{margin:12px 0 0!important;line-height:1.65!important}
.tutorial-preview{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:13px 14px;box-shadow:0 8px 22px rgba(82,65,54,.06)}
.tutorial-preview>span,.tutorial-preview>small{display:block;color:var(--muted);font-size:10px}.tutorial-preview>strong{display:block;font:600 24px Georgia,serif;margin:3px 0 6px}
.preview-row,.preview-list,.preview-stats,.preview-nav{display:flex;gap:7px;flex-wrap:wrap}.preview-row b,.preview-list span{background:var(--white);border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:10px;font-weight:500}
.preview-title{font-size:11px;font-weight:650;margin-bottom:9px}.preview-weeks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:9px}.preview-weeks i{font-style:normal;text-align:center;border-radius:7px;background:var(--white);border:1px solid var(--line);padding:7px 0;font-size:10px}
.preview-stats{display:grid;grid-template-columns:repeat(3,1fr)}.preview-stats span{background:var(--white);border:1px solid var(--line);border-radius:8px;padding:8px}.preview-stats small,.preview-stats b{display:block}.preview-stats small{font-size:8px;color:var(--muted);margin-bottom:3px}.preview-stats b{font-size:10px}
.preview-nav{justify-content:space-between;border-top:1px solid var(--line);margin-top:10px;padding-top:9px}.preview-nav b{font-size:9px;font-weight:500;color:var(--muted)}
@media(max-width:460px){.help-card .tutorial-copy>p{font-size:13px!important}.tutorial-preview{padding:11px 12px}.tutorial-preview>strong{font-size:22px}}
</style>"""
if '</head>' not in h: raise SystemExit('head missing')
h=h.replace('</head>',style+'</head>',1)

if "'Головна':'Главная'" not in h:
    h=h.replace("const RUSSIAN = {\n","""const RUSSIAN = {
  'Головна':'Главная','Витрати':'Расходы','План':'План','Аналітика':'Аналитика','Ще':'Ещё',
  'Наш спільний баланс':'Наш общий баланс','Дім':'Дом','+ Додати':'+ Добавить',
  'Дата надходження':'Дата поступления','Категорія':'Категория','Назва категорії':'Название категории',
  'Це навчання завжди можна відкрити ще раз у налаштуваннях.':'Эту инструкцию всегда можно снова открыть в настройках.',
""",1)

for a,b in {
"'Збережено за весь час':'Сэкономлено за всё время'":"'Збережено за весь час':'Всего сохранено'",
"'Поточний баланс вашого банку':'Текущий баланс вашего банка'":"'Поточний баланс вашого банку':'Сколько сейчас есть на банковском счёте'",
"'Поточний баланс вашого банку':'Текущий остаток на банковском счёте'":"'Поточний баланс вашого банку':'Сколько сейчас есть на банковском счёте'",
"'Підготуйте цей місяць':'Подготовьте этот месяц'":"'Підготуйте цей місяць':'Настройте месяц'",
"'Почнімо з реального балансу':'Начнём с реального баланса'":"'Почнімо з реального балансу':'Сначала укажем реальный баланс'",
"'Фонди — це 4 тижні':'Фонды — это 4 недели'":"'Фонди — це 4 тижні':'Бюджет на 4 недели'",
"'Тижневий простір':'Недельный бюджет'":"'Тижневий простір':'Бюджет недели'",
"'На життя й на втіхи':'На жизнь и на радости'":"'На життя й на втіхи':'Повседневные расходы'",
"'Спершу — важливе':'Сначала — важное'":"'Спершу — важливе':'Сначала обязательное'",
"'Перенести у Хранилище':'Перенести в Хранилище'":"'Перенести у Хранилище':'Закрыть месяц'",
}.items(): h=h.replace(a,b)

boot="""state = loaded.state || createState();
  if (!loaded.state) repository.save(state);
  const rolled = rollover(state);"""
boot2="""state = loaded.state || createState();
  if (!loaded.state) repository.save(state);
  try {
    const release='onboarding-preview-v2', key='nina-family-finance:onboarding-release';
    if(localStorage.getItem(key)!==release){
      state=structuredClone(state); state.preferences={...state.preferences,onboardingSeen:false};
      repository.save(state); localStorage.setItem(key,release);
    }
  } catch {}
  const rolled = rollover(state);"""
if boot not in h: raise SystemExit('boot block missing')
h=h.replace(boot,boot2,1)

p.write_text(h,encoding='utf-8')
print('Applied onboarding preview release patch')
