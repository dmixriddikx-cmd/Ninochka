import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('v4/app-sync.js', 'utf8');
const release = app.slice(app.indexOf('let releaseCheckInFlight = false;'),
  app.indexOf('// Open the independent recovery page'));
function releaseScope({dirty = false, build = 'bbbbbbb', editing = false} = {}) {
  let requests = 0, updates = 0, destination = '';
  const context = {
    document:{querySelector:()=>({content:'aaaaaaa'}),
      activeElement:editing?{matches:()=>true}:null},modal:{open:false},
    sync:{dirty,busy:false,paused:false},SYNC_DIRTY:'dirty',
    localStorage:{getItem:()=>null},
    location:{href:'https://example.test/Ninochka/',replace:url=>{destination=url;}},
    navigator:{serviceWorker:{getRegistration:async()=>({update:async()=>{updates++;}})}},
    fetch:async()=>{requests++;return {ok:true,json:async()=>({build})};},
    URL,Date
  };
  vm.createContext(context);vm.runInContext(release,context);
  return {run:()=>context.checkVnnRelease(),get requests(){return requests;},
    get updates(){return updates;},get destination(){return destination;},
    setLocation(url){context.location.href=url;}};
}
{
  const s=releaseScope({dirty:true});await s.run();
  assert.equal(s.requests,0,'A pending family edit blocks automatic reload');
}
{
  const s=releaseScope({editing:true});await s.run();
  assert.equal(s.requests,0,'Typing into a form blocks automatic reload');
}
{
  const s=releaseScope({build:'aaaaaaa'});await s.run();
  assert.equal(s.destination,'','Current version does not reload');
}
{
  const s=releaseScope();await s.run();
  assert.equal(s.updates,1);
  assert.match(s.destination,/vnn_release=bbbbbbb/);
  s.setLocation(s.destination);
  await s.run();
  assert.equal(s.updates,1,'A stale shell cannot loop through repeated reloads');
}

const worker=fs.readFileSync('sw.js','utf8');
assert.doesNotMatch(worker.slice(worker.indexOf('const SHELL'),worker.indexOf("self.addEventListener('install'")),/\.b64|scene\/home/,
  'Large optional art must not block a new worker from installing');
const handlers={};
const scope={self:{addEventListener:(name,fn)=>{handlers[name]=fn;},
  registration:{scope:'https://example.test/Ninochka/'}},URL,Request};
vm.createContext(scope);vm.runInContext(worker,scope);
for(const path of ['version.json?check=1','?vnn_release=bbbbbbb']){
  let intercepted=false;
  handlers.fetch({request:{method:'GET',url:'https://example.test/Ninochka/'+path,
    mode:path.startsWith('?')?'navigate':'cors'},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,`${path} must bypass the cached worker`);
}
const online={ok:true,type:'basic',clone(){return this;}};
scope.caches={open:async()=>({put:async()=>{throw new Error('QuotaExceededError');},
  match:async()=>null})};
scope.fetch=async()=>online;
let response;
handlers.fetch({request:new Request('https://example.test/Ninochka/index.html'),
  respondWith(promise){response=promise;}});
assert.equal(await response,online,'CacheStorage quota failure cannot mask a healthy network response');
console.log('Safari version checks, edit protection and cache bypass PASS');
