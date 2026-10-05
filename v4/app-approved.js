// Approved-board implementation layer. This file intentionally overrides only UI renderers.
// Finance engine, persistence, calculations and existing action handlers stay intact.

Object.assign(dict.ru,{
  myBudget:'Мой бюджет',calmFinance:'Спокойные финансы для счастливой жизни',appearance:'Внешний вид',
  themeLight:'Светлая',themeAuto:'Авто',themeDark:'Тёмная',currencyRates:'Курсы валют',updated:'Обновляется автоматически',
  aboutApp:'О приложении',feedback:'Обратная связь',notifications:'Напоминания',weekReminder:'Напоминание о неделе',
  monthReminder:'Напоминание о конце месяца',planWeek:'План на неделю',plannedCategories:'Категории плана',
  allWeeks:'Все недели',budgetSummary:'Итог месяца',storageAndCurrency:'Хранилище и валюта',currentBalance:'Текущий баланс',
  warmLine:'Спокойнее с деньгами. Больше времени на главное. ♥',smallSteps:'Маленькие шаги — к большим планам ♥',
  togetherMore:'Вместе мы можем больше ♥',todayGood:'Сегодня тоже хороший день ♥',
  directHello:'Зай, тут всё просто ♥',directHelloCopy:'Смотри баланс, текущую неделю и расходы — всё главное рядом.'
});
Object.assign(dict.uk,{
  myBudget:'Мій бюджет',calmFinance:'Спокійні фінанси для щасливого життя',appearance:'Вигляд',
  themeLight:'Світла',themeAuto:'Авто',themeDark:'Темна',currencyRates:'Курси валют',updated:'Оновлюється автоматично',
  aboutApp:'Про застосунок',feedback:'Зворотний зв’язок',notifications:'Нагадування',weekReminder:'Нагадування про тиждень',
  monthReminder:'Нагадування про кінець місяця',planWeek:'План на тиждень',plannedCategories:'Категорії плану',
  allWeeks:'Усі тижні',budgetSummary:'Підсумок місяця',storageAndCurrency:'Сховище і валюта',currentBalance:'Поточний баланс',
  warmLine:'Спокійніше з грошима. Більше часу на головне. ♥',smallSteps:'Маленькі кроки — до великих планів ♥',
  togetherMore:'Разом ми можемо більше ♥',todayGood:'Сьогодні теж гарний день ♥',
  directHello:'Зай, тут усе просто ♥',directHelloCopy:'Дивись баланс, поточний тиждень і витрати — усе головне поруч.'
});

function planLabelApproved(x){
  return x.name==='rent'?tr('housing'):x.name==='utilities'?tr('utilities'):x.name==='school'?tr('school'):x.name;
}
function obligationIconApproved(x){
  const n=String(x.name||'').toLowerCase();
  if(n.includes('rent')||n.includes('жиль')||n.includes('жит'))return '⌂';
  if(n.includes('util')||n.includes('коммун')||n.includes('комун'))return '◫';
  if(n.includes('school')||n.includes('школ'))return '🎓';
  return '♡';
}
function rateToMdlApproved(){
  if(state.storage.currency==='MDL')return 1;
  const direct=safe(()=>core.getRate(state,state.storage.currency,'MDL'),null);
  if(direct)return direct;
  const reverse=safe(()=>core.getRate(state,'MDL',state.storage.currency),null);
  return reverse?1/reverse:null;
}
function themeChoiceApproved(id,icon,label){
  return `<button class="ap-theme ${state.preferences.theme===id?'active':''}" data-theme-choice="${id}"><i>${icon}</i><span>${label}</span></button>`;
}

