// Run with: node --test finance.test.cjs (no dependencies or network).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
process.env.TZ='Europe/Paris';
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].split('/* ---------- boot ---------- */')[0].replace('(function(){','');
function setup(){
 const nodes=new Map(),storage=new Map();
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-09-22T10:00:00Z']));}static now(){return 1790071200000;}}
 const ctx=vm.createContext({Date:Clock,Intl,Set,Map,TextEncoder,TextDecoder,console,setTimeout:()=>0,clearTimeout(){},window:{matchMedia:()=>({matches:true,addEventListener(){}})},navigator:{onLine:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{addEventListener(){},getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}}});
 ctx.window.addEventListener=()=>{};vm.runInContext(source,ctx);
 ctx.showToast=()=>{};ctx.renderNav=()=>{};ctx.renderPageShell=()=>{};ctx.renderBackupBanner=()=>{};
 ctx.state.accounts=[account('a',1000),account('b',500)];ctx.state.storageAvailable=true;
 return ctx;
}
function account(id,initialBalance=0){return {id,name:id,type:'Compte courant',color:'#2E5A4E',initialBalance,updatedAt:1};}
function tx(overrides={}){return {id:'t',accountId:'a',type:'expense',amount:100,category:'Logement',date:'2026-09-20',note:'',updatedAt:1,...overrides};}
function rule(overrides={}){return {id:'r',accountId:'a',type:'expense',amount:100,category:'Logement',day:5,startDate:'2026-07-01',active:true,updatedAt:1,...overrides};}
function plain(x){return JSON.parse(JSON.stringify(x));}
test('transfer is atomic, moves both accounts and never affects income/expense or total',()=>{
 const c=setup();c.genId=()=> 'transfer';const data=tx({type:'transfer',toAccountId:'b',amount:200,category:'Virement interne'});
 assert.equal(c.createTransaction(data),true);assert.equal(c.state.transactions.length,1);assert.equal(c.accountBalance(c.state.accounts[0]),800);assert.equal(c.accountBalance(c.state.accounts[1]),700);assert.equal(c.totalBalance(),1500);assert.equal(c.monthSum('2026-09','income'),0);assert.equal(c.monthSum('2026-09','expense'),0);
 c.state.txFilters.account='b';assert.equal(c.filteredTransactions().length,1);
 c.updateTransaction('transfer',{...data,amount:50});assert.equal(c.accountBalance(c.state.accounts[0]),950);assert.equal(c.accountBalance(c.state.accounts[1]),550);
 c.deleteTransaction('transfer');assert.equal(c.totalBalance(),1500);assert.equal(c.accountBalance(c.state.accounts[0]),1000);
});
test('invalid or same-account transfer is refused; future transfer does not affect current balance',()=>{
 const c=setup();c.genId=()=> 'future';assert.equal(c.createTransaction(tx({type:'transfer',toAccountId:'a'})),false);assert.equal(c.createTransaction(tx({type:'transfer',toAccountId:'missing'})),false);assert.equal(c.createTransaction(tx({amount:Infinity})),false);assert.equal(c.state.transactions.length,0);
 c.createTransaction(tx({type:'transfer',toAccountId:'b',amount:200,date:'2026-09-30'}));assert.equal(c.accountBalance(c.state.accounts[0]),1000);assert.equal(c.monthForecast().accounts[0].balance,800);assert.equal(c.monthForecast().balance,1500);
});
test('month end forecast includes future transactions and only uncovered active recurrences',()=>{
 const c=setup();c.state.transactions=[tx(),tx({id:'internal',type:'transfer',toAccountId:'b',amount:200,date:'2026-09-22'}),tx({id:'income',type:'income',amount:100,date:'2026-09-30'}),tx({id:'expense',amount:20,date:'2026-09-29'}),tx({id:'later-transfer',type:'transfer',toAccountId:'b',amount:50,date:'2026-09-30'})];
 c.state.recurring=[rule({day:30,amount:40,startDate:'2026-09-01'}),rule({id:'paused',day:30,active:false}),rule({id:'october',startDate:'2026-10-01'})];
 const f=c.monthForecast();assert.equal(f.current,1400);assert.equal(f.balance,1440);assert.equal(f.income,100);assert.equal(f.expense,60);assert.equal(f.accounts[0].balance,690);assert.equal(f.accounts[1].balance,750);assert.equal(f.date,'2026-09-30');assert.equal(c.state.transactions.length,5);
 c.state.transactions.push(tx({id:'rec_r_2026-09-30',recurringId:'r',amount:40,date:'2026-09-30'}));assert.equal(c.monthForecast().balance,1440,'no duplicate');
 c.state.transactions.pop();c.tombs('transactions')['rec_r_2026-09-30']=1;assert.equal(c.monthForecast().balance,1480,'deleted occurrence stays deleted');
});
test('editing the recurring day keeps history and generates at most one entry per month',()=>{
 const c=setup();c.state.recurring=[rule()];c.materializeRecurring();assert.equal(c.state.transactions.length,3);
 c.updateRecurring('r',{day:10,amount:150});assert.equal(c.state.transactions.length,3);assert.ok(c.state.transactions.every(t=>t.amount===100));
 c.todayStr=()=> '2026-10-12';c.materializeRecurring();c.materializeRecurring();assert.equal(c.state.transactions.length,4);assert.equal(c.state.transactions[0].date,'2026-10-10');assert.equal(c.state.transactions[0].amount,150);
});
test('legacy occurrence IDs and deletion markers prevent duplicates after a day change',()=>{
 const c=setup();const r=rule({day:10,startDate:'2026-09-01'});c.state.recurring=[r];c.state.transactions=[tx({id:'rec_r_2026-09-05',date:'2026-09-05',recurringId:'r'})];c.materializeRecurring();assert.equal(c.state.transactions.length,1);
 c.state.transactions=[];c.tombs('transactions')['rec_r_2026-09-05']=5;c.materializeRecurring();assert.equal(c.state.transactions.length,0);
});
test('moving a generated transaction keeps its original recurrence period',()=>{
 const c=setup();c.state.transactions=[tx({id:'rec_r_2026-09-05',date:'2026-09-05',recurringId:'r'})];c.updateTransaction('rec_r_2026-09-05',tx({date:'2026-10-01'}));assert.equal(c.state.transactions[0].recurringMonth,'2026-09');
});
test('resuming a paused rule does not catch up suspended months',()=>{
 const c=setup();c.todayStr=()=> '2026-07-06';c.state.recurring=[rule()];c.materializeRecurring();c.toggleRecurringActive('r');c.todayStr=()=> '2026-09-22';c.toggleRecurringActive('r');assert.equal(c.state.transactions.length,1);c.todayStr=()=> '2026-10-06';c.materializeRecurring();assert.equal(c.state.transactions.length,2);
});
test('account deletion removes recurrences, transfers and stale remote links',()=>{
 const c=setup();c.state.recurring=[rule()];c.materializeRecurring();c.state.transactions.push(tx({id:'transfer',accountId:'b',toAccountId:'a',type:'transfer'}));const remote=plain(c.dataPayload());c.deleteAccount('a');assert.equal(c.state.recurring.length,0);assert.equal(c.state.transactions.length,0);
 remote.transactions.push(tx({id:'late',updatedAt:Date.now()+1000}));c.mergeRemoteIntoState(remote);c.todayStr=()=> '2026-10-10';c.materializeRecurring();assert.equal(c.state.accounts.length,1);assert.equal(c.state.transactions.length,0);assert.equal(c.state.recurring.length,0);
});
test('restoration includes charges, preserves transfers, and propagates omitted budget deletions',()=>{
 const c=setup();c.state.charges=[{id:'saved',name:'Internet',type:'debit',amount:30,updatedAt:1}];c.state.transactions=[tx({type:'transfer',toAccountId:'b'})];const backup=plain(c.dataPayload());c.state.charges=[{id:'local',name:'Ancien',type:'debit',amount:9,updatedAt:1}];c.state.budget={targets:{Transport:100},ts:{Transport:1}};
 c.pendingImport=c.validatePayload(backup,true);c.applyPendingImport();assert.equal(c.state.charges[0].id,'saved');assert.ok(c.tombs('charges').local);assert.equal(c.state.transactions[0].type,'transfer');assert.equal(c.mergeBudget(c.state.budget,{targets:{Transport:100},ts:{Transport:1}}).targets.Transport,undefined);
});
test('invalid imports are rejected and legacy backups without charges remain readable',()=>{
 const c=setup(),data=plain(c.dataPayload());assert.throws(()=>c.validatePayload({},true));assert.throws(()=>c.validatePayload({...data,formatVersion:99},true));assert.throws(()=>c.validatePayload({...data,transactions:[tx({amount:'100'})]},true));assert.throws(()=>c.validatePayload({...data,transactions:[tx({date:'2026-02-30'})]},true));assert.throws(()=>c.validatePayload({...data,transactions:[tx({type:'transfer',toAccountId:'missing'})]},true));
 const legacy={...data,formatVersion:2};delete legacy.charges;assert.deepEqual(plain(c.validatePayload(legacy,true).charges),[]);
});
test('failed import persistence restores the previous in-memory state',()=>{
 const c=setup(),before=plain(c.dataPayload());const backup=plain(c.dataPayload());backup.accounts[0].name='Imported';c.pendingImport=c.validatePayload(backup,true);c.persist=()=>false;c.applyPendingImport();assert.deepEqual(plain(c.dataPayload()),before);
});
test('chart cutoffs use local calendar months, including Paris UTC offset',()=>{
 const c=setup(),dates=[];c.computeBalanceAt=d=>{dates.push(d);return 0;};c.trendChartSVG();assert.deepEqual(dates,['2026-04-30','2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-22']);
});
test('transfer and charge data survive two-device merge and repeated synchronization',()=>{
 const a=setup(),b=setup();a.state.transactions=[tx({type:'transfer',toAccountId:'b',amount:25})];a.state.charges=[{id:'c',name:'Internet',type:'debit',amount:30,updatedAt:1}];b.mergeRemoteIntoState(plain(a.dataPayload()));a.mergeRemoteIntoState(plain(b.dataPayload()));assert.equal(a.state.transactions.length,1);assert.equal(b.accountBalance(b.state.accounts[1]),525);assert.equal(b.state.charges[0].amount,30);assert.equal(a.totalBalance(),1500);
});
function pop(overrides={}){return {id:'p',number:'123',name:'Darth Vader',series:'Star Wars',status:'owned',updatedAt:1,...overrides};}
test('pop collection is validated, searchable, sorted by number and kept apart from balances',()=>{
 const c=setup();c.state.pops=[pop({id:'b',number:'1000',name:'Groot',series:'Marvel'}),pop({id:'a',number:'12',name:'Élise',series:undefined,status:'wanted'}),pop({id:'x',number:'SE',name:'Special'})];
 assert.deepEqual(c.filteredPops().map(p=>p.id),['a','b','x']);
 c.state.popFilters.search='elise';assert.deepEqual(c.filteredPops().map(p=>p.id),['a']);
 c.state.popFilters.search='#1000 marvel';assert.deepEqual(c.filteredPops().map(p=>p.id),['b']);
 c.state.popFilters.search='';c.state.popFilters.status='wanted';assert.deepEqual(c.filteredPops().map(p=>p.id),['a']);
 assert.equal(c.samePopNumber('#12').length,1);assert.equal(c.samePopNumber('12','a').length,0);
 assert.equal(c.totalBalance(),1500);
 const data=plain(c.dataPayload());assert.equal(data.formatVersion,4);assert.equal(c.validatePayload(data,true).pops.length,3);
 assert.throws(()=>c.validatePayload({...data,pops:[pop({name:' '})]},true));
 assert.throws(()=>c.validatePayload({...data,pops:[pop({status:'maybe'})]},true));
 assert.throws(()=>c.validatePayload({...data,pops:[pop({photoUrl:'javascript:alert(1)'})]},true));
 assert.throws(()=>c.validatePayload({...data,pops:[pop({photoId:'../x'})]},true));
 assert.throws(()=>c.validatePayload({...data,formatVersion:5},true));
 const legacy={...data,formatVersion:3};delete legacy.pops;assert.deepEqual(plain(c.validatePayload(legacy,true).pops),[]);
});
test('pop creation, edit and deletion merge across two devices without resurrection',()=>{
 const a=setup(),b=setup();a.genId=()=> 'p1';a.createPop({number:'123',name:'Vader',series:'',note:'',status:'owned',photoUrl:'',photoId:''});
 assert.deepEqual(Object.keys(a.state.pops[0]).sort(),['createdAt','id','name','number','status','updatedAt']);
 b.mergeRemoteIntoState(plain(a.dataPayload()));assert.equal(b.state.pops.length,1);
 b.now=()=>Date.now()+1000;b.updatePop('p1',{status:'wanted'});a.mergeRemoteIntoState(plain(b.dataPayload()));assert.equal(a.state.pops[0].status,'wanted');
 a.now=()=>Date.now()+2000;a.deletePop('p1');b.mergeRemoteIntoState(plain(a.dataPayload()));assert.equal(b.state.pops.length,0);a.mergeRemoteIntoState(plain(b.dataPayload()));assert.equal(a.state.pops.length,0);
});
test('import replaces the pop collection and records removed pops',()=>{
 const c=setup();c.state.pops=[pop({id:'kept'})];const backup=plain(c.dataPayload());c.state.pops=[pop({id:'local'})];
 c.pendingImport=c.validatePayload(backup,true);c.applyPendingImport();assert.deepEqual(plain(c.state.pops.map(p=>p.id)),['kept']);assert.ok(c.tombs('pops').local);
});
test('photos removed before upload are never deleted remotely; uploaded ones are',()=>{
 const c=setup();c.URL={createObjectURL:()=> 'blob:x',revokeObjectURL(){}};
 c.photoQueue.upload.push('fresh');c.forgetPhoto('fresh');assert.deepEqual(plain(c.photoQueue),{upload:[],remove:[]});
 c.forgetPhoto('sent');assert.deepEqual(plain(c.photoQueue.remove),['sent']);
 c.sync.path='data/grand-livre.json';assert.equal(c.photoPath('abc'),'data/grand-livre-photos/abc.jpg');
});
test('catalogue search matches names and licences, ignores accents and accepts version-1 files',()=>{
 const c=setup(),catalog=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'pop-catalog.json'),'utf8'));
 const index=c.catalogIndex(catalog);assert.ok(index.length>20000);
 const spider=c.searchCatalog(index,'spider-man',12);assert.equal(spider.length,12);assert.ok(spider.every(r=>/spider-man/i.test(r.name+' '+r.series)));assert.ok(/^https:\/\//.test(spider[0].image));
 assert.ok(c.searchCatalog(index,'vader star wars',5).length>0);assert.deepEqual(plain(c.searchCatalog(index,'a',5)),[]);
 const tiny=c.catalogIndex({imageBase:'https://x/',items:[['Élodie','Disney','e.jpg'],['Groot','Marvel','']]});
 assert.equal(c.searchCatalog(tiny,'elodie',5)[0].image,'https://x/e.jpg');assert.equal(c.searchCatalog(tiny,'groot marvel',5)[0].image,'');
 assert.equal(c.searchCatalog(tiny,'groot',5)[0].number,'');
});
test('catalogue finds Pops by number, number plus name, and barcode',()=>{
 const c=setup(),index=c.catalogIndex(JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'pop-catalog.json'),'utf8')));
 const n=c.searchCatalog(index,'1362',12);assert.ok(n.length>=5);assert.ok(n.every(r=>r.number==='1362'));
 assert.ok(n.some(r=>r.name==='Deadpool'));assert.deepEqual(plain(c.searchCatalog(index,'#1362',12)).map(r=>r.name),plain(n).map(r=>r.name));
 const ariel=c.searchCatalog(index,'1362 ariel',12);assert.ok(ariel.length>=1);assert.ok(ariel.every(r=>r.number==='1362'&&/ariel/i.test(r.name)));
 const byUpc=c.searchCatalog(index,n[0].upc,5);assert.equal(byUpc.length,1);assert.equal(byUpc[0].name,n[0].name);
 const one=c.searchCatalog(index,'7',50);assert.ok(one.length>0);assert.ok(one.every(r=>r.number==='7'||/\b7\b/.test(r.name+' '+r.series)));
 const tiny=c.catalogIndex({imageBase:'https://x/',items:[['Blade Runner 2049 K','Movies','','1234'],['Hulk','Marvel','','2049'],['Hulk 120','Marvel','','5']]});
 assert.deepEqual(plain(c.searchCatalog(tiny,'2049',5)).map(r=>r.name),['Hulk','Blade Runner 2049 K']);
 assert.deepEqual(plain(c.searchCatalog(tiny,'12',5)),[]);
});
test('a shared number alone does not mark another licence’s Pop as owned',()=>{
 const c=setup();c.state.pops=[{id:'p',number:'1362',name:'Deadpool',series:'Deadpool & Wolverine',status:'owned',updatedAt:1}];
 assert.equal(c.suggestionOwned({number:'1362',name:'Deadpool',series:'Deadpool & Wolverine'}),true);
 assert.equal(c.suggestionOwned({number:'1362',name:'Ariel',series:'The Little Mermaid Live Action'}),false);
 assert.equal(c.suggestionOwned({number:'',name:'deadpool',series:''}),true);
});
test('eBay relay parses listings, filters other numbers and enforces its allowed origin',async()=>{
 const relay=await import('./relay/ebay-relay.mjs');
 assert.deepEqual(relay.parseListing('Funko Pop! Marvel Spider-Man #1362 Vinyl Figure NEW','1362'),{number:'1362',name:'Marvel Spider-Man'});
 assert.deepEqual(relay.parseListing('Funko POP Spider-Man 1362 w/ protector','1362'),{number:'1362',name:'Spider-Man'});
 const items=[{title:'Funko Pop! Marvel Spider-Man #1362',image:{imageUrl:'https://i.ebayimg.com/a.jpg'}},{title:'Funko Pop Marvel Spider-Man #1362 NIB'},{title:'Funko Pop Hulk #1363'},{title:'Funko Pop!'}];
 const out=relay.summarize(items,'1362');assert.equal(out.length,1);assert.equal(out[0].image,'https://i.ebayimg.com/a.jpg');
 const calls=[];const realFetch=global.fetch;
 global.fetch=async(url,opts={})=>{calls.push(String(url));if(String(url).includes('oauth2'))return new Response(JSON.stringify({access_token:'tok',expires_in:7200}));assert.equal(opts.headers.Authorization,'Bearer tok');return new Response(JSON.stringify({itemSummaries:items}));};
 try{
  const env={EBAY_CLIENT_ID:'id',EBAY_CLIENT_SECRET:'secret',ALLOWED_ORIGIN:'https://app.example/'};
  const denied=await relay.default.fetch(new Request('https://relay/?q=1362',{headers:{Origin:'https://evil.example'}}),env);assert.equal(denied.status,403);
  const ok=await relay.default.fetch(new Request('https://relay/?q=%231362',{headers:{Origin:'https://app.example'}}),env);assert.equal(ok.status,200);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),'https://app.example');
  assert.equal((await ok.json()).results[0].number,'1362');
  await relay.default.fetch(new Request('https://relay/?q=groot',{headers:{Origin:'https://app.example'}}),env);
  assert.equal(calls.filter(u=>u.includes('oauth2')).length,1,'token reused');assert.ok(calls.some(u=>u.includes('q=funko+pop+1362')));
  assert.equal((await relay.default.fetch(new Request('https://relay/?q=x',{headers:{Origin:'https://app.example'}}),env)).status,400);
  assert.equal((await relay.default.fetch(new Request('https://relay/?q=groot',{headers:{Origin:'https://app.example'}}),{ALLOWED_ORIGIN:'https://app.example'})).status,500);
 }finally{global.fetch=realFetch;}
});
test('in the iOS app, exports go through Filesystem and the share sheet; a cancelled share is silent',async()=>{
 const c=setup(),calls=[],toasts=[];c.showToast=(m,e)=>toasts.push([m,!!e]);
 c.window.Capacitor={isNativePlatform:()=>true,Plugins:{
  Filesystem:{writeFile:async o=>{calls.push(['write',o.path,o.directory,o.encoding,o.data.length>0]);return {uri:'file:///cache/'+o.path};}},
  Share:{share:async o=>{calls.push(['share',o.files[0]]);}}}};
 assert.equal(c.isNativeApp(),true);
 assert.equal(await c.downloadFile('a.json','{}','application/json'),true);
 assert.deepEqual(plain(calls),[['write','a.json','CACHE','utf8',true],['share','file:///cache/a.json']]);
 c.window.Capacitor.Plugins.Share.share=async()=>{throw new Error('Share canceled');};
 assert.equal(await c.downloadFile('b.json','{}','application/json'),false);assert.deepEqual(toasts,[]);
 c.window.Capacitor.Plugins.Share.share=async()=>{throw new Error('disk full');};
 assert.equal(await c.downloadFile('c.json','{}','application/json'),false);assert.equal(toasts.length,1);assert.ok(toasts[0][1]);
 c.window.Capacitor=undefined;assert.equal(c.isNativeApp(),false);assert.equal(c.nativePlugin('Share'),null);
});
