// FINAL UI CONTRACT — approved mockups are the source of truth.
// Keeps finance engine/state/actions intact and replaces only the visual shell.

Object.assign(dict.ru,{
  storageCurrencyShort:'Валюта Хранилища', ratesAuto:'Обновляется автоматически', appearance:'Внешний вид', myBudget:'Мой бюджет', calmFinance:'Спокойные финансы для счастливой жизни',
  backupTitle:'Резервная копия', exportData:'Экспорт данных', importData:'Импорт данных', allWeeks:'Все недели', categoriesPlan:'Категории плана',
  courseToMdl:'Курс к MDL', storageAndCurrency:'Хранилище и валюта', currentBalance:'Текущий баланс',
  expensesTab:'Расходы', income:'Доходы', chooseWeek:'Выбрать неделю', planned:'Запланирована', topUp:'Пополнить', withdraw:'Снять',
  directHero:'Зай, тут всё просто ♥', directHeroCopy:'Смотри баланс, текущую неделю и расходы — всё главное рядом.',
  emptyWeekCopy:'Добавь первый расход — дальше всё посчитается само.', noRateYet:'Курс ещё не получен', household:'Дом', health:'Здоровье', gifts:'Подарки'
});
Object.assign(dict.uk,{
  storageCurrencyShort:'Валюта Сховища', ratesAuto:'Оновлюється автоматично', appearance:'Зовнішній вигляд', myBudget:'Мій бюджет', calmFinance:'Спокійні фінанси для щасливого життя',
  backupTitle:'Резервна копія', exportData:'Експорт даних', importData:'Імпорт даних', allWeeks:'Усі тижні', categoriesPlan:'Категорії плану',
  courseToMdl:'Курс до MDL', storageAndCurrency:'Сховище і валюта', currentBalance:'Поточний баланс',
  expensesTab:'Витрати', income:'Доходи', chooseWeek:'Обрати тиждень', planned:'Запланований', topUp:'Поповнити', withdraw:'Зняти',
  directHero:'Зай, тут усе просто ♥', directHeroCopy:'Дивись баланс, поточний тиждень і витрати — усе головне поруч.',
  emptyWeekCopy:'Додай першу витрату — далі все порахується саме.', noRateYet:'Курс ще не отримано', household:'Дім', health:'Здоров’я', gifts:'Подарунки'
});

// The contract is the only active UI renderer. These helpers deliberately live
// beside it, so the page never depends on an earlier experimental renderer.
function resolvedDarkFinal(){
  const pref=state.preferences.theme;
  return pref==='dark'||(pref==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
}
function activeWeekFinal(){
  const mm=m();
  return mm.weeks.find(x=>x.id===view.week)||mm.weeks.find(x=>x.status!=='closed')||mm.weeks.at(-1);
}
function progressFinal(spent,fund){
  const raw=fund>0?(spent/fund)*100:0;
  return {bar:Math.max(0,Math.min(100,raw)),left:Math.max(0,100-raw)};
}
function moneyPlain(minor,currency=state.storage.currency){return fmt(Number(minor)||0,currency)}
function weekDatesFinal(weekId){
  const [year,month]=m().id.split('-').map(Number),start=1+(Number(weekId)-1)*7,last=new Date(year,month,0).getDate(),end=Math.min(last,start+6);
  const monthName=new Intl.DateTimeFormat(lang()==='uk'?'uk-UA':'ru-RU',{month:'long'}).format(new Date(year,month-1,1));
  return `${start}–${end} ${monthName} ${year}`;
}
function secondaryBalanceFinal(){
  if(state.storage.currency==='MDL')return '';
  const rate=safe(()=>core.getRate(state,state.storage.currency,'MDL'),null);
  return rate?moneyPlain(Math.round(state.storage.balance*rate),'MDL'):'';
}

function contractIcon(c){return({products:'🧺',household:'⌂',transport:'🚙',leisure:'♡',clothes:'👕',health:'♡',gifts:'🎁',other:'•••'})[c]||'•'}
function contractLabel(c){return ({household:tr('household'),health:tr('health'),gifts:tr('gifts')})[c]||tr(c)||c}
function contractCategoryTotal(c){let sum=0;for(const ww of m().weeks)for(const x of ww.expenses||[])if(x.category===c)sum+=x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0);return sum}
function contractRateMdl(){if(state.storage.currency==='MDL')return 1;return safe(()=>core.getRate(state,state.storage.currency,'MDL'),null)}
function contractMonthLabel(){const [y,mo]=m().id.split('-').map(Number);return new Intl.DateTimeFormat(lang()==='uk'?'uk-UA':'ru-RU',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1))}
function contractObligationLabel(x){return x.name==='rent'?tr('housing'):x.name==='utilities'?tr('utilities'):x.name==='school'?tr('school'):x.name}
function contractObligationIcon(x){return x.name==='rent'?'⌂':x.name==='utilities'?'▥':x.name==='school'?'🎓':'•••'}
function contractUsedCurrencies(){const mm=m(),s=new Set([...mm.obligations.map(x=>x.currency),...mm.weeks.map(x=>x.fund.currency)]);s.delete(state.storage.currency);return [...s]}
function contractThemeButton(value,icon,label){return `<button class="ct-theme-choice ${state.preferences.theme===value?'active':''}" data-theme-choice="${value}"><i>${icon}</i><span>${label}</span></button>`}
function contractSecondaryBalance(){return secondaryBalanceFinal()}

