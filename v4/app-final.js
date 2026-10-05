// Final reference-driven UI layer. Keeps the existing finance engine and actions.
const _legacyPlanPageFinal = planPage;
const _legacyMorePageFinal = morePage;
const _legacySettingsModalFinal = settingsModal;

Object.assign(dict.ru,{
  expensesTab:'Расходы',storageTab:'Хранилище',chooseWeek:'Выбрать неделю',currentWeek:'Текущая неделя',planned:'Запланирована',
  topUp:'Пополнить',withdraw:'Снять',quickActions:'Быстрые действия',planAction:'Запланировать',income:'Доход',description:'Описание',
  health:'Здоровье',gifts:'Подарки',household:'Дом',newExpense:'Новый расход',expense:'Расход',saveTemplate:'Сохранить как шаблон',
  allUnderControl:'Всё под контролем',lightGreeting:'Привет! Всё под контролем ♥',directHero:'Зай, тут всё просто ♥',
  directHeroCopy:'Смотри баланс, текущую неделю и расходы — всё главное рядом.',
  on1t:'Зай, тут всё просто ♥',on1c:'Смотри баланс, текущую неделю и главное по расходам — ничего искать не нужно.',
  on2t:'Планируй неделю',on2c:'Задай фонд недели, проверь обязательные расходы и оставь запас. Остальное посчитается само.',
  on3t:'Вноси расходы',on3c:'Выбирай категорию, сумму и валюту. Нажала «Сохранить» — и всё уже учтено.',
  on4t:'Для тебя ♥',on4c:'Я сделал это, чтобы с деньгами было меньше возни, а у нас — больше времени друг на друга. Люблю тебя.',
  emptyWeekCopy:'Добавь первый расход, чтобы начать вести учёт.',storageSubtitle:'Общий баланс и актуальная валюта',themeName:'Тема приложения'
});
Object.assign(dict.uk,{
  expensesTab:'Витрати',storageTab:'Сховище',chooseWeek:'Обрати тиждень',currentWeek:'Поточний тиждень',planned:'Заплановано',
  topUp:'Поповнити',withdraw:'Зняти',quickActions:'Швидкі дії',planAction:'Запланувати',income:'Дохід',description:'Опис',
  health:'Здоров’я',gifts:'Подарунки',household:'Дім',newExpense:'Нова витрата',expense:'Витрата',saveTemplate:'Зберегти як шаблон',
  allUnderControl:'Усе під контролем',lightGreeting:'Привіт! Усе під контролем ♥',directHero:'Зай, тут усе просто ♥',
  directHeroCopy:'Дивись баланс, поточний тиждень і витрати — усе головне поруч.',
  on1t:'Зай, тут усе просто ♥',on1c:'Дивись баланс, поточний тиждень і головне по витратах — нічого шукати не треба.',
  on2t:'Плануй тиждень',on2c:'Задай фонд тижня, перевір обов’язкові витрати й залиш запас. Решта порахується сама.',
  on3t:'Внось витрати',on3c:'Обирай категорію, суму й валюту. Натиснула «Зберегти» — і все вже враховано.',
  on4t:'Для тебе ♥',on4c:'Я зробив це, щоб із грошима було менше мороки, а в нас — більше часу одне на одного. Люблю тебе.',
  emptyWeekCopy:'Додай першу витрату, щоб почати облік.',storageSubtitle:'Загальний баланс і актуальна валюта',themeName:'Тема застосунку'
});

