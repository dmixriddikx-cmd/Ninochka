import { monthById, weeklySuggestion, snapshotItem, snapshotFund, monthPlanTotals, reduce } from './engine.js';
import { CURRENCIES, decimalString, formatMoney, parseRate, rateString } from './money.js';
import { canonicalFields, itemName, itemCategory } from './i18n.js';
import { button, escape, moneyField, currencySelect, monthName } from './ui.js';
import { cat, helpButton } from './help.js';

const summaryRows = (totals,currency) => `<dl class="plan-summary"><div><dt>Хранилище</dt><dd>${totals.storage == null ? '—' : formatMoney(totals.storage,currency)}</dd></div><div><dt>Заплановані обов’язкові витрати</dt><dd>${formatMoney(totals.mandatory,currency)}</dd></div><div><dt>Заплановані 4 тижні</dt><dd>${formatMoney(totals.weekly,currency)}</dd></div><div><dt>Усього на місяць</dt><dd>${formatMoney(totals.total,currency)}</dd></div><div class="reserve ${totals.reserve < 0 ? 'negative' : ''}"><dt>Резерв у Хранилищі</dt><dd data-testid="plan-reserve">${totals.reserve == null ? '—' : formatMoney(totals.reserve,currency)}</dd></div></dl>`;
export function openPlanner({getState,monthId,showDialog,formBody,bindForm,commit,dismiss}) {
  const state = getState(), month = monthById(state,monthId);
  if (month.status !== 'draft') {
    const total=month.budget, weekly=month.weeks.reduce((sum,w)=>sum+w.fund,0);
    showDialog('План на початку місяця', `<p>${escape(monthName(month.id))}</p>${summaryRows({storage:month.planStorage, mandatory:month.basisMandatory,weekly,total,reserve:month.planStorage == null ? null : month.planStorage-total},state.storageCurrency)}${month.planStorage == null ? '<p class="form-note">У попередній версії початковий баланс і резерв плану не зберігалися.</p>' : ''}<div class="plan-funds">${month.weeks.map(w => `<div><span>Тиждень ${w.id}</span><strong>${formatMoney(w.plannedFund?.amount ?? w.fund,w.plannedFund?.currency ?? state.storageCurrency)}</strong></div>`).join('')}</div><p class="form-note">Фонди тижнів зафіксовано на початку місяця. Зміни цих сум їх не перераховують.</p>${button('dismiss','Готово','primary')}`);
    return;
  }
  const suggestion=weeklySuggestion(state,monthId);
  let draft = {}, pending;
  const showFields = () => {
    const current=getState();
    showDialog('Спланувати місяць', formBody(`<div class="planner-intro">${cat('pencil')}<div><p>${escape(monthName(monthId))}</p><p class="form-note">Резерв не розподіляється й нікуди не списується. Фонди фіксуються лише після підтвердження.</p></div></div>
    <section class="planner-section"><h3><span class="step-dot">1</span>Очікувані обов’язкові витрати ${helpButton(current,'mandatory')}</h3><p class="form-note">Суми й валюти кожного пункту можна змінити до підтвердження.</p>
    ${month.mandatory.map(item => `<div class="planned-item"><span class="planner-category" data-user-content>${escape(itemCategory(item))}</span><label class="field"><span>Назва</span><input name="mname-${item.id}" value="${escape(draft[`mname-${item.id}`] ?? itemName(item))}" maxlength="80" required></label><div class="form-row">${moneyField(draft[`mamount-${item.id}`] ?? decimalString(item.amount),'Очікувана сума',`mamount-${item.id}`)}${currencySelect(draft[`mcurrency-${item.id}`] ?? item.currency,`mcurrency-${item.id}`)}</div></div>`).join('')}
    </section><section class="planner-section"><h3><span class="step-dot">2</span>Чотири тижневі фонди ${helpButton(current,'weekly')}</h3><p class="form-note">${suggestion.source === 'history' ? 'Пропозиція з попереднього плану. Кожен тиждень можна змінити окремо.' : 'Для першого плану пропонуємо 200 USD на тиждень. Це лише початкова сума — змініть її як зручно.'}</p>
    ${month.weeks.map(w => `<div class="form-row planned-week">${moneyField(draft[`wamount-${w.id}`] ?? decimalString(suggestion.amount),`Тиждень ${w.id}`,`wamount-${w.id}`)}${currencySelect(draft[`wcurrency-${w.id}`] ?? suggestion.currency,`wcurrency-${w.id}`)}</div>`).join('')}
    </section><section class="planner-section"><h3>Курси для цього плану ${helpButton(current,'currencies')}</h3>${CURRENCIES.filter(c=>c!==current.storageCurrency).map(c=>`<label class="field"><span>1 ${c} = … ${current.storageCurrency} · ${current.rates[c] ? 'Необов’язковий ручний курс' : 'Потрібен ручний курс'}</span><input name="rate-${c}" inputmode="decimal" value="${escape(draft[`rate-${c}`] || '')}" placeholder="${current.rates[c] ? rateString(current.rates[c].value) : '—'}" maxlength="20"></label>`).join('')}<p class="form-note">Курс використовується для розрахунку плану й зберігається після підтвердження.</p></section>`, 'Перевірити підсумок'));
    document.querySelector('#dialog').classList.add('planner-dialog');
    bindForm(values => {
      draft=values;
      let temp=getState();
      for (const currency of CURRENCIES.filter(c=>c!==temp.storageCurrency)) {
        if (values[`rate-${currency}`]?.trim()) temp=reduce(temp,{type:'set-rate',currency,value:parseRate(values[`rate-${currency}`]),source:'manual'});
      }
      const mandatory=month.mandatory.map(item=>({...item,...canonicalFields({name:values[`mname-${item.id}`],category:item.category,amount:values[`mamount-${item.id}`],currency:values[`mcurrency-${item.id}`]},item)}));
      const funds=month.weeks.map(w=>({amount:values[`wamount-${w.id}`],currency:values[`wcurrency-${w.id}`]}));
      const capturedMandatory=mandatory.map((item,index)=>snapshotItem(temp,item,month.mandatory[index],new Date(),true));
      const capturedFunds=funds.map(f=>snapshotFund(temp,f));
      const totals=monthPlanTotals(temp,capturedMandatory,capturedFunds);
      pending={temp,mandatory,funds,totals}; showSummary();
    });
  };
  const showSummary = () => {
    const {totals}=pending, over=totals.reserve < 0 || totals.mandatory < 0;
    showDialog('Підсумок плану', formBody(`${summaryRows(totals,getState().storageCurrency)}
    <div class="plan-funds">${pending.funds.map((fund,index)=>`<div><span>Тиждень ${index+1}</span><strong data-user-content>${escape(fund.amount)} ${fund.currency}</strong></div>`).join('')}</div>
    ${over ? '<p class="plan-warning" role="alert">План перевищує доступні кошти. Підтвердження недоступне.</p>' : ''}
    <p class="form-note">Резерв не розподіляється й нікуди не списується. Фонди фіксуються лише після підтвердження.</p>${button('planner-back','Змінити план','text')}`, 'Підтвердити план'));
    document.querySelector('#dialog [type=submit]').disabled=over;
    document.querySelector('#dialog [data-action=planner-back]').addEventListener('click',showFields);
    bindForm(() => { const next=reduce(pending.temp,{type:'confirm-plan',monthId,mandatory:pending.mandatory,funds:pending.funds}); commit(next,'Місяць сплановано. Резерв залишився у Хранилищі.'); dismiss(); });
  };
  showFields();
}