homeFinal=function(){
  const dark=resolvedDarkFinal(),ww=activeWeekFinal(),spent=safe(()=>core.weekSpent(state,ww),0),fund=safe(()=>core.fundInStorage(state,ww),0),left=fund-spent,p=progressFinal(spent,fund),sec=secondaryBalanceFinal();
  return `${topFinal('home')}
  <section class="ap-home-hero ${dark?'dark':'light'}">
    <div class="ap-home-copy"><h1>${dark?tr('directHello'):'Ninochka ♥'}</h1><p>${dark?tr('directHelloCopy'):tr('warmLine')}</p></div>
    <div class="ap-home-art" aria-hidden="true"></div>
  </section>
  <section class="ap-balance fx-card"><div><small>${tr('balance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><button class="fx-main-btn" data-final-action="storage-add">＋ ${tr('topUp')}</button></section>
  ${categoryQuickFinal()}
  <section class="ap-current-week fx-card" data-final-action="open-week"><div class="ap-card-head"><div><small>${tr('currentWeek')}</small><h2>${tr('weekN')} ${ww.id}</h2><span>${weekDatesFinal(ww.id)}</span></div><b>›</b></div><div class="ap-week-row"><div><small>${tr('weekFund')}</small><strong>${moneyPlain(ww.fund.amount,ww.fund.currency)}</strong></div><div><small>${left<0?tr('overspend'):tr('left')}</small><strong class="${left<0?'negative':'positive'}">${moneyPlain(Math.abs(left))}</strong></div></div><div class="fx-progress fx-progress-green"><i style="width:${p.bar}%"></i></div><div class="ap-week-foot"><span>${tr('spent')} <b>${moneyPlain(spent)}</b></span><span>${Math.round(p.left)}% ${tr('remainingPercent').toLowerCase()}</span></div></section>
  <div class="ap-home-actions"><button class="fx-main-btn" data-action="expense-add">＋ ${tr('addExpense')}</button><button class="fx-soft-btn" data-tab="plan">▦ ${tr('plan')}</button></div>`;
};