function resolvedDarkFinal(){
  const p=state.preferences.theme;
  return p==='dark'||(p==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
}
function moneyPlain(minor,c=state.storage.currency){return fmt(minor,c)}
function weekDatesFinal(id){
  const [y,mo]=m().id.split('-').map(Number), last=new Date(y,mo,0).getDate();
  const a=Math.min(last,(id-1)*7+1), b=Math.min(last,id*7);
  const mon=new Intl.DateTimeFormat(lang()==='uk'?'uk-UA':'ru-RU',{month:'short'}).format(new Date(y,mo-1,a)).replace('.','');
  return `${a}–${b} ${mon}`;
}
function secondaryBalanceFinal(){
  if(state.storage.currency==='MDL')return null;
  const r=safe(()=>core.getRate(state,'MDL',state.storage.currency),null);
  if(!r)return null;
  return fmt(Math.round(state.storage.balance/r),'MDL');
}
function categoryIconFinal(c){return({products:'🧺',household:'⌂',transport:'🚙',leisure:'♡',clothes:'👕',health:'♡',gifts:'🎁',other:'•••'})[c]||'•'}
function categoryLabelFinal(c){return ({household:tr('household'),health:tr('health'),gifts:tr('gifts')})[c]||tr(c)||c}
function categoryTotalFinal(c){
  let sum=0;
  for(const ww of m().weeks)for(const x of ww.expenses||[])if(x.category===c)sum+=x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0);
  return sum;
}
function progressFinal(spent,fund){const used=fund>0?Math.max(0,spent/fund*100):0;return{used,bar:Math.min(100,used),left:Math.max(0,100-used)}}
function activeWeekFinal(){return m().weeks.find(x=>x.status!=='closed')||m().weeks.at(-1)}

function topFinal(kind='home'){
  if(kind==='home')return `<header class="fx-top fx-top-home"><button class="fx-top-icon" aria-hidden="true">♡</button><div class="fx-brand">${resolvedDarkFinal()?tr('title'):'Ninochka'} <span>♥</span></div><button class="fx-top-icon" data-action="settings" aria-label="${tr('settings')}">⚙</button></header>`;
  const title=kind==='storage'?tr('storage'):kind==='plan'?tr('plan'):kind==='more'?tr('more'):tr('currentWeek');
  return `<header class="fx-top"><button class="fx-top-icon" data-final-action="back-home">‹</button><div class="fx-brand fx-brand-small">${title}</div><button class="fx-top-icon ${kind==='storage'?'':'fx-invisible'}" ${kind==='storage'?'data-action="settings"':''}>${kind==='storage'?'⚙':'•'}</button></header>`;
}
function navFinal(){
  const items=[['home','⌂','home'],['week','▤','expensesTab'],['plan','▦','plan'],['storage','▣','storageTab'],['more','•••','more']];
  return `<nav class="fx-nav">${items.map(([id,ico,key])=>`<button class="fx-nav-item ${view.tab===id?'active':''}" data-tab="${id}"><b>${ico}</b><span>${tr(key)}</span></button>`).join('')}</nav>`;
}
function categoryQuickFinal(){
  const cats=['products','household','transport','leisure'];
  return `<div class="fx-category-row">${cats.map(c=>`<button class="fx-category-card" data-final-action="quick-expense" data-category="${c}"><i>${categoryIconFinal(c)}</i><span>${categoryLabelFinal(c)}</span><strong>${moneyPlain(categoryTotalFinal(c))}</strong></button>`).join('')}</div>`;
}
function weekCompactFinal(ww){
  const spent=safe(()=>core.weekSpent(state,ww),0), fund=safe(()=>core.fundInStorage(state,ww),0), left=fund-spent, p=progressFinal(spent,fund);
  return `<section class="fx-card fx-week-compact" data-final-action="open-week"><div class="fx-section-head"><div><small>${tr('currentWeek')}</small><h2>${tr('weekN')} ${ww.id}</h2><em>${weekDatesFinal(ww.id)}</em></div><span>›</span></div><div class="fx-week-fund"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><div class="fx-week-remain"><small>${left<0?tr('overspend'):tr('left')}</small><strong class="${left<0?'negative':'positive'}">${moneyPlain(Math.abs(left))}</strong></div></div><div class="fx-progress"><i style="width:${p.bar}%"></i></div><div class="fx-week-bottom"><span>${tr('spent')} <b>${moneyPlain(spent)}</b></span><span>${tr('remainingPercent')} <b>${Math.round(p.left)}%</b></span></div></section>`;
}