function contractNav(){const items=[['home','⌂','home'],['week','▤','expensesTab'],['plan','▦','plan'],['storage','▣','storageTab'],['more','•••','more']];return `<nav class="ct-nav">${items.map(([id,ico,key])=>`<button class="ct-nav-item ${view.tab===id?'active':''}" data-tab="${id}"><b>${ico}</b><span>${tr(key)}</span></button>`).join('')}</nav>`}
function contractTop(kind='home'){
  if(kind==='home')return `<header class="ct-top ct-top-home"><button class="ct-top-icon" aria-hidden="true">♡</button><div class="ct-brand">${resolvedDarkFinal()?tr('title'):'Ninochka'} <span>♥</span></div><button class="ct-top-icon" data-action="settings" aria-label="${tr('settings')}">⚙</button></header>`;
  const title=kind==='storage'?tr('storage'):kind==='plan'?tr('plan'):kind==='more'?tr('more'):tr('currentWeek');
  return `<header class="ct-top"><button class="ct-top-icon" data-final-action="back-home">‹</button><div class="ct-brand ct-brand-small">${title}</div><button class="ct-top-icon ${kind==='storage'?'':'ct-hidden'}" ${kind==='storage'?'data-action="settings"':''}>${kind==='storage'?'⚙':'•'}</button></header>`
}

function contractQuickCategories(){const cats=['products','household','transport','leisure'];return `<div class="ct-category-grid">${cats.map(c=>`<button class="ct-category" data-final-action="quick-expense" data-category="${c}"><i>${contractIcon(c)}</i><span>${contractLabel(c)}</span><strong>${fmt(contractCategoryTotal(c))}</strong></button>`).join('')}</div>`}
function contractWeekCard(ww){const spent=safe(()=>core.weekSpent(state,ww),0),fund=safe(()=>core.fundInStorage(state,ww),0),left=fund-spent,p=progressFinal(spent,fund);return `<button class="ct-week-card" data-final-action="open-week"><div class="ct-week-card-head"><div><small>${tr('currentWeek')}</small><h2>${tr('weekN')} ${ww.id}</h2><em>${weekDatesFinal(ww.id)}</em></div><span>›</span></div><div class="ct-week-pair"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><div><small>${left<0?tr('overspend'):tr('left')}</small><strong class="${left<0?'negative':'positive'}">${moneyPlain(Math.abs(left))}</strong></div></div><div class="ct-progress"><i style="width:${p.bar}%"></i></div><div class="ct-progress-copy"><span>${tr('spent')} <b>${moneyPlain(spent)}</b></span><span>${Math.round(p.left)}% ${tr('remainingPercent').toLowerCase()}</span></div></button>`}