planPageFinal=function(){
  const mm=m(),ps=safe(()=>core.planSummary(state,mm),null),active=activeWeekFinal();
  const used=new Set([state.storage.currency,...mm.obligations.map(x=>x.currency),...mm.weeks.map(x=>x.fund.currency)]);used.delete(state.storage.currency);
  return `${topFinal('plan')}<section class="ap-plan-page">
    <div class="ap-segment"><button class="active">${tr('expensesTab')}</button><button disabled>${tr('income')}</button></div>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('planWeek')}</small><h2>${tr('allWeeks')}</h2></div></div>
      <div class="ap-week-plan-list">${mm.weeks.map(ww=>`<div class="ap-week-plan ${ww.id===active.id?'active':''} ${ww.status==='closed'?'closed':''}"><div class="ap-week-badge">▣</div><div class="ap-week-meta"><b>${tr('weekN')} ${ww.id}</b><span>${weekDatesFinal(ww.id)}</span><em>● ${ww.status==='closed'?tr('closed'):ww.id===active.id?tr('open'):tr('planned')}</em></div><label><input data-replace-on-focus name="fund-${ww.id}" inputmode="decimal" value="${escape(planDraftValue('funds',ww.id,'amount',core.moneyInput(ww.fund.amount)))}"><select name="fundcur-${ww.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('funds',ww.id,'currency',ww.fund.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div>
    </section>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('plannedCategories')}</small><h2>${tr('mandatory')}</h2></div><button class="ap-link" data-action="obligation-add">＋ ${tr('addItem')}</button></div>
      <div class="ap-obligation-list">${mm.obligations.map(x=>`<div class="ap-obligation"><i>${obligationIconApproved(x)}</i><div><b>${escape(planLabelApproved(x))}</b><span>${x.currency}</span></div><input type="hidden" name="oblname-${x.id}" value="${escape(planDraftValue('obligations',x.id,'name',planLabelApproved(x)))}"><label><input data-replace-on-focus name="oblamount-${x.id}" inputmode="decimal" value="${escape(planDraftValue('obligations',x.id,'amount',core.moneyInput(x.amount)))}"><select name="oblcur-${x.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('obligations',x.id,'currency',x.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div>
    </section>
    ${[...used].length?`<section class="ap-block"><div class="ap-title"><div><small>${tr('currencyRates')}</small><h2>${tr('rates')}</h2></div><button class="ap-link" data-action="rates-refresh">↻ ${tr('refreshRates')}</button></div>${[...used].map(c=>rateEditor(c)).join('')}</section>`:''}
    <section class="ap-block ap-summary">${ps?`<div><span>${tr('mandatory')}</span><b>${fmt(ps.mandatory)}</b></div><div><span>${tr('fourWeeks')}</span><b>${fmt(ps.weekly)}</b></div><div class="total"><span>${tr('planTotal')}</span><b>${fmt(ps.total)}</b></div><div><span>${tr('reserve')}</span><b class="${ps.reserve<0?'negative':'positive'}">${fmt(ps.reserve)}</b></div>`:`<div class="note">${tr('missingRate')}</div>`}<button class="fx-main-btn fx-full" data-action="plan-preview">${tr('checkPlan')}</button></section>
  </section>`;
};

storagePageFinal=function(){
  const sec=secondaryBalanceFinal(),rate=rateToMdlApproved(),art=resolvedDarkFinal()?'./assets/storage-guards.svg':'./assets/storage-guards-light.svg';
  return `${topFinal('storage')}<section class="ap-storage-page">
    <section class="ap-storage-balance fx-card"><div><small>${tr('currentBalance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><div class="ap-safe-art"><img src="${art}" alt=""></div></section>
    <div class="ap-storage-actions"><button class="fx-main-btn" data-final-action="storage-add">＋ ${tr('topUp')}</button><button class="fx-soft-btn" data-final-action="storage-sub">− ${tr('withdraw')}</button></div>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('storageAndCurrency')}</small><h2>${tr('currencyRates')}</h2></div></div><div class="ap-currency-grid"><label><span>${tr('storageCurrency')}</span><select data-action="storage-currency">${core.CURRENCIES.map(c=>`<option ${c===state.storage.currency?'selected':''}>${c}</option>`).join('')}</select></label><div><span>${tr('currencyRates')} · MDL</span><b>${rate?rate.toFixed(2):'—'}</b></div></div><div class="ap-rate-foot"><span>${rate?`1 ${state.storage.currency} = ${rate.toFixed(2)} MDL`:tr('missingRate')}</span><button class="ap-link" data-tab="plan">${tr('refreshRates')} →</button></div></section>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('storage')}</small><h2>${tr('history')}</h2></div><button class="ap-link" data-action="history">${tr('history')} →</button></div><p class="muted">${tr('storageWarmCopy')}</p></section>
  </section>`;
};

morePageFinal=function(){
  const nbTotal=state.nbEntries.reduce((s,x)=>s+(x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0)),0);
  return `${topFinal('more')}<section class="ap-more-page">
    <section class="ap-profile fx-card"><div class="ap-avatar">♥</div><div><b>${tr('myBudget')}</b><span>${tr('calmFinance')}</span></div></section>
    <section class="ap-block"><div class="ap-title"><h2>${tr('appearance')}</h2></div><div class="ap-theme-grid">${themeChoiceApproved('light','☀',tr('themeLight'))}${themeChoiceApproved('auto','♥',tr('themeAuto'))}${themeChoiceApproved('dark','☾',tr('themeDark'))}</div></section>
    <section class="ap-menu-list">
      <button data-tab="storage"><i>💱</i><span><b>${tr('storageCurrency')}</b><small>${state.storage.currency}</small></span><em>›</em></button>
      <button data-tab="plan"><i>↻</i><span><b>${tr('currencyRates')}</b><small>${tr('updated')}</small></span><em>›</em></button>
      <label><i>🌐</i><span><b>${tr('language')}</b></span><select data-setting="language"><option value="ru" ${lang()==='ru'?'selected':''}>Русский</option><option value="uk" ${lang()==='uk'?'selected':''}>Українська</option></select></label>
      <button data-action="tutorial"><i>ⓘ</i><span><b>${tr('tutorial')}</b></span><em>›</em></button>
    </section>
    <section class="ap-block ap-nb"><div><small>${tr('nb')}</small><h2>${fmt(nbTotal)}</h2><p>${tr('nbHint')}</p></div><button class="fx-main-btn" data-action="nb-add">＋ ${tr('addIncome')}</button></section>
    <section class="ap-block"><div class="ap-title"><h2>${tr('backup')}</h2></div><div class="ap-backup"><button class="fx-soft-btn" data-action="export">${tr('export')}</button><label class="fx-soft-btn">${tr('import')}<input type="file" id="import-file" accept="application/json,.json" hidden></label></div></section>
  </section>`;
};

renderOnboardingFinal=function(i){
  document.querySelector('.onboarding')?.remove();
  const slides=[['on1t','on1c'],['on2t','on2c'],['on3t','on3c'],['on4t','on4c']];
  const [tk,ck]=slides[i],el=document.createElement('div');el.className='onboarding ap-onboarding';
  el.innerHTML=`<div class="ap-onboard-art ap-onboard-${i+1}"></div><div class="ap-onboard-sheet"><h1>${tr(tk)}</h1><p>${tr(ck)}</p><div class="dots">${slides.map((_,j)=>`<span class="dot ${j===i?'active':''}"></span>`).join('')}</div><button class="fx-main-btn" data-onboard="${i<3?i+1:'done'}">${i<3?tr('next'):tr('start')}</button></div>`;
  document.body.append(el);
};
renderOnboarding=renderOnboardingFinal;

// Re-render with the approved renderers above.
render();