function homeDarkFinal(){
  const ww=activeWeekFinal(), sec=secondaryBalanceFinal();
  return `${topFinal('home')}<section class="fx-hero fx-hero-dark"><div class="fx-hero-message"><b>${tr('directHero')}</b><span>${tr('directHeroCopy')}</span></div></section>
  <section class="fx-card fx-balance-card"><div><small>${tr('balance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><button class="fx-main-btn" data-final-action="storage-add">＋ ${tr('topUp')}</button></section>
  ${categoryQuickFinal()}${weekCompactFinal(ww)}`;
}
function homeLightFinal(){
  const ww=activeWeekFinal(), spent=safe(()=>core.weekSpent(state,ww),0), fund=safe(()=>core.fundInStorage(state,ww),0), left=fund-spent,p=progressFinal(spent,fund);
  return `${topFinal('home')}<section class="fx-light-intro"><div><small>Ninochka</small><h1>${tr('lightGreeting')}</h1></div><div class="fx-art fx-art-light-home"></div></section>
  <button class="fx-week-switch" data-final-action="open-week"><span>‹</span><div><small>${tr('currentWeek')}</small><b>${weekDatesFinal(ww.id)}</b></div><span>›</span></button>
  <section class="fx-card fx-light-week"><div class="fx-week-fund"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><div class="fx-week-remain"><small>${tr('left')}</small><strong>${moneyPlain(Math.abs(left))}</strong></div></div><div class="fx-progress"><i style="width:${p.bar}%"></i></div></section>
  ${categoryQuickFinal()}<div class="fx-quick-actions"><button class="fx-main-btn" data-action="expense-add">＋ ${tr('addExpense')}</button><button class="fx-soft-btn" data-tab="plan">▣ ${tr('planAction')}</button></div><div class="fx-light-photo"><div class="fx-art fx-art-light-home"></div><span>${lang()==='uk'?'Маленькі кроки — до великих планів ♥':'Маленькие шаги — к большим планам ♥'}</span></div>`;
}
function homeFinal(){return resolvedDarkFinal()?homeDarkFinal():homeLightFinal()}

function weekHeaderFinal(ww){
  const first=m().weeks[0].id,last=m().weeks.at(-1).id;
  return `<div class="fx-week-head"><button class="fx-circle" data-week-step="-1" ${ww.id<=first?'disabled':''}>‹</button><button class="fx-week-title" data-final-action="week-list"><small>${tr('currentWeek')}</small><h1>${tr('weekN')} ${ww.id}</h1><span>${weekDatesFinal(ww.id)}</span><em class="${ww.status==='closed'?'closed':'open'}">● ${ww.status==='closed'?tr('closed'):tr('open')}</em></button><button class="fx-circle" data-week-step="1" ${ww.id>=last?'disabled':''}>›</button></div>`;
}
function weekPageFinal(){
  const ww=w(),spent=safe(()=>core.weekSpent(state,ww),0),fund=safe(()=>core.fundInStorage(state,ww),0),left=fund-spent,p=progressFinal(spent,fund);
  return `${topFinal('week')}<section class="fx-week-page">${weekHeaderFinal(ww)}<section class="fx-card fx-week-main"><div class="fx-edit-line"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><button data-tab="plan">✎</button></div><div class="fx-week-stat-pair"><div><small>${tr('spent')}</small><strong class="fx-pink">${moneyPlain(spent)}</strong></div><div><small>${left<0?tr('overspend'):tr('left')}</small><strong class="${left<0?'negative':'positive'}">${moneyPlain(Math.abs(left))}</strong></div></div><div class="fx-progress fx-progress-green"><i style="width:${p.bar}%"></i></div></section><button class="fx-main-btn fx-full" data-action="expense-add">＋ ${tr('addExpense')}</button><div class="fx-segment"><button class="active">${tr('expensesTab')}</button><button disabled>${tr('income')}</button></div>
  <section class="fx-expense-list">${ww.expenses?.length?ww.expenses.map(x=>`<button class="fx-expense-row" data-action="expense-edit" data-id="${x.id}"><i>${categoryIconFinal(x.category)}</i><span><b>${escape(x.name)}</b><small>${categoryLabelFinal(x.category)} · ${x.currency}</small></span><strong>${moneyPlain(x.amount,x.currency)}</strong><em>›</em></button>`).join(''):`<div class="fx-empty"><div class="fx-art fx-art-week-empty"></div><b>${tr('noExpenses')}</b><span>${tr('emptyWeekCopy')}</span></div>`}</section><div class="fx-week-actions">${ww.status==='closed'?`<button class="fx-soft-btn fx-full" data-action="week-reopen">${tr('reopenWeek')}</button>`:`<button class="fx-soft-btn fx-full" data-action="week-close">${tr('closeWeek')}</button>`}</div></section>`;
}
function weekListFinal(){
  const mm=m(), current=activeWeekFinal();
  return `${topFinal('week')}<section class="fx-week-list-page"><h1>${tr('chooseWeek')}</h1>${mm.weeks.map(ww=>{const spent=safe(()=>core.weekSpent(state,ww),0);return `<button class="fx-week-row ${ww.id===current.id?'current':''} ${ww.status==='closed'?'is-closed':''}" data-week-select="${ww.id}"><i>▣</i><span><small>${ww.id===current.id?tr('currentWeek'):tr('weekN')+' '+ww.id}</small><b>${tr('weekN')} ${ww.id}</b><em>${weekDatesFinal(ww.id)}</em><u>● ${ww.status==='closed'?tr('closed'):ww.id===current.id?tr('open'):tr('planned')}</u></span>${ww.status==='closed'?`<strong>${moneyPlain(spent)}</strong>`:'<strong>›</strong>'}</button>`}).join('')}<div class="fx-week-window"><div class="fx-art fx-art-week-window"></div><span>${lang()==='uk'?'Кожен тиждень — маленький крок до великих планів ♥':'Каждая неделя — маленький шаг к большим планам ♥'}</span></div></section>`;
}