function contractHome(){const ww=activeWeekFinal(),sec=contractSecondaryBalance();return `${contractTop('home')}
<section class="ct-home-hero ${resolvedDarkFinal()?'dark':'light'}"><div class="ct-home-hero-copy"><h1>${resolvedDarkFinal()?tr('directHero'):'Ninochka ♥'}</h1><p>${resolvedDarkFinal()?tr('directHeroCopy'):(lang()==='uk'?'Спокійніше з грошима. Більше часу на головне. ♥':'Спокойнее с деньгами. Больше времени на главное. ♥')}</p></div></section>
<section class="ct-balance-card"><div><small>${tr('balance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><button class="ct-primary" data-final-action="storage-add">＋ ${tr('topUp')}</button></section>
${contractQuickCategories()}${contractWeekCard(ww)}
<div class="ct-home-actions"><button class="ct-primary" data-action="expense-add">＋ ${tr('addExpense')}</button><button class="ct-soft" data-tab="plan">▦ ${tr('plan')}</button></div>`}

function contractWeek(){const ww=w(),spent=safe(()=>core.weekSpent(state,ww),0),fund=safe(()=>core.fundInStorage(state,ww),0),left=fund-spent,p=progressFinal(spent,fund),first=m().weeks[0].id,last=m().weeks.at(-1).id;return `${contractTop('week')}<section class="ct-week-page">
<div class="ct-week-heading"><button class="ct-circle" data-week-step="-1" ${ww.id<=first?'disabled':''}>‹</button><button class="ct-week-title" data-final-action="week-list"><small>${tr('currentWeek')}</small><h1>${tr('weekN')} ${ww.id}</h1><span>${weekDatesFinal(ww.id)}</span><em class="${ww.status==='closed'?'closed':'open'}">● ${ww.status==='closed'?tr('closed'):tr('open')}</em></button><button class="ct-circle" data-week-step="1" ${ww.id>=last?'disabled':''}>›</button></div>
<section class="ct-week-main"><div class="ct-fund-row"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><button data-tab="plan">✎</button></div><div class="ct-week-stats"><div><small>${tr('spent')}</small><strong class="ct-pink">${moneyPlain(spent)}</strong></div><div><small>${left<0?tr('overspend'):tr('left')}</small><strong class="${left<0?'negative':'positive'}">${moneyPlain(Math.abs(left))}</strong></div></div><div class="ct-progress"><i style="width:${p.bar}%"></i></div></section>
<button class="ct-primary ct-full" data-action="expense-add">＋ ${tr('addExpense')}</button><div class="ct-segment"><button class="active">${tr('expensesTab')}</button><button disabled>${tr('income')}</button></div>
<section class="ct-expenses">${ww.expenses?.length?ww.expenses.map(x=>`<button class="ct-expense-row" data-action="expense-edit" data-id="${x.id}"><i>${contractIcon(x.category)}</i><span><b>${escape(x.name)}</b><small>${contractLabel(x.category)} · ${x.currency}</small></span><strong>${moneyPlain(x.amount,x.currency)}</strong><em>›</em></button>`).join(''):`<div class="ct-empty"><div class="ct-empty-art"></div><b>${tr('noExpenses')}</b><span>${tr('emptyWeekCopy')}</span></div>`}</section>${ww.status==='closed'?`<button class="ct-soft ct-full" data-action="week-reopen">${tr('reopenWeek')}</button>`:`<button class="ct-soft ct-full" data-action="week-close">${tr('closeWeek')}</button>`}</section>`}

function contractWeekList(){const current=activeWeekFinal();return `${contractTop('week')}<section class="ct-week-list"><h1>${tr('chooseWeek')}</h1>${m().weeks.map(ww=>{const spent=safe(()=>core.weekSpent(state,ww),0);return `<button class="ct-week-list-row ${ww.id===current.id?'current':''} ${ww.status==='closed'?'closed':''}" data-week-select="${ww.id}"><i>▣</i><span><small>${ww.id===current.id?tr('currentWeek'):tr('weekN')+' '+ww.id}</small><b>${tr('weekN')} ${ww.id}</b><em>${weekDatesFinal(ww.id)}</em><u>● ${ww.status==='closed'?tr('closed'):ww.id===current.id?tr('open'):tr('planned')}</u></span>${ww.status==='closed'?`<strong>${moneyPlain(spent)}</strong>`:'<strong>›</strong>'}</button>`}).join('')}<div class="ct-week-note">${lang()==='uk'?'Кожен тиждень — маленький крок до великих планів ♥':'Каждая неделя — маленький шаг к большим планам ♥'}</div></section>`}

