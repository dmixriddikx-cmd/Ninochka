// Final V4 UX behaviors: current-week focus, arrows, safe close progression and tap protection.
function decorateWeekStrip(){
  const mm=m(), firstOpen=firstOpenWeekId();
  document.querySelectorAll('.week-chip[data-week]').forEach(btn=>{
    const id=Number(btn.dataset.week), wk=mm?.weeks?.find(x=>x.id===id), isClosed=wk?.status==='closed', isCurrent=id===firstOpen&&!isClosed;
    btn.classList.toggle('closed-week',isClosed);
    btn.classList.toggle('current-week',isCurrent);
    btn.dataset.stateLabel=isClosed?'✓':(isCurrent?(lang()==='uk'?'зараз':'сейчас'):'');
    btn.title=isClosed?(lang()==='uk'?'Тиждень закрито':'Неделя закрыта'):(isCurrent?(lang()==='uk'?'Поточний тиждень':'Текущая неделя'):'');
  });
}
const _render=render;
render=function(){_render();decorateWeekStrip()};

// Entering the Week tab always opens the first unfinished week.
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab="week"]');
  if(!tab)return;
  view.week=firstOpenWeekId();
},true);

// Arrow navigation keeps every week reachable without changing close/open state.
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-week-step]');
  if(!btn||btn.disabled)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const step=Number(btn.dataset.weekStep)||0, ids=m().weeks.map(x=>x.id), pos=ids.indexOf(view.week), next=ids[pos+step];
  if(next!=null){view.week=next;render()}
},true);

// Closing a week settles it, then moves straight to the next open one.
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-action="week-close"]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  try{
    const current=w();
    core.closeWeek(state,current);
    const next=m().weeks.find(x=>x.status!=='closed'&&x.id>current.id)||m().weeks.find(x=>x.status!=='closed');
    if(next)view.week=next.id;
    persist(tr('weekClosed'));
  }catch(err){notify(errorMessage(err))}
},true);

decorateWeekStrip();