function expenseModalFinal(item=null,initialCategory='products'){
  const category=item?.category||initialCategory;
  const categories=['products','household','transport','leisure','clothes','health','gifts','other'];
  showModal(item?tr('edit'):tr('newExpense'),`<div class="fx-expense-modal"><div class="fx-segment fx-expense-kind"><button class="active">${tr('expense')}</button><button disabled>${tr('income')}</button></div><div class="fx-category-grid">${categories.map(c=>`<button type="button" class="${c===category?'active':''}" data-category-choice="${c}"><i>${categoryIconFinal(c)}</i><span>${categoryLabelFinal(c)}</span></button>`).join('')}</div><input type="hidden" name="category" value="${escape(category)}"><div class="fx-amount-line"><label class="field grow"><span>${tr('amount')}</span><input data-replace-on-focus name="amount" inputmode="decimal" autocomplete="off" value="${item?escape(core.moneyInput(item.amount)):''}" placeholder="50"></label>${currencySelect('currency',item?.currency||state.storage.currency)}</div><label class="field"><span>${tr('description')}</span><input name="name" autocomplete="off" value="${escape(item?.name||'')}" placeholder="${lang()==='uk'?'Наприклад: продукти, АТБ':'Например: продукты, АТБ'}"></label><div class="modal-actions">${item?`<button class="btn danger" data-action="expense-delete" data-id="${item.id}">${tr('delete')}</button>`:`<button class="btn ghost" data-action="modal-close">${tr('cancel')}</button>`}<button class="btn primary" data-action="expense-save" data-id="${item?.id||''}">${tr('save')}</button></div></div>`);
}

function storagePageFinal(){
  const sec=secondaryBalanceFinal();
  return `${topFinal('storage')}<section class="fx-storage-page"><section class="fx-storage-hero"><div><small>${tr('balance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><img src="./assets/storage-guards.svg" alt=""></section><div class="fx-storage-actions"><button class="fx-main-btn" data-final-action="storage-add">＋ ${tr('topUp')}</button><button class="fx-soft-btn" data-final-action="storage-sub">− ${tr('withdraw')}</button></div><section class="fx-card"><div class="fx-section-head"><div><small>${tr('storageSubtitle')}</small><h2>${tr('storageCurrency')}</h2></div></div><label class="field"><span>${tr('storageCurrency')}</span><select class="currency-pill" data-action="storage-currency">${core.CURRENCIES.map(c=>`<option ${c===state.storage.currency?'selected':''}>${c}</option>`).join('')}</select></label><div class="fx-rate-note">${state.storage.currency==='EUR'?'€':state.storage.currency==='USD'?'$':'L'} <b>${state.storage.currency}</b><button class="fx-soft-btn" data-tab="plan">${tr('rates')} →</button></div></section><section class="fx-card"><div class="fx-section-head"><h2>${tr('history')}</h2><button class="fx-soft-btn" data-action="history">${tr('openWeek')} →</button></div><p class="muted">${tr('storageWarmCopy')}</p></section></section>`;
}

function planPageFinal(){
  const raw=_legacyPlanPageFinal();
  return raw.replace(top(),topFinal('plan')).replaceAll('class="card"','class="card fx-card fx-plan-card"');
}
function morePageFinal(){
  const raw=_legacyMorePageFinal();
  return raw.replace(top(),topFinal('more')).replaceAll('class="card"','class="card fx-card"');
}

