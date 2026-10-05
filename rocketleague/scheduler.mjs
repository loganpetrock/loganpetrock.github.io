import {parts,dateKey,addDays,monday,localInstant,formatTime,formatFull} from './time.mjs';
const $=id=>document.getElementById(id),config=window.ROCKETLEAGUE_CONFIG;
const demo=new URLSearchParams(location.search).get('demo')==='1';
let zone='America/Chicago',week=monday(dateKey(Date.now(),zone)),session='',preview=false,slots=[],requestVersion=0,widget=null;
let demoSlots=[1,2,4,5].map((day,i)=>{const start=localInstant(addDays(week,day),i===1?'20:00':'18:00',zone);return{id:`demo-${i}`,start,end:start+(i%2?60:45)*60000,team:i===2?'Example University':null,discord:i===2?'opponent.example':null};});
const isAdmin=()=>!!session&&!preview;
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
async function api(path,method='GET',data,publicView=false){
  if(demo)return demoAPI(path,method,data,publicView);
  if(!config.endpoint)throw new Error('Scheduling is not live yet. Please check back soon.');
  const headers={'Content-Type':'application/json'};if(session&&!publicView)headers.Authorization=`Bearer ${session}`;
  const response=await fetch(config.endpoint.replace(/\/$/,'')+path,{method,headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok){if(response.status===401&&session){session='';preview=false;updateAdmin();}throw new Error(result.error||'Unable to connect. Please try again.');}return result;
}
function demoAPI(path,method,data,publicView){
  if(path==='/login')return {token:'demo'};
  if(path==='/logout')return {ok:true};
  if(path==='/admin/status')return {pending:0,configured:true};
  if(path.startsWith('/slots?'))return {slots:demoSlots.map(s=>isAdmin()&&!publicView?{...s}:{id:s.id,start:s.start,end:s.end,booked:!!s.team})};
  if(path==='/admin/slots'){if(demoSlots.some(s=>s.start<data.end&&s.end>data.start))throw new Error('This overlaps an existing slot.');demoSlots.push({id:crypto.randomUUID(),...data,team:null});}
  if(method==='DELETE')demoSlots=demoSlots.filter(s=>s.id!==path.split('/').at(-1));
  if(path==='/book'){const s=demoSlots.find(s=>s.id===data.id);if(!s||s.team)throw new Error('That slot is unavailable.');Object.assign(s,{team:data.team,discord:data.discord});}
  if(path==='/admin/cancel'){const s=demoSlots.find(s=>s.id===data.id);if(s)s.team=null;}
  return {ok:true};
}
function updateAdmin(){
  $('login').hidden=!!session;$('logout').hidden=!session;$('preview').hidden=!session;
  $('preview').textContent=preview?'Return to admin':'Preview public view';$('admin-bar').hidden=!isAdmin();
  if(isAdmin())api('/admin/status').then(s=>{$('notification-status').textContent=demo?'Preview mode — changes reset when you reload.':!s.configured?'Discord setup is incomplete. Notifications will wait in the queue.':s.pending?`${s.pending} notification(s) waiting for Discord delivery.`:'Discord notifications configured.';}).catch(()=>{});
}
async function load(){
  const version=++requestVersion;$('status').textContent='Loading schedule…';
  const start=Date.parse(week+'T00:00:00Z')-86400000,end=start+9*86400000;
  try{const data=await api(`/slots?start=${start}&end=${end}`,'GET',undefined,!isAdmin());if(version!==requestVersion)return;slots=data.slots;$('status').textContent='';render();}
  catch(error){if(version!==requestVersion)return;slots=[];render();$('status').textContent=error.message;}
}
function render(){
  const labelDate=d=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00Z'));
  $('week-label').textContent=`${labelDate(week)} – ${labelDate(addDays(week,6))}, ${week.slice(0,4)}`;
  $('zone-abbreviation').textContent=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'short'}).formatToParts(localInstant(week,'12:00',zone)).find(p=>p.type==='timeZoneName').value;
  const visible=slots.filter(s=>dateKey(s.start,zone)<addDays(week,7)&&dateKey(s.end-1,zone)>=week);
  $('slot-count').textContent=`${visible.filter(s=>!(s.booked||s.team)&&s.start>Date.now()).length} open slots`;
  const root=$('calendar');root.replaceChildren();
  if(!visible.length)root.append(element('div',isAdmin()?'No slots this week. Add your first availability block.':'No availability posted for this week. Try another week or suggest a time below.','empty-week'));
  const scroll=element('div',undefined,'calendar-scroll'),grid=element('div',undefined,'calendar-grid');scroll.append(grid);
  grid.append(element('div','TIME','day-heading'));
  const days=Array.from({length:7},(_,i)=>addDays(week,i));
  for(const day of days){const d=new Date(day+'T12:00Z'),head=element('div',new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(d),'day-heading');if(day===dateKey(Date.now(),zone))head.classList.add('current');head.append(element('strong',String(d.getUTCDate())));grid.append(head);}
  const axis=element('div',undefined,'time-axis');for(let h=1;h<24;h++){const t=element('span',`${h%12||12} ${h<12?'AM':'PM'}`);t.style.top=`${h*60}px`;axis.append(t);}grid.append(axis);
  const agenda=element('div',undefined,'agenda');
  for(const day of days){
    const column=element('div',undefined,'day-column');
    if(isAdmin()){
      column.title='Click an empty time to add a match block';
      column.addEventListener('click',event=>{if(event.target!==column)return;const minute=Math.max(0,Math.min(1425,Math.floor((event.clientY-column.getBoundingClientRect().top)/15)*15));add(day,`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`);});
    }
    const daySlots=visible.filter(s=>dateKey(s.start,zone)<=day&&dateKey(s.end-1,zone)>=day);
    for(const s of daySlots){const start=parts(s.start,zone),end=parts(s.end,zone),top=dateKey(s.start,zone)<day?0:Number(start.hour)*60+Number(start.minute),bottom=dateKey(s.end,zone)>day?1440:Number(end.hour)*60+Number(end.minute);const b=slotButton(s);b.style.top=`${top}px`;b.style.height=`${Math.max(24,bottom-top)}px`;column.append(b);}
    grid.append(column);
    const group=element('div',undefined,'agenda-day');group.append(element('h3',new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00Z'))));
    if(!daySlots.length)group.append(element('p','No available slots'));for(const s of daySlots)group.append(slotButton(s));agenda.append(group);
  }
  root.append(scroll,agenda);
  const first=visible.length?Math.min(...visible.map(s=>Number(parts(s.start,zone).hour))):15;scroll.scrollTop=Math.max(0,first-1)*60;
}
function slotButton(s){
  const booked=!!(s.booked||s.team),past=s.start<=Date.now();
  const b=element('button',undefined,`slot${booked?' booked':''}${past?' past':''}`);
  b.append(element('strong',`${formatTime(s.start,zone)} – ${formatTime(s.end,zone)}`),element('span',booked?(isAdmin()?s.team:'Booked'):`${(s.end-s.start)/60000} min · ${past?'Ended':'Available'}`));
  b.setAttribute('aria-label',`${formatFull(s.start,zone)}, ${(s.end-s.start)/60000} minutes, ${booked?'booked':'available'}`);
  b.disabled=!isAdmin()&&(booked||past);b.addEventListener('click',()=>isAdmin()?manage(s):booking(s));return b;
}
function close(){if(widget!==null&&window.turnstile){window.turnstile.remove(widget);widget=null;}$('modal').close();}
function modal(title){close();$('modal-error').textContent='';const content=$('modal-content'),heading=element('h2',title);heading.id='modal-title';content.replaceChildren(heading);$('modal').setAttribute('aria-labelledby','modal-title');$('modal').showModal();return content;}
function field(form,label,name,type='text',max=80){const l=element('label',label),input=element(type==='textarea'?'textarea':'input');input.name=name;if(type!=='textarea')input.type=type;input.required=true;if(max)input.maxLength=max;l.append(input);form.append(l);return input;}
function actions(parent,button){const row=element('div',undefined,'modal-actions');row.append(button);parent.append(row);}
function submit(form,label,handler){const button=element('button',label,'primary');button.type='submit';actions(form,button);form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;$('modal-error').textContent='';try{await handler(new FormData(form));}catch(error){$('modal-error').textContent=error.message;if(widget!==null)window.turnstile?.reset(widget);}finally{button.disabled=false;}});}
function success(title,message){const content=modal(title);content.append(element('p',message));const b=element('button','Done','primary');b.addEventListener('click',close);content.append(b);load();}
let challengePromise;
function challenge(form){
  const container=element('div');container.id='challenge';form.append(container);
  if(demo){container.textContent='Bot verification is skipped in this local preview.';return;}
  container.textContent='Loading bot verification…';
  if(!challengePromise)challengePromise=new Promise((resolve,reject)=>{if(window.turnstile)return resolve();const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>{challengePromise=null;reject(new Error('Could not load bot verification. Please reopen this form.'));};document.head.append(script);});
  challengePromise.then(()=>{if(!container.isConnected)return;container.textContent='';widget=window.turnstile.render(container,{sitekey:config.siteKey,theme:'dark',size:'flexible',action:'rocketleague'});}).catch(e=>{$('modal-error').textContent=e.message;});
}
function token(){const value=demo?'demo':widget!==null?window.turnstile?.getResponse(widget):'';if(!value)throw new Error('Please complete bot verification first.');return value;}
function booking(s){const content=modal('Reserve this match'),form=element('form');content.append(element('p',`${formatFull(s.start,zone)} – ${formatTime(s.end,zone)} · ${(s.end-s.start)/60000} minutes`),form);field(form,'Team name','team');field(form,'Discord username','discord');form.append(element('p','Your team and Discord username are shared only with the organizer. Your reservation is immediate.'));challenge(form);submit(form,'Reserve match',async data=>{await api('/book','POST',{id:s.id,team:data.get('team'),discord:data.get('discord'),token:token()},true);success(demo?'Preview reservation saved':'You’re booked.',demo?'This only changed sample data in this tab.':'The organizer will receive your details on Discord and can forward your private cancellation link.');});}
function conflict(){const content=modal('Let’s find another time'),form=element('form');content.append(element('p','Tell us when your team is free. The organizer will reach out on Discord.'),form);field(form,'Team name','team');field(form,'Discord username','discord');const m=field(form,'Preferred dates, times, timezone, and any notes','message','textarea',1000);m.placeholder='For example: Tuesday Oct 13, 7–9 PM Central, or Thursday after 8 PM.';challenge(form);submit(form,'Send availability',async data=>{await api('/conflict','POST',{team:data.get('team'),discord:data.get('discord'),message:data.get('message'),token:token()},true);success('Availability received.',demo?'Preview only — no Discord message was sent.':'Your request is saved. The organizer will follow up on Discord to find a time.');});}
function add(selectedDate,selectedTime){const content=modal('Add availability'),form=element('form');content.append(element('p',`Choose one complete match block. Times are in ${zone}.`),form);const date=field(form,'Date','date','date',0);date.value=selectedDate||(week<dateKey(Date.now(),zone)?dateKey(Date.now(),zone):week);date.min=dateKey(Date.now(),zone);const time=field(form,'Start time','time','time',0);time.value=selectedTime||'18:00';const l=element('label','Match length'),duration=element('select');duration.name='duration';for(const n of [45,60]){const o=element('option',`${n} minutes`);o.value=n;duration.append(o);}l.append(duration);form.append(l);submit(form,'Add slot',async data=>{const start=localInstant(data.get('date'),data.get('time'),zone),end=start+Number(data.get('duration'))*60000;if(start<=Date.now())throw new Error('Choose a time in the future.');await api('/admin/slots','POST',{start,end});week=monday(data.get('date'));close();await load();});}
function manage(s){const content=modal(s.team?'Booked match':'Available block');content.append(element('p',`${formatFull(s.start,zone)} – ${formatTime(s.end,zone)}`));if(s.team){content.append(element('p',`Team: ${s.team}\nDiscord: ${s.discord}`,'detail'));if(s.cancel_token){const a=element('a','Private cancellation link','booking-link');a.href=`${location.origin}${location.pathname}#cancel=${s.cancel_token}`;content.append(a);}const reopen=element('button','Cancel booking & reopen slot');reopen.addEventListener('click',()=>confirmAction('Cancel this booking?','The slot will become available again. You’ll receive a Discord notification; please tell the opposing team.',()=>api('/admin/cancel','POST',{id:s.id})));actions(content,reopen);}
  const remove=element('button','Delete slot','danger');remove.addEventListener('click',()=>confirmAction('Delete this slot?',s.team?'This cancels the booking and removes availability. Please notify the opposing team.':'This availability block will be removed.',()=>api(`/admin/slots/${s.id}`,'DELETE')));actions(content,remove);
}
function confirmAction(title,message,action){const content=modal(title),form=element('form');content.append(element('p',message),form);submit(form,'Confirm',async()=>{await action();close();await load();updateAdmin();});}
async function cancellation(){const t=location.hash.match(/^#cancel=([a-f0-9]{64})$/)?.[1];if(!t)return;history.replaceState(null,'',location.pathname+location.search);const content=modal('Your booking');content.append(element('p','Loading booking…'));try{const {slot}=await api('/cancellation','POST',{token:t},true);confirmAction('Cancel this match?',`${slot.team} · ${formatFull(slot.start,zone)}. Cancelling reopens the slot for another team.`,async()=>{await api('/cancel','POST',{token:t},true);});}catch(e){content.replaceChildren(element('h2','Booking unavailable'),element('p',e.message));}}
$('login').addEventListener('click',()=>{const content=modal('Team admin'),form=element('form');content.append(element('p',demo?'Preview login: use any password.':'Sign in to manage Illinois Orange availability.'),form);const password=field(form,'Password','password','password',256);password.autocomplete='current-password';submit(form,'Log in',async data=>{session=(await api('/login','POST',{password:data.get('password')})).token;preview=false;password.value='';close();updateAdmin();await load();});});
$('logout').addEventListener('click',async()=>{try{await api('/logout','POST',{});session='';preview=false;updateAdmin();load();}catch(e){$('status').textContent=e.message;}});
$('preview').addEventListener('click',()=>{preview=!preview;updateAdmin();load();});
$('add').addEventListener('click',()=>add());$('conflict').addEventListener('click',conflict);$('close').addEventListener('click',close);
$('modal').addEventListener('cancel',e=>{e.preventDefault();close();});
for(const [id,delta] of [['previous',-7],['next',7]])$(id).addEventListener('click',()=>{week=addDays(week,delta);load();});
$('today').addEventListener('click',()=>{week=monday(dateKey(Date.now(),zone));load();});$('refresh').addEventListener('click',load);
$('timezone').addEventListener('change',e=>{zone=e.target.value;load();});
window.addEventListener('hashchange',cancellation);
$('demo-banner').hidden=!demo;updateAdmin();load();cancellation();
