// Approved-board refinement: keep the working finance engine, make Plan / Storage / More match the signed-off boards.

Object.assign(dict.ru,{
  weekPlan:'План на неделю',categoriesPlan:'Категории плана',weekNotifications:'Напоминание о неделе',monthNotifications:'Напоминание о конце месяца',
  appInfo:'О приложении',sendFeedback:'Обратная связь',dataSection:'Данные',rateUpdatedNow:'Курс обновлён',rateSameCurrency:'Основная валюта уже MDL',
  noRateYet:'Курс ещё не получен',storageTruth:'Хранилище — реальный остаток на счёте. Пополняй или снимай, и цифра всегда остаётся правдой.'
});
Object.assign(dict.uk,{
  weekPlan:'План на тиждень',categoriesPlan:'Категорії плану',weekNotifications:'Нагадування про тиждень',monthNotifications:'Нагадування про кінець місяця',
  appInfo:'Про застосунок',sendFeedback:'Зворотний зв’язок',dataSection:'Дані',rateUpdatedNow:'Курс оновлено',rateSameCurrency:'Основна валюта вже MDL',
  noRateYet:'Курс ще не отримано',storageTruth:'Сховище — реальний залишок на рахунку. Поповнюй або знімай, і цифра завжди лишається правдою.'
});

