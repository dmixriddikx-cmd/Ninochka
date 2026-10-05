// Final visual layout: compact home like the approved concept, while keeping V4 finance logic intact.
function categorySpentInStorage(ww,cat){
  return (ww.expenses||[]).filter(x=>x.category===cat).reduce((sum,x)=>sum+safe(()=>x.currency===state.storage.currency?x.amount:core.convert(state,x.amount,x.currency),0),0)
}
function homeCategoryTiles(ww){
  const cats=['products','transport','clothes','leisure'];
  return `<div class="quick-grid">${cats.map(c=>`<div class="quick-tile"><span class="quick-icon">${categoryIcon(c)}</span><small>${tr(c)}</small><strong>${fmt(categorySpentInStorage(ww,c))}</strong></div>`).join('')}</div>`
}
home=function(){
  const mm=m(),ww=currentActiveWeek(),spent=safe(()=>core.weekSpent(state,ww),0),fund=safe(()=>core.fundInStorage(state,ww),0),left=fund-spent;
  const p=progressInfo(spent,fund);
  return `${top()}
  <section class="hero-card approved-hero"><div class="hero-copy"><div class="hero-kicker">Ninochka ♥</div><h1>${lang()==='uk'?'Тут усе спокійно. Я поруч.':'Здесь всё спокойно. Я рядом.'}</h1><p>${lang()==='uk'?'Баланс, тиждень і витрати — усе важливе перед очима.':'Баланс, неделя и расходы — всё важное перед глазами.'}</p></div></section>
  <section class="card money-card"><div class="money-top"><div><div class="eyebrow">${tr('storage')}</div><div class="money-amount">${fmt(state.storage.balance)}</div><div class="muted">${tr('balance')}</div></div><button class="btn primary money-add" data-action="balance">＋ ${lang()==='uk'?'Додати':'Добавить'}</button></div><div class="money-bottom"><button class="text-action" data-action="history">${tr('history')}</button><select class="currency-pill compact-currency" data-action="storage-currency" aria-label="${tr('storageCurrency')}">${core.CURRENCIES.map(c=>`<option ${c===state.storage.currency?'selected':''}>${c}</option>`).join('')}</select></div></section>
  ${homeCategoryTiles(ww)}
  <section class="card current-week-card approved-week"><div class="section-title"><div><div class="eyebrow">${tr('todayWeek')}</div><h2>${tr('weekN')} ${ww.id}</h2></div><button class="round-link" data-tab="week" aria-label="${tr('openWeek')}">›</button></div><div class="week-main-number"><span>${tr('weekFund')}</span><strong>${fundOriginal(ww)}</strong></div>${progressHTML(spent,fund)}<div class="week-split"><div><span>${tr('spent')}</span><strong>${fmt(spent)}</strong></div><div><span>${left<0?tr('overspend'):tr('left')}</span><strong class="${left<0?'negative':'positive'}">${fmt(Math.abs(left))}</strong></div><div><span>${tr('remainingPercent')}</span><strong>${Math.max(0,Math.round(p.left))}%</strong></div></div><button class="btn primary week-open-btn" data-tab="week">${tr('openWeek')}</button></section>
  <section class="mini-row"><button class="mini-card" data-tab="plan"><span>▦</span><div><small>${tr('monthPlan')}</small><strong>${tr('openPlan')}</strong></div><b>›</b></button><button class="mini-card" data-tab="more"><span>♥</span><div><small>${tr('saved')}</small><strong>${fmt(core.monthSaved(state,mm))}</strong></div><b>›</b></button></section>`
}
morePage=function(){
  const nbTotal=state.nbEntries.reduce((s,x)=>s+(x.currency===state.storage.currency?x.amount:safe(()=>core.convert(state,x.amount,x.currency),0)),0);
  return `${top()}
  <section class="card storage-detail-card"><div class="storage-detail-copy"><div class="eyebrow">${tr('storage')}</div><div class="money-amount">${fmt(state.storage.balance)}</div><p>${tr('storageWarmCopy')}</p><div class="row wrap"><button class="btn primary" data-action="balance">＋ ${tr('changeBalance')}</button><button class="btn ghost" data-action="history">${tr('history')}</button></div></div><img src="./assets/storage-guards.svg" alt=""></section>
  <section class="card more-hero"><img src="./assets/cat-currencies.svg" alt=""><div><div class="eyebrow">${tr('nb')}</div><h2>${fmt(nbTotal)}</h2><p>${tr('nbHint')}</p></div><button class="btn small" data-action="nb-add">＋ ${tr('addIncome')}</button></section>
  <section class="card"><h2>${tr('settings')}</h2><div class="settings-grid" style="margin-top:14px"><label class="field"><span>${tr('language')}</span><select data-setting="language"><option value="ru" ${lang()==='ru'?'selected':''}>Русский</option><option value="uk" ${lang()==='uk'?'selected':''}>Українська</option></select></label><div class="field"><span>${tr('theme')}</span><div class="segmented">${['light','dark','auto'].map(x=>`<button class="${state.preferences.theme===x?'active':''}" data-theme-choice="${x}">${tr(x)}</button>`).join('')}</div></div><button class="btn" data-action="tutorial">${tr('tutorial')}</button></div></section>
  <section class="card"><h2>${tr('backup')}</h2><div class="row wrap" style="margin-top:14px"><button class="btn" data-action="export">${tr('export')}</button><label class="btn ghost" style="display:inline-block">${tr('import')}<input type="file" id="import-file" accept="application/json,.json" hidden></label></div></section>`
}
