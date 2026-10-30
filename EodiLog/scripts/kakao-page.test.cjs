// Execute the shipped page scripts, including their registered click handler.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto, createHash} = require('node:crypto');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname,'../src/main/resources/local-dev/kakao-login.html'),'utf8')
  .replaceAll('__LOCAL_CALLBACK_URI__','http://localhost:8080/oauth/kakao/callback');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const key='eodilog.local.kakao.attempt';
const providerUrl='https://kauth.kakao.com/oauth/authorize?client_id=fake&state=expected';
const attempt={authorizationId:'id',state:'expected',verifier:'private-verifier',expiresAt:'2099-01-01T00:00:00Z'};
async function until(predicate) {
  for(let i=0;i<200;i++) { if(predicate()) return; await new Promise(resolve=>setImmediate(resolve)); }
  throw new Error('page did not settle');
}
function page({query='',stored,callback=false,storageFailure,failPath,timeoutPath}={}) {
  const calls=[],order=[],timers=new Map(),storage=new Map(stored===undefined?[]:[[key,JSON.stringify(stored)]]);
  const status={textContent:''},login={disabled:false,addEventListener(event,handler){assert.equal(event,'click');this.click=handler;}};
  let navigation;
  const context=vm.createContext({URLSearchParams,URL,Date,JSON,Uint8Array,TextEncoder,btoa,crypto:webcrypto,AbortController,
    location:{origin:'http://localhost:8080',pathname:callback?'/oauth/kakao/callback':'/dev/kakao-login',search:query,
      assign(url){order.push('navigate');navigation=url;}},
    history:{replaceState(){order.push('clean-url');}},
    document:{getElementById:id=>id==='status'?status:login},
    setTimeout(handler,delay){assert.equal(delay,45000);const timer=Symbol();timers.set(timer,handler);return timer;},
    clearTimeout(timer){timers.delete(timer);},
    sessionStorage:{
      getItem(name){if(storageFailure==='read')throw new Error('private-storage-error');return storage.get(name)??null;},
      setItem(name,value){if(storageFailure==='write')throw new Error('private-storage-error');order.push('store-attempt');storage.set(name,value);},
      removeItem(name){if(storageFailure==='remove')throw new Error('private-storage-error');order.push('clear-attempt');storage.delete(name);}},
    fetch:async(path,options)=>{
      calls.push({path,options});order.push('fetch');
      if(path===timeoutPath) return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('private-timeout-error')),{once:true}));
      return {ok:path!==failPath,json:async()=>({data:path.endsWith('/authorization-requests')?{...attempt,authorizationUrl:providerUrl}:
        path.endsWith('/sessions')?{accessToken:'sensitive-jwt',refreshToken:'sensitive-refresh'}:
        {nickname:'<script>nickname</script>',profileCompleted:true}})};
    }
  });
  scripts.forEach(script=>vm.runInContext(script,context));
  return {calls,order,storage,timers,login,get status(){return status.textContent;},get navigation(){return navigation;},
    click:()=>login.click(),expire:()=>{for(const handler of [...timers.values()])handler();}};
}
test('real login click creates Web Crypto PKCE, stores attempt before returned URL navigation',async()=>{
  const result=page();await result.click();
  assert.equal(result.calls.length,1);
  const request=JSON.parse(result.calls[0].options.body),saved=JSON.parse(result.storage.get(key));
  assert.match(saved.verifier,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(request.codeChallenge,createHash('sha256').update(saved.verifier).digest('base64url'));
  assert.equal(request.redirectUri,'http://localhost:8080/oauth/kakao/callback');
  assert.equal(result.navigation,providerUrl);
  assert.ok(result.order.indexOf('store-attempt')<result.order.indexOf('navigate'));
  assert.equal(result.timers.size,0);
});
test('failed authorization start restores button and clears attempt',async()=>{
  const result=page({stored:attempt,failPath:'/api/v1/auth/oauth/KAKAO/authorization-requests'});await result.click();
  assert.equal(result.login.disabled,false);assert.equal(result.storage.size,0);assert.equal(result.navigation,undefined);
  assert.match(result.status,/인가 시작 실패/);assert.equal(result.timers.size,0);
});
test('unavailable storage safely restores button and prevents exchange or navigation',async()=>{
  for(const storageFailure of ['read','remove']) {
    const result=page({callback:true,query:'?code=private-code&state=expected',stored:attempt,storageFailure});
    assert.equal(result.calls.length,0);assert.equal(result.login.disabled,false);assert.match(result.status,/sessionStorage/);
  }
  for(const storageFailure of ['remove','write']) {
    const result=page({storageFailure});await result.click();
    assert.equal(result.login.disabled,false);assert.equal(result.navigation,undefined);assert.match(result.status,/sessionStorage/);
    assert.doesNotMatch(result.status,/private-storage-error/);
  }
});
test('cancel, wrong state, missing attempt, duplicate state and expiry never exchange',async()=>{
  for(const [query,stored] of [['?error=access_denied&state=expected',attempt],['?code=private-code&state=wrong',attempt],['?code=private-code&state=expected',undefined],['?code=private-code&state=expected&state=expected',attempt],['?code=private-code&state=expected',{...attempt,expiresAt:'2000-01-01'}]]) {
    const result=page({callback:true,query,stored});
    assert.equal(result.calls.length,0);assert.equal(result.storage.size,0);
    assert.match(result.status,/인증 취소/);assert.doesNotMatch(result.status,/private-code|private-verifier|expected/);
  }
});
test('callback consumes attempt before single exchange and me; never displays credentials',async()=>{
  const result=page({callback:true,query:'?code=private-code&state=expected',stored:attempt});
  await until(()=>result.status.includes('확인 성공'));
  assert.deepEqual(result.order,['clean-url','clear-attempt','fetch','fetch']);
  assert.equal(result.storage.size,0);assert.equal(result.calls.length,2);
  assert.equal(JSON.parse(result.calls[0].options.body).codeVerifier,'private-verifier');
  assert.equal(result.calls[1].options.headers.Authorization,'Bearer sensitive-jwt');
  assert.match(result.status,/<script>nickname<\/script>/);
  assert.doesNotMatch(result.status,/private-code|private-verifier|sensitive-jwt|sensitive-refresh/);
  assert.equal(result.timers.size,0);
});
test('me failure restores button without claiming success',async()=>{
  const result=page({callback:true,query:'?code=private-code&state=expected',stored:attempt,failPath:'/api/v1/me'});
  await until(()=>result.status.includes('확인 실패'));
  assert.equal(result.login.disabled,false);assert.doesNotMatch(result.status,/확인 성공/);assert.equal(result.timers.size,0);
});
test('start, exchange and me deadlines abort, clear timers and never retry consumed code',async()=>{
  const start=page({timeoutPath:'/api/v1/auth/oauth/KAKAO/authorization-requests'});
  const clicked=start.click();await until(()=>start.calls.length===1);start.expire();await clicked;
  assert.equal(start.login.disabled,false);assert.equal(start.navigation,undefined);assert.equal(start.timers.size,0);
  assert.match(start.status,/시간 초과/);assert.equal(start.calls.length,1);
  for(const timeoutPath of ['/api/v1/auth/oauth/KAKAO/sessions','/api/v1/me']) {
    const result=page({callback:true,query:'?code=private-code&state=expected',stored:attempt,timeoutPath});
    await until(()=>result.calls.some(call=>call.path===timeoutPath));result.expire();
    await until(()=>result.status.includes('시간 초과'));
    assert.equal(result.login.disabled,false);assert.equal(result.storage.size,0);assert.equal(result.timers.size,0);
    assert.equal(result.calls.filter(call=>call.path.endsWith('/sessions')).length,1);
    assert.doesNotMatch(result.status,/확인 성공|private-timeout-error/);
  }
});