function contractPlan(){const mm=m(),active=activeWeekFinal(),ps=safe(()=>core.planSummary(state,mm),null),used=contractUsedCurrencies();return `${contractTop('plan')}<section class="ct-plan-page"><div class="ct-segment"><button class="active">${tr('expensesTab')}</button><button disabled>${tr('income')}</button></div>
<section class="ct-card"><div class="ct-block-title"><div><small>${lang()==='uk'?'План на тиждень':'План на неделю'}</small><h2>${tr('allWeeks')}</h2></div></div><div class="ct-plan-weeks">${mm.weeks.map(ww=>`<div class="ct-plan-week ${ww.id===active.id?'active':''} ${ww.status==='closed'?'closed':''}"><i>▣</i><div><b>${tr('weekN')} ${ww.id}</b><span>${weekDatesFinal(ww.id)}</span><em>● ${ww.status==='closed'?tr('closed'):ww.id===active.id?tr('open'):tr('planned')}</em></div><label><input class="ct-money" data-replace-on-focus name="fund-${ww.id}" inputmode="decimal" value="${escape(planDraftValue('funds',ww.id,'amount',core.moneyInput(ww.fund.amount)))}"><select name="fundcur-${ww.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('funds',ww.id,'currency',ww.fund.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div></section>
<section class="ct-card"><div class="ct-block-title"><div><small>${tr('categoriesPlan')}</small><h2>${tr('mandatory')}</h2></div><button class="ct-link" data-action="obligation-add">＋ ${tr('addItem')}</button></div><div class="ct-obligations">${mm.obligations.map(x=>`<div class="ct-obligation plan-row"><i>${contractObligationIcon(x)}</i><div><b>${escape(contractObligationLabel(x))}</b><span>${x.currency}</span></div><input type="hidden" name="oblname-${x.id}" value="${escape(planDraftValue('obligations',x.id,'name',contractObligationLabel(x)))}"><label><input class="ct-money" data-replace-on-focus name="oblamount-${x.id}" inputmode="decimal" value="${escape(planDraftValue('obligations',x.id,'amount',core.moneyInput(x.amount)))}"><select name="oblcur-${x.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('obligations',x.id,'currency',x.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div></section>
${used.length?`<section class="ct-card"><div class="ct-block-title"><div><small>${tr('rates')}</small><h2>${lang()==='uk'?'Курси для плану':'Курсы для плана'}</h2></div><button class="ct-link" data-action="rates-refresh">${tr('refreshRates')}</button></div>${used.map(c=>{const r=core.getRate(state,c,state.storage.currency);return `<div class="ct-rate-editor plan-row"><b>1 ${c} = ${r?String(r):'—'} ${state.storage.currency}</b><span>${r?tr('rateAuto'):tr('rateNeeded')} · ${tr('manualRate')}</span><label><span>1 ${c} → ${state.storage.currency}</span><input data-replace-on-focus inputmode="decimal" name="rate-${c}" placeholder="${r||''}"><button class="ct-soft" data-action="rate-save" data-currency="${c}">${tr('save')}</button></label></div>`}).join('')}</section>`:''}
<section class="ct-card ct-plan-summary">${ps?`<div><span>${tr('mandatory')}</span><b>${fmt(ps.mandatory)}</b></div><div><span>${tr('fourWeeks')}</span><b>${fmt(ps.weekly)}</b></div><div><span>${tr('planTotal')}</span><b>${fmt(ps.total)}</b></div><div><span>${tr('reserve')}</span><b class="${ps.reserve<0?'negative':'positive'}">${fmt(ps.reserve)}</b></div>`:`<p>${tr('missingRate')}</p>`}<button class="ct-primary ct-full" data-action="plan-preview">${tr('checkPlan')}</button></section></section>`}

function contractStorage(){const sec=contractSecondaryBalance(),r=contractRateMdl();return `${contractTop('storage')}<section class="ct-storage-page"><section class="ct-storage-hero"><div class="ct-storage-balance"><small>${tr('currentBalance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><div class="ct-storage-actions"><button class="ct-primary" data-final-action="storage-add">＋ ${tr('topUp')}</button><button class="ct-soft" data-final-action="storage-sub">− ${tr('withdraw')}</button></div><div class="ct-storage-art"></div></section>
<section class="ct-card ct-rate-card"><div class="ct-block-title"><div><small>${tr('storageAndCurrency')}</small><h2>${tr('currencyRates')}</h2></div><button class="ct-link" data-approved-action="refresh-storage-rate">${tr('refreshRates')}</button></div><div class="ct-rate-grid"><label><span>${tr('storageCurrencyShort')}</span><select data-action="storage-currency">${core.CURRENCIES.map(c=>`<option ${c===state.storage.currency?'selected':''}>${c}</option>`).join('')}</select></label><div><span>${tr('courseToMdl')}</span><b>${r?r.toFixed(2):'—'}</b></div></div><div class="ct-rate-line"><span>${r?`1 ${state.storage.currency} = ${r.toFixed(2)} MDL`:tr('noRateYet')}</span><button class="ct-link" data-approved-action="refresh-storage-rate">↻</button></div></section></section>`}

function contractMore(){const nbTotal=state.nbEntries.reduce((s,x)=>s+(x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0)),0);return `${contractTop('more')}<section class="ct-more-page"><section class="ct-profile"><div class="ct-avatar">♥</div><div><h2>${tr('myBudget')}</h2><p>${tr('calmFinance')}</p></div></section>
<section class="ct-card"><h2>${tr('appearance')}</h2><div class="ct-theme-grid">${contractThemeButton('light','☀',tr('light'))}${contractThemeButton('auto','♥',tr('auto'))}${contractThemeButton('dark','☾',tr('dark'))}</div></section>
<section class="ct-menu"><button data-tab="storage"><i>💱</i><span><b>${tr('storageCurrencyShort')}</b><small>${state.storage.currency}</small></span><em>›</em></button><button data-approved-action="refresh-storage-rate"><i>↻</i><span><b>${tr('currencyRates')}</b><small>${tr('ratesAuto')}</small></span><em>›</em></button><label><i>🌐</i><span><b>${tr('language')}</b></span><select data-setting="language"><option value="ru" ${lang()==='ru'?'selected':''}>Русский</option><option value="uk" ${lang()==='uk'?'selected':''}>Українська</option></select></label><button data-action="tutorial"><i>ⓘ</i><span><b>${tr('tutorial')}</b></span><em>›</em></button></section>
<section class="ct-card ct-nb"><div><small>${tr('nb')}</small><strong>${fmt(nbTotal)}</strong><p>${tr('nbHint')}</p></div><button class="ct-primary" data-action="nb-add">＋ ${tr('addIncome')}</button></section>
<section class="ct-card"><h2>${tr('backupTitle')}</h2><div class="ct-backup"><button class="ct-soft" data-action="export">${tr('exportData')}</button><label class="ct-soft">${tr('importData')}<input type="file" id="import-file" accept="application/json,.json" hidden></label></div></section></section>`}

function renderOnboardingFinal(i){
  document.querySelector('.onboarding')?.remove();
  const slides=[['on1t','on1c'],['on2t','on2c'],['on3t','on3c'],['on4t','on4c']];
  const [title,copy]=slides[i],el=document.createElement('div');
  el.className='onboarding ct-onboarding';
  el.innerHTML=`<div class="ct-onboarding-art ct-onboarding-art-${i+1}"></div><section class="ct-onboarding-sheet"><div class="ct-onboarding-index">${i+1} / ${slides.length}</div><h1>${tr(title)}</h1><p>${tr(copy)}</p><div class="ct-onboarding-dots">${slides.map((_,n)=>`<i class="${n===i?'active':''}"></i>`).join('')}</div><button class="ct-primary" data-onboard="${i<slides.length-1?i+1:'done'}">${i<slides.length-1?tr('next'):tr('start')}</button></section>`;
  document.body.append(el);
}
renderOnboarding=renderOnboardingFinal;

function storageAdjustmentModal(kind){
  const adding=kind==='add', sign=adding?'＋':'−', verb=adding?tr('topUp'):tr('withdraw');
  showModal(verb,`${field('amount',tr('amount'),'','inputmode="decimal" placeholder="0.00"')}${currencySelect('currency',state.storage.currency)}${field('note',tr('note'),'','placeholder="'+tr('note')+'"')}<div class="modal-actions"><button class="btn primary" data-final-storage="${adding?'add':'sub'}">${sign} ${verb}</button></div>`);
}
function quickExpenseModal(category){
  const ww=w();
  showModal(tr('addExpense'),`${field('name',tr('name'),tr(category),'placeholder="'+tr('restaurant')+'"')}${field('amount',tr('amount'),'','inputmode="decimal" placeholder="0.00"')}${currencySelect('currency',state.storage.currency)}<input type="hidden" name="category" value="${category}"><div class="modal-actions"><button class="btn primary" data-action="expense-save">${tr('save')}</button></div>`);
}

render=function(){setDoc();let body='';if(view.tab==='home')body=contractHome();else if(view.tab==='week')body=view.weekMode==='list'?contractWeekList():contractWeek();else if(view.tab==='plan')body=contractPlan();else if(view.tab==='storage')body=contractStorage();else body=contractMore();app.innerHTML=`<div class="app ct-app">${body}</div>${contractNav()}`;if(!state.preferences.onboardingSeen)renderOnboardingFinal(0)};

document.addEventListener('click',e=>{
  const selected=e.target.closest('[data-week-select]');
  if(selected){e.preventDefault();e.stopImmediatePropagation();view.week=Number(selected.dataset.weekSelect);view.weekMode='detail';render();return}
  const action=e.target.closest('[data-final-action]');
  if(!action)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(action.dataset.finalAction==='back-home'){view.tab='home';view.weekMode='detail';render();return}
  if(action.dataset.finalAction==='open-week'){view.tab='week';view.week=firstOpenWeekId();view.weekMode='detail';render();return}
  if(action.dataset.finalAction==='week-list'){view.weekMode='list';render();return}
  if(action.dataset.finalAction==='storage-add'){storageAdjustmentModal('add');return}
  if(action.dataset.finalAction==='storage-sub'){storageAdjustmentModal('sub');return}
  if(action.dataset.finalAction==='quick-expense'){quickExpenseModal(action.dataset.category||'other')}
},true);
document.addEventListener('click',e=>{
  const action=e.target.closest('[data-final-storage]');
  if(!action)return;
  e.preventDefault();e.stopImmediatePropagation();
  (async()=>{try{await ensureRateFor(val('currency'));const amount=val('amount');core.adjustStorage(state,action.dataset.finalStorage==='sub'?`-${amount}`:amount,val('currency'),val('note'));closeModal();persist()}catch(error){notify(errorMessage(error))}})();
},true);

async function decodeContractArtwork(variable,path){
  try{
    const response=await fetch(path,{cache:'force-cache'});
    if(!response.ok)throw new Error('asset unavailable');
    const binary=atob((await response.text()).replace(/\s+/g,''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    document.documentElement.style.setProperty(variable,`url("${URL.createObjectURL(new Blob([bytes],{type:'image/webp'}))}")`);
  }catch(error){console.warn(`Ninochka artwork unavailable: ${path}`,error)}
}
decodeContractArtwork('--approved-dark-hero','./assets/final-dark-hero.b64');
decodeContractArtwork('--approved-light-home','./assets/final-light-home.b64');
decodeContractArtwork('--ct-storage-art','./assets/storage-approved.b64');
decodeContractArtwork('--ct-week-empty','./assets/week-empty-approved.b64');

view.weekMode='detail';render();
