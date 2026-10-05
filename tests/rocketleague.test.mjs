import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{hash,passwordHash,flush} from '../rocketleague-worker/worker.mjs';
import {localInstant,dateKey,monday,sunday} from '../rocketleague/time.mjs';

function database(){
  const db=new DatabaseSync(':memory:');
  for(const migration of ['0001_scheduler.sql','0002_editing_and_diagnostics.sql'])db.exec(readFileSync(new URL(`../rocketleague-worker/migrations/${migration}`,import.meta.url),'utf8'));
  return {raw:db,prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};return statement;},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
test('admin can create an already-booked match atomically with optional Discord',async()=>{
  const DB=database(),token='a'.repeat(64),pending=[];
  await DB.prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)').bind(await hash(token),Date.now()+60000).run();
  const env={DB,ALLOWED_ORIGINS:'https://petrock.dev',RATE_LIMITER:{limit:async()=>({success:true})}};
  async function create(data,authorized=true){
    const response=await worker.fetch(new Request('https://test.workers.dev/admin/slots',{method:'POST',headers:{Origin:'https://petrock.dev','Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)}),env,{waitUntil:p=>pending.push(p)});
    return response.status;
  }
  try{
    const start=Date.now()+86400000,end=start+3600000;
    const data={start,end,booked:true,team:'NECC opponent'};
    assert.equal(await create(data,false),401);
    assert.equal(await create({...data,team:''}),400);
    assert.equal(await create({...data,discord:'x'.repeat(81)}),400);
    assert.equal(await create(data),201);
    const slot=DB.raw.prepare('SELECT * FROM slots').get();
    assert.equal(slot.team,'NECC opponent');assert.equal(slot.discord,'');
    assert.equal(slot.cancel_hash,await hash(slot.cancel_token));
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1);
    assert.equal(await create(data),409);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM slots').get().n,1);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM outbox').get().n,1);
    const attempted=await DB.prepare('UPDATE slots SET team=? WHERE id=? AND team IS NULL RETURNING id').bind('Public opponent',slot.id).first();assert.equal(attempted,null);
    await Promise.all(pending);
  }finally{DB.raw.close();}
});
test('admin edits slot times and booked details without recreating the booking',async()=>{
  const DB=database(),token='b'.repeat(64),pending=[];
  await DB.prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)').bind(await hash(token),Date.now()+60000).run();
  const env={DB,ALLOWED_ORIGINS:'https://petrock.dev',RATE_LIMITER:{limit:async()=>({success:true})}};
  const call=async(path,data)=>{
    const response=await worker.fetch(new Request(`https://test.workers.dev${path}`,{method:'POST',headers:{Origin:'https://petrock.dev','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)}),env,{waitUntil:p=>pending.push(p)});
    return {status:response.status,body:await response.json()};
  };
  try{
    const start=Date.now()+2*86400000,end=start+3600000,id='booked-edit',cancelToken='c'.repeat(64);
    await DB.prepare('INSERT INTO slots(id,start,end,team,discord,cancel_hash,cancel_token) VALUES(?,?,?,?,?,?,?)').bind(id,start,end,'Old team','old.user',await hash(cancelToken),cancelToken).run();
    await DB.prepare('INSERT INTO slots(id,start,end) VALUES(?,?,?)').bind('collision',end+3600000,end+7200000).run();
    const moved={start:start+86400000,end:end+86400000,team:'New team',discord:''};
    assert.equal((await call(`/admin/slots/${id}/edit`,moved)).status,200);
    const edited=DB.raw.prepare('SELECT * FROM slots WHERE id=?').get(id);
    assert.equal(edited.id,id);assert.equal(edited.start,moved.start);assert.equal(edited.team,'New team');assert.equal(edited.cancel_token,cancelToken);
    const notice=JSON.parse(DB.raw.prepare("SELECT payload FROM outbox WHERE payload LIKE '%details updated%'").get().payload);
    assert.equal(notice.start,moved.start);assert.equal(notice.token,cancelToken);
    const overlap={...moved,start:end+3600000,end:end+7200000};
    assert.equal((await call(`/admin/slots/${id}/edit`,overlap)).status,409);
    assert.equal(DB.raw.prepare('SELECT start FROM slots WHERE id=?').get(id).start,moved.start);
    await Promise.all(pending);
  }finally{DB.raw.close();}
});
test('DST, cross-zone day shifts, and week start',()=>{
  assert.equal(new Date(localInstant('2026-10-05','18:00','America/Chicago')).toISOString(),'2026-10-05T23:00:00.000Z');
  assert.equal(new Date(localInstant('2026-12-05','18:00','America/Chicago')).toISOString(),'2026-12-06T00:00:00.000Z');
  assert.throws(()=>localInstant('2026-03-08','02:30','America/Chicago'),/does not exist/);
  assert.throws(()=>localInstant('2026-11-01','01:30','America/Chicago'),/occurs twice/);
  assert.equal(dateKey(Date.parse('2026-10-06T04:30Z'),'America/Chicago'),'2026-10-05');
  assert.equal(dateKey(Date.parse('2026-10-06T04:30Z'),'America/New_York'),'2026-10-06');
  assert.equal(monday('2026-10-11'),'2026-10-05');
  assert.equal(sunday('2026-10-11'),'2026-10-11');
  assert.equal(sunday('2026-10-05'),'2026-10-04');
});
test('authentication, overlap, reservation races, privacy, cancellation, and durable notifications',async()=>{
  const DB=database(),salt='test-salt';
  const env={DB,ALLOWED_ORIGINS:'https://petrock.dev',ADMIN_PASSWORD_HASH:`${salt}:${await passwordHash('long-test-password',salt)}`,RATE_LIMITER:{limit:async()=>({success:true})},TURNSTILE_SECRET:'test',PUBLIC_URL:'https://petrock.dev/rocketleague/'};
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'rocketleague',hostname:'petrock.dev'}));
  const pending=[];const ctx={waitUntil:p=>pending.push(p)};
  async function call(path,method='GET',data,token,origin='https://petrock.dev'){
    const response=await worker.fetch(new Request(`https://test.workers.dev${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined}),env,ctx);return {status:response.status,body:await response.json()};
  }
  try{
    assert.equal((await call('/admin/status')).status,401);
    assert.equal((await call('/slots?start=1&end=100','GET',null,null,'https://evil.example')).status,403);
    assert.equal((await call('/login','POST',{password:'bad'})).status,401);
    const login=await call('/login','POST',{password:'long-test-password'});assert.equal(login.status,200);const token=login.body.token;
    const start=Date.now()+86400000,end=start+3600000;
    assert.equal((await call('/admin/slots','POST',{start,end},token)).status,201);
    assert.equal((await call('/admin/slots','POST',{start:start+10000,end:end+10000},token)).status,409);
    assert.equal((await call('/admin/slots','POST',{start:end,end:end+2700000},token)).status,201);
    assert.equal((await call('/admin/slots','POST',{start:end+3600000,end:end+3900000},token)).status,400);
    const id=DB.raw.prepare('SELECT id FROM slots ORDER BY start').get().id;
    const payload={id,team:'Team A',discord:'captain',token:'test'};
    assert.equal((await call(`/admin/slots/${id}`,'DELETE')).status,401);
    globalThis.fetch=async()=>new Response(JSON.stringify({success:false}));
    assert.equal((await call('/book','POST',payload)).status,400);
    assert.equal(DB.raw.prepare('SELECT team FROM slots WHERE id=?').get(id).team,null);
    globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'rocketleague',hostname:'petrock.dev'}));
    const race=await Promise.all([call('/book','POST',payload),call('/book','POST',{...payload,team:'Team B'})]);
    assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
    const publicSlots=await call(`/slots?start=${start-1}&end=${end+3600000}`);
    assert.equal(publicSlots.body.slots[0].booked,1);assert.equal(publicSlots.body.slots[0].team,undefined);assert.equal(publicSlots.body.slots[0].cancel_token,undefined);
    const adminSlots=await call(`/slots?start=${start-1}&end=${end+3600000}`,'GET',null,token);assert.ok(adminSlots.body.slots[0].team);
    const cancel=adminSlots.body.slots[0].cancel_token;
    assert.equal((await call('/cancellation','POST',{token:cancel})).status,200);
    assert.equal((await call('/cancel','POST',{token:cancel})).status,200);
    assert.equal((await call('/cancel','POST',{token:cancel})).status,404);
    assert.equal((await call('/book','POST',payload)).status,201);
    assert.equal((await call('/conflict','POST',{team:'Other',discord:'other',message:'Tuesday 7pm Central',token:'test'})).status,201);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS count FROM outbox').get().count,4);
    await Promise.all(pending);
    env.DISCORD_BOT_TOKEN='test';env.DISCORD_USER_ID='123456789012345678';
    globalThis.fetch=async()=>new Response('{}',{status:503});await flush(env);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS count FROM outbox WHERE sent IS NULL AND attempts=1').get().count,4);
    DB.raw.exec('UPDATE outbox SET next_attempt=0');const sent=[];
    globalThis.fetch=async(url,options)=>{if(options.body)sent.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'234567890123456789'}));};await flush(env);
    assert.equal(DB.raw.prepare('SELECT COUNT(*) AS count FROM outbox WHERE sent IS NOT NULL').get().count,4);
    assert.ok(sent.some(s=>s.content?.includes('#cancel=')));assert.ok(sent.filter(s=>s.content).every(s=>s.allowed_mentions.parse.length===0));
    assert.equal((await call('/logout','POST',{},token)).status,200);assert.equal((await call('/admin/status','GET',null,token)).status,401);
    const stored=DB.raw.prepare('SELECT cancel_hash,cancel_token FROM slots WHERE id=?').get(id);assert.equal(stored.cancel_hash,await hash(stored.cancel_token));
    const fresh=(await call('/login','POST',{password:'long-test-password'})).body.token;
    assert.equal((await call('/admin/cancel','POST',{id},fresh)).status,200);
    assert.equal(DB.raw.prepare('SELECT team FROM slots WHERE id=?').get(id).team,null);
    globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'rocketleague',hostname:'petrock.dev'}));
    env.DISCORD_BOT_TOKEN='';
    assert.equal((await call('/book','POST',payload)).status,201);
    assert.equal((await call(`/admin/slots/${id}`,'DELETE',null,fresh)).status,200);
    assert.equal(DB.raw.prepare('SELECT id FROM slots WHERE id=?').get(id),undefined);
    assert.ok(DB.raw.prepare("SELECT payload FROM outbox WHERE payload LIKE '%slot removed%'").get());
    DB.raw.exec('UPDATE sessions SET expires=0');
    assert.equal((await call('/admin/status','GET',null,fresh)).status,401);
    env.RATE_LIMITER.limit=async()=>({success:false});
    assert.equal((await call('/login','POST',{password:'long-test-password'})).status,429);
    await Promise.all(pending);
  }finally{globalThis.fetch=originalFetch;DB.raw.close();}
});