function planPageApproved2(){
  const mm=m(),active=activeWeekFinal(),ps=safe(()=>core.planSummary(state,mm),null);
  return `${topFinal('plan')}<section class="ap2-plan">
    <div class="ap-segment"><button class="active">${tr('expensesTab')}</button><button disabled>${tr('income')}</button></div>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('weekPlan')}</small><h2>${tr('allWeeks')}</h2></div></div>
      <div class="ap2-week-list">${mm.weeks.map(ww=>`<div class="ap2-week ${ww.id===active.id?'active':''} ${ww.status==='closed'?'closed':''}"><i>▣</i><div><b>${tr('weekN')} ${ww.id}</b><span>${weekDatesFinal(ww.id)}</span><em>● ${ww.status==='closed'?tr('closed'):ww.id===active.id?tr('open'):tr('planned')}</em></div><label><input data-replace-on-focus name="fund-${ww.id}" inputmode="decimal" value="${escape(planDraftValue('funds',ww.id,'amount',core.moneyInput(ww.fund.amount)))}"><select name="fundcur-${ww.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('funds',ww.id,'currency',ww.fund.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div>
    </section>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('categoriesPlan')}</small><h2>${tr('mandatory')}</h2></div><button class="ap-link" data-action="obligation-add">＋ ${tr('addItem')}</button></div>
      <div class="ap2-obligations">${mm.obligations.map(x=>`<div class="ap2-obligation"><i>${obligationIconApproved(x)}</i><div><b>${escape(planLabelApproved(x))}</b><span>${x.currency}</span></div><input type="hidden" name="oblname-${x.id}" value="${escape(planDraftValue('obligations',x.id,'name',planLabelApproved(x)))}"><label><input data-replace-on-focus name="oblamount-${x.id}" inputmode="decimal" value="${escape(planDraftValue('obligations',x.id,'amount',core.moneyInput(x.amount)))}"><select name="oblcur-${x.id}">${core.CURRENCIES.map(c=>`<option ${c===planDraftValue('obligations',x.id,'currency',x.currency)?'selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')}</div>
    </section>
    <section class="ap-block ap2-summary">${ps?`<div><span>${tr('mandatory')}</span><b>${fmt(ps.mandatory)}</b></div><div><span>${tr('fourWeeks')}</span><b>${fmt(ps.weekly)}</b></div><div class="total"><span>${tr('planTotal')}</span><b>${fmt(ps.total)}</b></div><div><span>${tr('reserve')}</span><b class="${ps.reserve<0?'negative':'positive'}">${fmt(ps.reserve)}</b></div>`:`<div class="note">${tr('missingRate')}</div>`}<button class="fx-main-btn fx-full" data-action="plan-preview">${tr('checkPlan')}</button></section>
  </section>`;
}

function storagePageApproved2(){
  const sec=secondaryBalanceFinal(),rate=rateToMdlApproved(),art=resolvedDarkFinal()?'./assets/storage-guards.svg':'./assets/storage-guards-light.svg';
  return `${topFinal('storage')}<section class="ap2-storage">
    <section class="ap2-storage-hero fx-card"><div class="ap2-balance"><small>${tr('currentBalance')}</small><strong>${moneyPlain(state.storage.balance)}</strong>${sec?`<span>≈ ${sec}</span>`:''}</div><img src="${art}" alt="" class="ap2-storage-art"></section>
    <div class="ap2-storage-actions"><button class="fx-main-btn" data-final-action="storage-add">＋ ${tr('topUp')}</button><button class="fx-soft-btn" data-final-action="storage-sub">− ${tr('withdraw')}</button></div>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('storageAndCurrency')}</small><h2>${tr('currencyRates')}</h2></div></div><div class="ap2-rate-grid"><label><span>${tr('storageCurrency')}</span><select data-action="storage-currency">${core.CURRENCIES.map(c=>`<option ${c===state.storage.currency?'selected':''}>${c}</option>`).join('')}</select></label><div><span>${lang()==='uk'?'Курс до MDL':'Курс к MDL'}</span><b>${rate?rate.toFixed(2):'—'}</b></div></div><div class="ap2-rate-foot"><span>${rate?`1 ${state.storage.currency} = ${rate.toFixed(2)} MDL`:tr('noRateYet')}</span><button class="ap-link" data-approved-action="refresh-storage-rate">↻ ${tr('refreshRates')}</button></div></section>
    <section class="ap-block"><div class="ap-title"><div><small>${tr('storage')}</small><h2>${tr('history')}</h2></div><button class="ap-link" data-action="history">${tr('history')} →</button></div><p class="muted">${tr('storageTruth')}</p></section>
  </section>`;
}

function morePageApproved2(){
  const nbTotal=state.nbEntries.reduce((s,x)=>s+(x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0)),0),weekOn=state.preferences.weekReminder!==false,monthOn=state.preferences.monthReminder!==false;
  return `${topFinal('more')}<section class="ap2-more">
    <section class="ap-profile fx-card"><div class="ap-avatar">♥</div><div><b>${tr('myBudget')}</b><span>${tr('calmFinance')}</span></div></section>
    <section class="ap-block"><div class="ap-title"><h2>${tr('appearance')}</h2></div><div class="ap-theme-grid">${themeChoiceApproved('light','☀',tr('themeLight'))}${themeChoiceApproved('auto','♥',tr('themeAuto'))}${themeChoiceApproved('dark','☾',tr('themeDark'))}</div></section>
    <section class="ap2-menu">
      <button data-tab="storage"><i>💱</i><span><b>${tr('storageCurrency')}</b><small>${state.storage.currency}</small></span><em>›</em></button>
      <button data-approved-action="refresh-storage-rate"><i>↻</i><span><b>${tr('currencyRates')}</b><small>${tr('updated')}</small></span><em>›</em></button>
    </section>
    <section class="ap2-menu">
      <button data-approved-toggle="weekReminder"><i>♧</i><span><b>${tr('weekNotifications')}</b><small>${lang()==='uk'?'Нагадати про ведення тижня':'Напомнить о ведении недели'}</small></span><u class="ap2-toggle ${weekOn?'on':''}"><s></s></u></button>
      <button data-approved-toggle="monthReminder"><i>◷</i><span><b>${tr('monthNotifications')}</b><small>${lang()==='uk'?'Нагадати про завершення місяця':'Напомнить о завершении месяца'}</small></span><u class="ap2-toggle ${monthOn?'on':''}"><s></s></u></button>
      <label><i>🌐</i><span><b>${tr('language')}</b></span><select data-setting="language"><option value="ru" ${lang()==='ru'?'selected':''}>Русский</option><option value="uk" ${lang()==='uk'?'selected':''}>Українська</option></select></label>
    </section>
    <section class="ap2-menu">
      <button data-action="tutorial"><i>ⓘ</i><span><b>${tr('tutorial')}</b></span><em>›</em></button>
      <button data-approved-action="about"><i>ⓘ</i><span><b>${tr('appInfo')}</b></span><em>›</em></button>
      <button data-approved-action="feedback"><i>♡</i><span><b>${tr('sendFeedback')}</b></span><em>›</em></button>
    </section>
    <section class="ap-block ap-nb"><div><small>${tr('nb')}</small><h2>${fmt(nbTotal)}</h2><p>${tr('nbHint')}</p></div><button class="fx-main-btn" data-action="nb-add">＋ ${tr('addIncome')}</button></section>
    <section class="ap-block"><div class="ap-title"><h2>${tr('dataSection')}</h2></div><div class="ap-backup"><button class="fx-soft-btn" data-action="export">${tr('export')}</button><label class="fx-soft-btn">${tr('import')}<input type="file" id="import-file" accept="application/json,.json" hidden></label></div></section>
  </section>`;
}

planPageFinal=planPageApproved2;
storagePageFinal=storagePageApproved2;
morePageFinal=morePageApproved2;

document.addEventListener('click',async e=>{
  const toggle=e.target.closest('[data-approved-toggle]');
  if(toggle){e.preventDefault();e.stopImmediatePropagation();const k=toggle.dataset.approvedToggle;state.preferences[k]=!(state.preferences[k]!==false);save();render();return}
  const a=e.target.closest('[data-approved-action]');
  if(!a)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(a.dataset.approvedAction==='refresh-storage-rate'){
    if(state.storage.currency==='MDL'){notify(tr('rateSameCurrency'));return}
    try{await fetchRate(state.storage.currency,'MDL');save();render();notify(tr('rateUpdatedNow'))}catch{notify(tr('rateFail'))}return;
  }
  if(a.dataset.approvedAction==='about'){
    showModal(tr('appInfo'),`<div class="note">Ninochka · ${tr('title')}<br><br>${tr('calmFinance')}</div><div class="modal-actions"><button class="btn primary" data-action="modal-close">OK</button></div>`);return;
  }
  if(a.dataset.approvedAction==='feedback'){
    showModal(tr('sendFeedback'),`<div class="note">${lang()==='uk'?'Зай, якщо щось незручно — просто скажи мені. Я дороблю ♥':'Зай, если что-то неудобно — просто скажи мне. Я доделаю ♥'}</div><div class="modal-actions"><button class="btn primary" data-action="modal-close">OK</button></div>`);return;
  }
},true);

render();