function renderOnboardingFinal(i){
  document.querySelector('.onboarding')?.remove();
  const slides=[['on1t','on1c'],['on2t','on2c'],['on3t','on3c'],['on4t','on4c']];
  const [tk,ck]=slides[i];
  const el=document.createElement('div');el.className='onboarding fx-onboarding';
  el.innerHTML=`<div class="fx-onboard-art fx-onboard-${i+1}"></div><div class="fx-onboard-sheet"><div class="fx-onboard-copy"><h1>${tr(tk)}</h1><p>${tr(ck)}</p></div><div class="dots">${slides.map((_,j)=>`<span class="dot ${j===i?'active':''}"></span>`).join('')}</div><button class="btn primary fx-onboard-btn" data-onboard="${i<3?i+1:'done'}">${i<3?tr('next'):tr('start')}</button></div>`;
  document.body.append(el);
}

function storageAdjustModalFinal(sign){
  showModal(sign>0?tr('topUp'):tr('withdraw'),`${field('amount',tr('amount'),sign<0?'-':'','inputmode="decimal" placeholder="0.00"')}${currencySelect('currency',state.storage.currency)}${field('note',tr('note'),'')}<div class="modal-actions"><button class="btn ghost" data-action="modal-close">${tr('cancel')}</button><button class="btn primary" data-action="balance-adjust">${sign>0?tr('topUp'):tr('withdraw')}</button></div>`)
}

nav=navFinal;
top=()=>topFinal('home');
home=homeFinal;
weekPage=weekPageFinal;
expenseModal=expenseModalFinal;
renderOnboarding=renderOnboardingFinal;
render=function(){
  setDoc();
  let body='';
  if(view.tab==='home')body=homeFinal();
  else if(view.tab==='week')body=view.weekMode==='list'?weekListFinal():weekPageFinal();
  else if(view.tab==='plan')body=planPageFinal();
  else if(view.tab==='storage')body=storagePageFinal();
  else body=morePageFinal();
  app.innerHTML=`<div class="app fx-app">${body}</div>${navFinal()}`;
  if(!state.preferences.onboardingSeen)renderOnboardingFinal(0);
};

document.addEventListener('click',e=>{
  const wk=e.target.closest('[data-tab="week"]');if(wk)view.weekMode='detail';
  const f=e.target.closest('[data-final-action]');
  if(f){
    const a=f.dataset.finalAction;
    if(a==='back-home'){e.preventDefault();e.stopImmediatePropagation();view.tab='home';render();return}
    if(a==='open-week'){e.preventDefault();e.stopImmediatePropagation();view.tab='week';view.week=activeWeekFinal().id;view.weekMode='detail';render();return}
    if(a==='week-list'){e.preventDefault();e.stopImmediatePropagation();view.weekMode='list';render();return}
    if(a==='storage-add'){e.preventDefault();e.stopImmediatePropagation();storageAdjustModalFinal(1);return}
    if(a==='storage-sub'){e.preventDefault();e.stopImmediatePropagation();storageAdjustModalFinal(-1);return}
    if(a==='quick-expense'){e.preventDefault();e.stopImmediatePropagation();expenseModalFinal(null,f.dataset.category||'products');return}
  }
  const sel=e.target.closest('[data-week-select]');
  if(sel){e.preventDefault();e.stopImmediatePropagation();view.week=Number(sel.dataset.weekSelect);view.weekMode='detail';render();return}
  const step=e.target.closest('[data-week-step]');
  if(step){e.preventDefault();e.stopImmediatePropagation();const ids=m().weeks.map(x=>x.id),idx=ids.indexOf(w().id),ni=idx+Number(step.dataset.weekStep);if(ni>=0&&ni<ids.length){view.week=ids[ni];view.weekMode='detail';render()}return}
  const cat=e.target.closest('[data-category-choice]');
  if(cat){e.preventDefault();e.stopImmediatePropagation();modal.querySelector('[name="category"]').value=cat.dataset.categoryChoice;modal.querySelectorAll('[data-category-choice]').forEach(x=>x.classList.toggle('active',x===cat));return}
},true);

view.weekMode='detail';
render();
