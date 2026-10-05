const encoder = new TextEncoder();
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
export const hash = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));
}
export function equal(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false; let n=0; for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i); return n===0; }
export function validSlot(start,end,now=Date.now()) {return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>now&&start<now+366*86400000&&[2700000,3600000].includes(end-start);}
const text = (s,max) => typeof s==='string' && s.trim().length>0 && s.length<=max && !/[\x00-\x08\x0b-\x1f]/.test(s);
async function body(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new Error('Invalid JSON');
  const reader=request.body?.getReader(); if(!reader)throw new Error('Invalid JSON');
  let size=0,parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new Error('Too large');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Invalid JSON');return data;
}
async function discord(env,payload) {
  let content=`**${payload.event}**\nTeam: ${payload.team}\nDiscord: ${payload.discord}`;
  if(payload.start)content+=`\nTime: <t:${Math.floor(payload.start/1000)}:F> – <t:${Math.floor(payload.end/1000)}:t>`;
  if(payload.message)content+=`\nPreferred times / message:\n${payload.message}`;
  if(payload.token)content+=`\nForward this private cancellation link:\n${env.PUBLIC_URL}#cancel=${payload.token}`;
  const webhook=String(env.DISCORD_WEBHOOK_URL||'').trim();
  if(webhook){
    let url;
    try{url=new URL(webhook);}catch{throw new Error('DISCORD_WEBHOOK_URL is not a valid URL.');}
    if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname)||!/^\/api\/webhooks\/\d{17,20}\/[-\w.]+$/.test(url.pathname))throw new Error('DISCORD_WEBHOOK_URL must be the complete webhook URL copied from Discord.');
    url.searchParams.set('wait','true');
    const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'DiscordBot (https://petrock.dev, 1.0)'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
    if(!result.ok){
      let detail='';try{const problem=await result.json();detail=[problem.code,problem.message].filter(Boolean).join(' ');}catch{}
      throw new Error(`Webhook delivery failed: Discord HTTP ${result.status}${detail?`: ${detail}`:''}`.slice(0,240));
    }
    return;
  }
  const token=String(env.DISCORD_BOT_TOKEN||'').trim().replace(/^Bot\s+/i,'');
  if(!token)throw new Error('Bot authentication failed: DISCORD_BOT_TOKEN is empty.');
  const call=async(stage,path,{method='POST',data}={})=>{
    const headers={Authorization:`Bot ${token}`,Accept:'application/json','User-Agent':'DiscordBot (https://petrock.dev, 1.0)'};
    if(data!==undefined)headers['Content-Type']='application/json';
    const result=await fetch(`https://discord.com/api/v10${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
    if(!result.ok){
      let detail='',raw='';
      try{raw=await result.text();const problem=JSON.parse(raw);detail=[problem.code,problem.message,problem.errors?JSON.stringify(problem.errors):''].filter(Boolean).join(' ');}catch{detail=raw;}
      const requestId=result.headers.get('x-discord-request-id')||result.headers.get('cf-ray')||'';
      throw new Error(`${stage} failed: Discord HTTP ${result.status}${detail?`: ${detail}`:''}${requestId?` (request ${requestId})`:''}`.slice(0,240));
    }
    const raw=await result.text();return raw?JSON.parse(raw):{};
  };
  await call('Bot authentication','/users/@me',{method:'GET'});
  let channel=String(env.DISCORD_CHANNEL_ID||'').trim();
  if(channel&&!/^\d{17,20}$/.test(channel))throw new Error('DISCORD_CHANNEL_ID must contain only the 17–20 digit channel ID.');
  if(!channel){
    const userId=String(env.DISCORD_USER_ID||'').trim();
    if(!/^\d{17,20}$/.test(userId))throw new Error('DISCORD_USER_ID must contain only your 17–20 digit numeric Discord user ID.');
    const dm=await call('DM channel creation','/users/@me/channels',{data:{recipient_id:userId}});channel=String(dm.id||'');
    if(!/^\d{17,20}$/.test(channel))throw new Error('Discord did not return a valid DM channel ID.');
  }
  await call('Message delivery',`/channels/${channel}/messages`,{data:{content,allowed_mentions:{parse:[]}}});
}
export async function flush(env) {
  if(!env.DISCORD_WEBHOOK_URL&&(!env.DISCORD_BOT_TOKEN||(!env.DISCORD_USER_ID&&!env.DISCORD_CHANNEL_ID)))return;
  const now=Date.now();
  const {results}=await env.DB.prepare('SELECT id FROM outbox WHERE sent IS NULL AND next_attempt<=? AND lease_until<? LIMIT 8').bind(now,now).all();
  for(const row of results){
    const item=await env.DB.prepare('UPDATE outbox SET lease_until=? WHERE id=? AND sent IS NULL AND lease_until<? RETURNING *').bind(Date.now()+120000,row.id,Date.now()).first();
    if(!item)continue;
    try {await discord(env,JSON.parse(item.payload));await env.DB.prepare('UPDATE outbox SET sent=?,lease_until=0,last_error=NULL WHERE id=?').bind(Date.now(),item.id).run();}
    catch(error){await env.DB.prepare('UPDATE outbox SET attempts=attempts+1,next_attempt=?,lease_until=0,last_error=? WHERE id=?').bind(Date.now()+Math.min(3600000,60000*2**Math.min(item.attempts,6)),String(error?.message||'Discord request failed').slice(0,240),item.id).run();}
  }
}
export default {
  async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{await flush(env);await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),env.DB.prepare('DELETE FROM outbox WHERE sent<?').bind(Date.now()-30*86400000)]);})());},
  async fetch(request,env,ctx){
    const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').includes(origin);
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(allowed)headers['Access-Control-Allow-Origin']=origin;
    const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
    if(!allowed)return reply(403,{error:'Origin not allowed.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
    if(!env.DB||!env.RATE_LIMITER)return reply(503,{error:'Scheduling is not configured yet.'});
    try {
      const url=new URL(request.url),path=url.pathname,method=request.method;
      const bearer=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const admin=bearer?!!await env.DB.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').bind(await hash(bearer),Date.now()).first():false;
      if(path.startsWith('/admin/')&&!admin)return reply(401,{error:'Please log in again.'});
      if(method!=='GET'){
        const ip=request.headers.get('CF-Connecting-IP')||'local';
        const limit=await env.RATE_LIMITER.limit({key:`${path==='/login'?'login':'write'}:${ip}`});
        if(!limit.success)return reply(429,{error:'Too many attempts. Please wait a minute.'});
      }
      if(path==='/slots'&&method==='GET'){
        const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end'));
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>10*86400000)return reply(400,{error:'Invalid calendar range.'});
        const cols=admin?'id,start,end,team,discord,cancel_token':'id,start,end,(team IS NOT NULL) AS booked';
        const {results}=await env.DB.prepare(`SELECT ${cols} FROM slots WHERE start<? AND end>? ORDER BY start`).bind(end,start).all();return reply(200,{slots:results});
      }
      if(path==='/login'&&method==='POST'){
        if(!env.ADMIN_PASSWORD_HASH)return reply(503,{error:'Admin login is not configured yet.'});
        const data=await body(request),[salt,digest]=env.ADMIN_PASSWORD_HASH.split(':');
        if(typeof data.password!=='string'||data.password.length>256||!equal(await passwordHash(data.password,salt),digest))return reply(401,{error:'Incorrect password.'});
        const token=random();await env.DB.prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)').bind(await hash(token),Date.now()+8*3600000).run();return reply(200,{token});
      }
      if(path==='/logout'&&method==='POST'){if(bearer)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(bearer)).run();return reply(200,{ok:true});}
      if(path==='/admin/slots'&&method==='POST'){
        const {start,end,booked=false,team,discord=''}=await body(request);
        if(!validSlot(start,end))return reply(400,{error:'Choose a future 45- or 60-minute slot within the next year.'});
        if(typeof booked!=='boolean'||(booked&&(!text(team,80)||typeof discord!=='string'||(discord!==''&&!text(discord,80)))))return reply(400,{error:'Enter the opponent team name. Discord is optional; use up to 80 characters per field.'});
        const id=crypto.randomUUID();
        const insert=env.DB.prepare('INSERT INTO slots(id,start,end) VALUES(?,?,?)').bind(id,start,end);
        try{
          if(booked){
            const token=random();
            // D1 batch is transactional: the slot is never publicly available between
            // insertion and booking. The existing trigger queues the notification.
            await env.DB.batch([insert,env.DB.prepare('UPDATE slots SET team=?,discord=?,cancel_hash=?,cancel_token=? WHERE id=?').bind(team.trim(),discord.trim(),await hash(token),token,id)]);
          }else await insert.run();
        }catch(e){if(String(e).includes('overlap'))return reply(409,{error:'This overlaps an existing slot.'});throw e;}
        if(booked)ctx.waitUntil(flush(env));return reply(201,{ok:true});
      }
      if(path==='/admin/status'&&method==='GET'){
        const row=await env.DB.prepare('SELECT COUNT(*) AS pending, MAX(attempts) AS attempts FROM outbox WHERE sent IS NULL').first();
        const latest=await env.DB.prepare('SELECT last_error FROM outbox WHERE sent IS NULL AND last_error IS NOT NULL ORDER BY attempts DESC,next_attempt DESC LIMIT 1').first();
        return reply(200,{pending:row.pending,attempts:row.attempts||0,lastError:latest?.last_error||'',configured:!!(env.DISCORD_WEBHOOK_URL||(env.DISCORD_BOT_TOKEN&&(env.DISCORD_USER_ID||env.DISCORD_CHANNEL_ID)))});
      }
      if(path==='/admin/discord-test'&&method==='POST'){
        if(!env.DISCORD_WEBHOOK_URL&&(!env.DISCORD_BOT_TOKEN||(!env.DISCORD_USER_ID&&!env.DISCORD_CHANNEL_ID)))return reply(503,{error:'Discord credentials are not configured.'});
        try{await discord(env,{event:'Discord notification test',team:'University of Illinois Orange',discord:'Admin test'});}
        catch(error){return reply(502,{error:String(error?.message||'Discord rejected the test message.').slice(0,240)});}
        // Remove stale diagnostic jobs left by older test attempts, then retry real notifications.
        await env.DB.batch([
          env.DB.prepare("DELETE FROM outbox WHERE sent IS NULL AND json_extract(payload,'$.event')='Discord notification test'"),
          env.DB.prepare('UPDATE outbox SET next_attempt=0,lease_until=0 WHERE sent IS NULL'),
        ]);
        ctx.waitUntil(flush(env));
        return reply(200,{ok:true});
      }
      if(path.match(/^\/admin\/slots\/[^/]+\/edit$/)&&method==='POST'){
        const id=path.split('/')[3],data=await body(request);
        if(!validSlot(data.start,data.end))return reply(400,{error:'Choose a future 45- or 60-minute match within the next year.'});
        const current=await env.DB.prepare('SELECT * FROM slots WHERE id=?').bind(id).first();
        if(!current)return reply(404,{error:'This slot no longer exists.'});
        const booked=current.team!==null;
        const team=booked?data.team:current.team,discord=booked?(data.discord??''):current.discord;
        if(booked&&(!text(team,80)||typeof discord!=='string'||(discord!==''&&!text(discord,80))))return reply(400,{error:'Enter the opponent team name. Discord is optional; use up to 80 characters per field.'});
        const changed=current.start!==data.start||current.end!==data.end||current.team!==team||current.discord!==discord;
        if(!changed)return reply(200,{ok:true});
        const statements=[env.DB.prepare('UPDATE slots SET start=?,end=?,team=?,discord=? WHERE id=?').bind(data.start,data.end,team,discord,id)];
        if(booked){
          statements.push(env.DB.prepare('INSERT INTO outbox(id,payload) VALUES(?,?)').bind(crypto.randomUUID(),JSON.stringify({event:'Match details updated',team:team.trim(),discord:discord.trim(),start:data.start,end:data.end,token:current.cancel_token})));
        }
        try{await env.DB.batch(statements);}catch(error){if(String(error).includes('overlap'))return reply(409,{error:'This overlaps another slot or match.'});throw error;}
        if(booked)ctx.waitUntil(flush(env));return reply(200,{ok:true});
      }
      if(path.startsWith('/admin/slots/')&&method==='DELETE'){
        await env.DB.prepare('DELETE FROM slots WHERE id=?').bind(path.split('/').at(-1)).run();ctx.waitUntil(flush(env));return reply(200,{ok:true});
      }
      if(path==='/admin/cancel'&&method==='POST'){
        const {id}=await body(request);if(typeof id!=='string')return reply(400,{error:'Invalid slot.'});
        await env.DB.prepare('UPDATE slots SET team=NULL,discord=NULL,cancel_hash=NULL,cancel_token=NULL WHERE id=?').bind(id).run();ctx.waitUntil(flush(env));return reply(200,{ok:true});
      }
      if(['/book','/conflict'].includes(path)&&method==='POST'){
        const data=await body(request);
        if(!text(data.team,80)||!text(data.discord,80))return reply(400,{error:'Enter your team name and Discord username (up to 80 characters each).'});
        if(!env.TURNSTILE_SECRET)return reply(503,{error:'Bot protection is not configured yet.'});
        if(typeof data.token!=='string'||data.token.length>2048)return reply(400,{error:'Complete bot verification.'});
        const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:data.token,remoteip:request.headers.get('CF-Connecting-IP')}),signal:AbortSignal.timeout(10000)});
        const check=await verification.json();if(!check.success||check.action!=='rocketleague'||check.hostname!==new URL(origin).hostname)return reply(400,{error:'Bot verification expired. Please try again.'});
        if(path==='/conflict'){
          if(!text(data.message,1000))return reply(400,{error:'Include your preferred dates, times, and timezone (up to 1,000 characters).'});
          await env.DB.prepare('INSERT INTO requests(id,team,discord,message,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),data.team.trim(),data.discord.trim(),data.message.trim(),Date.now()).run();
        }else{
          if(typeof data.id!=='string')return reply(400,{error:'Invalid slot.'});
          const token=random();
          const result=await env.DB.prepare('UPDATE slots SET team=?,discord=?,cancel_hash=?,cancel_token=? WHERE id=? AND team IS NULL AND start>? RETURNING id').bind(data.team.trim(),data.discord.trim(),await hash(token),token,data.id,Date.now()).first();
          if(!result)return reply(409,{error:'That slot was just booked or is no longer available. Please choose another.'});
        }
        ctx.waitUntil(flush(env));return reply(201,{ok:true});
      }
      if(['/cancellation','/cancel'].includes(path)&&method==='POST'){
        const {token}=await body(request);if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return reply(404,{error:'This cancellation link is invalid or has already been used.'});
        const digest=await hash(token);
        if(path==='/cancellation'){
          const slot=await env.DB.prepare('SELECT start,end,team FROM slots WHERE cancel_hash=? AND start>?').bind(digest,Date.now()).first();return slot?reply(200,{slot}):reply(404,{error:'This booking has ended or was already cancelled.'});
        }
        const result=await env.DB.prepare('UPDATE slots SET team=NULL,discord=NULL,cancel_hash=NULL,cancel_token=NULL WHERE cancel_hash=? AND start>? RETURNING id').bind(digest,Date.now()).first();
        if(!result)return reply(404,{error:'This booking has ended or was already cancelled.'});ctx.waitUntil(flush(env));return reply(200,{ok:true});
      }
      return reply(404,{error:'Not found.'});
    }catch(e){const invalid=e instanceof SyntaxError||['Invalid JSON','Too large'].includes(e.message);return reply(invalid?400:503,{error:invalid?'Invalid request.':'Unable to complete this request. Please try again.'});}
  }
};
