// VNN V2 mobile UX / visual restoration. UI only; budget schema and sync protocol unchanged.
const v2Labels = () => lang()==='uk' ? {
  overview:'Огляд місяця', weeks:'Чотири тижні', spent:'Витрачено', plan:'Заплановано',
  saved:'Заощаджено', categories:'Куди йдуть кошти', add:'Додати', addHint:'Обери спосіб внесення',
  manual:'Вручну', income:'Дохід / поповнення', scan:'Зі скриншота',
  scanHint:'Розпізнавання на iPhone; знімок не зберігається у сімейному бюджеті',
  pending:'Витрати до перевірки', review:'Перевірити та розподілити',
  ledger:'Історія операцій', noSpending:'Ще немає витрат', storage:'Сховище',
  month:'Поточний місяць', savedAll:'За весь час', active:'Поточний',
  quick:'Швидкі дії', week:'Тиждень', open:'Відкрити'
} : {
  overview:'Обзор месяца', weeks:'Четыре недели', spent:'Потрачено', plan:'Запланировано',
  saved:'Сэкономлено', categories:'Куда уходят средства', add:'Добавить', addHint:'Выбери способ внесения',
  manual:'Вручную', income:'Доход / пополнение', scan:'По скриншоту',
  scanHint:'Распознавание на iPhone; снимок не сохраняется в семейном бюджете',
  pending:'Расходы на проверке', review:'Проверить и распределить',
  ledger:'История операций', noSpending:'Пока нет расходов', storage:'Хранилище',
  month:'Текущий месяц', savedAll:'За всё время', active:'Текущая',
  quick:'Быстрые действия', week:'Неделя', open:'Открыть'
};
const v2Money = n => fmt(Number.isFinite(n)?n:0);
const v2Icon = name => {
  const paths={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',plan:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4m8-4v4M3 9h18m-13 4h3m-3 4h7"/>',add:'<path d="M12 5v14M5 12h14"/>',storage:'<path d="M5 9a7 7 0 0 1 13 3 4 4 0 0 1-1 8H8a5 5 0 0 1-3-9Z"/><path d="M8 9c1-2 3-3 5-3"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
};
const v2MonthFigures = () => {
  const weeks = m().weeks.map(week => ({
    week, spent:safe(()=>core.weekSpent(state,week),0),
    fund:safe(()=>core.fundInStorage(state,week),0)
  }));
  return {weeks, spent:weeks.reduce((a,x)=>a+x.spent,0),
    planned:weeks.reduce((a,x)=>a+x.fund,0)};
};
const v2OriginalNav=contractNav;
contractNav=function(){
  const items=[['home',tr('home')],['plan',tr('plan')],['add',v2Labels().add],['storage',tr('storage')],['more',tr('more')]];
  return '<nav class="ct-nav ct-v2-nav" aria-label="VNN">'+items.map(([id,label])=>
    '<button type="button" class="ct-nav-item'+(view.tab===id?' active':'')+(id==='add'?' ct-v2-fab':'')+
    '" data-tab="'+id+'" aria-label="'+label+'"'+(view.tab===id?' aria-current="page"':'')+'>'+
    '<b aria-hidden="true">'+v2Icon(id)+'</b>'+(id==='add'?'':'<span>'+label+'</span>')+'</button>').join('')+'</nav>';
};
contractHome=function(){
  const l=v2Labels(),f=v2MonthFigures(),active=activeWeekFinal();
  const groups=['products','household','transport','leisure','clothes','other'];
  const data=groups.map(id=>({id,value:Math.max(0,contractCategoryTotal(id))})).filter(x=>x.value>0);
  const max=Math.max(1,...data.map(x=>x.value));
  const saved=safe(()=>core.historicalSaved(state),0);
  const overview='<section class="ct-v2-overview ct-card"><div class="ct-v2-heading"><div><small>'+l.overview+'</small><h2>'+contractMonthLabel()+'</h2></div><span class="ct-v2-monogram">♡</span></div>'+
    '<div class="ct-v2-totals"><div><small>'+l.plan+'</small><strong>'+v2Money(f.planned)+'</strong></div>'+
    '<div><small>'+l.spent+'</small><strong>'+v2Money(f.spent)+'</strong></div></div>'+
    '<div class="ct-v2-progress"><span style="width:'+Math.min(100,Math.max(0,f.planned?f.spent/f.planned*100:0)).toFixed(1)+'%"></span></div>'+
    '<p class="ct-v2-subtitle">'+l.storage+': <b>'+v2Money(state.storage.balance)+'</b></p></section>';
  const weekly='<section class="ct-v2-section"><div class="ct-v2-section-head"><h2>'+l.weeks+'</h2><button data-tab="plan">'+tr('plan')+' ↗</button></div>'+
    '<div class="ct-v2-weekgrid">'+f.weeks.map(x=>{const current=x.week.id===active.id; const remaining=x.fund-x.spent;
      return '<button data-week-select="'+x.week.id+'" class="ct-v2-weekmini'+(current?' current':'')+'">'+
      '<span class="ct-v2-weektop">'+l.week+' '+x.week.id+(current?' <i>●</i>':'')+'</span>'+
      '<strong>'+v2Money(x.fund)+'</strong><small>'+l.spent+' '+v2Money(x.spent)+'</small>'+
      '<span class="ct-v2-track"><i style="width:'+Math.max(0,Math.min(100,x.fund?x.spent/x.fund*100:0))+'%"></i></span>'+
      '<em class="'+(remaining<0?'negative':'positive')+'">'+v2Money(remaining)+'</em></button>';
    }).join('')+'</div></section>';
  const tiles='<section class="ct-v2-section"><div class="ct-v2-tilegrid">'+
    '<button data-tab="storage" class="ct-v2-picture ct-v2-vault"><span>'+l.storage+'</span><strong>'+v2Money(state.storage.balance)+'</strong><em>↗</em></button>'+
    '<button data-tab="plan" class="ct-v2-picture ct-v2-planpic"><span>'+tr('plan')+'</span><strong>'+l.weeks+'</strong><em>↗</em></button>'+
    '<button data-tab="storage" class="ct-v2-picture ct-v2-jar"><span>'+l.saved+'</span><strong>'+v2Money(saved)+'</strong><em>↗</em></button>'+
    '</div></section>';
  const chart='<section class="ct-card ct-v2-chart"><div class="ct-v2-section-head"><h2>'+l.categories+'</h2><button data-tab="week">'+tr('expensesTab')+' ↗</button></div>'+
    (data.length?data.slice(0,5).map(x=>
      '<div class="ct-v2-chart-row"><span>'+contractLabel(x.id)+'</span><div><i style="width:'+Math.max(4,x.value/max*100).toFixed(1)+'%"></i></div><b>'+v2Money(x.value)+'</b></div>').join(''):
    '<div class="ct-v2-zero">'+l.noSpending+'</div>')+'</section>';
  const queue=sync.connected && expenseInbox?.ready?safe(()=>inboxPending().length,0):0;
  return contractTop('home')+'<section class="ct-v2-greeting"><small>VNN <i>♡</i> · '+l.month+'</small><h1>'+contractWelcome()+'</h1></section>'+
    overview+weekly+tiles+chart+
    (queue?'<button class="ct-v2-inbox-notice" data-tab="add">'+queue+' · '+l.pending+' →</button>':'')+
    '<div class="ct-v2-home-end"><button class="ct-soft" data-tab="week">'+tr('currentWeek')+' →</button>'+
    '<button class="ct-primary" data-tab="add">＋ '+l.add+'</button></div>';
};
function v2AddPage(){
  const l=v2Labels(),pending=sync.connected&&expenseInbox?.ready?safe(()=>inboxPending().length,0):0;
  return '<header class="ct-top"><button class="ct-top-icon" data-tab="home" aria-label="'+tr('home')+'">‹</button>'+
    '<div class="ct-brand">'+l.add+'</div><span></span></header>'+
    '<section class="ct-v2-add-head"><div><small>VNN · '+l.quick+'</small><h1>'+l.add+'</h1><p>'+l.addHint+'</p></div>'+
    '<img src="./assets/cat-currencies.svg" alt=""></section>'+
    '<div class="ct-v2-add-list">'+
    '<button data-action="expense-add" class="ct-v2-add-option"><span class="ct-v2-add-icon">✎</span><span><b>'+tr('addExpense')+'</b><small>'+l.manual+'</small></span><em>→</em></button>'+
    '<button data-final-action="income-add" class="ct-v2-add-option"><span class="ct-v2-add-icon">↗</span><span><b>'+l.income+'</b><small>'+l.storage+'</small></span><em>→</em></button>'+
    '<button data-scan-upload class="ct-v2-add-option"'+(bankScan.busy?' disabled':'')+'><span class="ct-v2-add-icon">▣</span><span><b>'+l.scan+'</b><small>'+l.scanHint+'</small></span><em>→</em></button>'+
    '<input data-scan-files type="file" accept="image/*" multiple hidden></div>'+
    (pending?'<section class="ct-v2-pending ct-card"><strong>'+pending+' · '+l.pending+'</strong><button data-inbox="review" class="ct-primary">'+l.review+' →</button></section>':'')+
    '<p class="ct-v2-privacy">'+l.scanHint+'</p>';
}
const v2OriginalMore=contractMore;
contractMore=function(){return view.tab==='add'?v2AddPage():v2OriginalMore()};
const v2OriginalWeek=contractWeek;
contractWeek=function(){
  return v2OriginalWeek().replace('<section class="ct-week-page">',
    '<section class="ct-week-page"><div class="ct-v2-subart ct-v2-weekart"><img src="./assets/cat-data.svg" alt=""><span>'+v2Labels().week+'</span></div>');
};
const v2OriginalPlan=contractPlan;
contractPlan=function(){
  return v2OriginalPlan().replace('<section class="ct-plan-page">',
    '<section class="ct-plan-page"><div class="ct-v2-subart ct-v2-plansart"><img src="./assets/cat-pencil.svg" alt=""><span>'+tr('plan')+'</span></div>');
};
const v2OriginalStorage=contractStorage;
contractStorage=function(){
  const all=safe(()=>core.historicalSaved(state),0),current=safe(()=>core.monthSaved(state,m()),0);
  return v2OriginalStorage()+'<section class="ct-card ct-v2-storage-extra">'+
  '<h2>'+v2Labels().saved+'</h2><div class="ct-v2-storage-stats">'+
  '<div><small>'+v2Labels().month+'</small><strong>'+v2Money(current)+'</strong></div>'+
  '<div><small>'+v2Labels().savedAll+'</small><strong>'+v2Money(all)+'</strong></div></div>'+
  '<button class="ct-soft" data-action="history">'+v2Labels().ledger+' →</button></section>';
};
// OCR and inbox now belong exclusively to Add, not the main dashboard.
inboxBanner=function(){return ''};
const v2OldAction=handleAction;
handleAction=async function(action,el){
  const wasOpen=modal.open;
  const result=await v2OldAction(action,el);
  if(wasOpen && !modal.open && ['expense-save','expense-delete','balance-adjust','balance-exact'].includes(action)){
    view.tab=action.startsWith('balance')?'storage':'home';
    render();globalThis.scrollTo?.(0,0);
  }
  return result;
};
let v2AdjustPending=false;
const v2OldAdjustment=storageAdjustmentModal;
storageAdjustmentModal=function(kind){v2AdjustPending=true;return v2OldAdjustment(kind)};
const v2OldPersist=persist;
persist=function(...args){
  const result=v2OldPersist(...args);
  if(v2AdjustPending && !modal.open){
    v2AdjustPending=false;view.tab='storage';render();globalThis.scrollTo?.(0,0);
  }
  return result;
};
const v2OldApplyInbox=applyExpenseInbox;
applyExpenseInbox=async function(){
  const wasOpen=modal.open;
  await v2OldApplyInbox();
  if(wasOpen && !modal.open){view.tab='home';render();globalThis.scrollTo?.(0,0);}
};
// Week tiles on the dashboard use the same selection protocol as the calendar list.
