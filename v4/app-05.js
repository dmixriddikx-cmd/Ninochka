// V4 UX hotfixes: week progression, duplicate-test cleanup, and submit feedback.
function firstOpenWeekId(){\n  const mm=m();\n  return mm?.weeks?.find(x=>x.status!=='closed')?.id ?? mm?.weeks?.at(-1)?.id ?? 1;\n}\nfunction decorateWeekStrip(){
  const mm=m();
  const firstOpen=firstOpenWeekId();
  document.querySelectorAll('.week-chip[data-week]').forEach(btn=>{
    const id=Number(btn.dataset.week), wk=mm?.weeks?.find(x=>x.id===id);
    btn.classList.toggle('closed-week',wk?.status==='closed');
    btn.classList.toggle('current-week',id===firstOpen && wk?.status!=='closed');
    btn.title=wk?.status==='closed'?(lang()==='uk'?'Тиждень закрито':'Неделя закрыта'):(id===firstOpen?(lang()==='uk'?'Поточний тиждень':'Текущая неделя'):'');
  });
}
const _render=render;
render=function(){_render();decorateWeekStrip()};

// After closing a week, move focus to the next open week automatically.
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-action="week-close"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  try{
    const current=w();
    core.closeWeek(state,current);
    const next=m().weeks.find(x=>x.status!=='closed'&&x.id>current.id) || m().weeks.find(x=>x.status!=='closed');
    if(next)view.week=next.id;
    persist(tr('weekClosed'));
  }catch(err){notify(errorMessage(err))}
},true);

// Give immediate feedback and block accidental repeated taps while async save is running.
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-action="expense-save"]');
  if(!btn)return;
  if(btn.dataset.busy==='1'){
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  btn.dataset.busy='1';
  btn.disabled=true;
  btn.textContent=lang()==='uk'?'Зберігаю…':'Сохраняю…';
},true);

// Clean the accidental burst from testing: only removes 5+ identical Transport entries created within 20 minutes.
try{
  const cleanupKey='ninochka-v4:transport-test-burst-cleaned-v1';
  if(!localStorage.getItem(cleanupKey)){
    let removed=0;
    for(const ww of m().weeks){
      const groups=new Map();
      for(const x of ww.expenses||[]){
        if(x.category!=='transport')continue;
        const key=[x.amount,x.currency,String(x.name||'').trim().toLowerCase()].join('|');
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(x);
      }
      for(const arr of groups.values()){
        arr.sort((a,b)=>new Date(a.date)-new Date(b.date));
        if(arr.length<5)continue;
        const span=+new Date(arr.at(-1).date)-+new Date(arr[0].date);
        if(!Number.isFinite(span)||span>20*60*1000)continue;
        const ids=new Set(arr.slice(1).map(x=>x.id));
        removed+=ids.size;
        ww.expenses=ww.expenses.filter(x=>!ids.has(x.id));
        if(ww.status==='closed')core.reconcileWeek(state,ww);
      }
    }
    localStorage.setItem(cleanupKey,'1');
    if(removed){save();render();setTimeout(()=>notify(lang()==='uk'?`Прибрано випадкові дублікати: ${removed}`:`Удалены случайные дубли: ${removed}`),120)}
  }
}catch(err){console.warn('cleanup skipped',err)}

decorateWeekStrip();

// Whenever the Week tab is entered, open the first unfinished week, not the last viewed closed week.
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab="week"]');
  if(!tab)return;
  view.week=firstOpenWeekId();
},true);
