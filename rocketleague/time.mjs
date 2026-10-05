export const zones=['America/Chicago','America/New_York','America/Denver','America/Los_Angeles'];
export function parts(epoch,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(epoch).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
export function dateKey(epoch,zone){const p=parts(epoch,zone);return `${p.year}-${p.month}-${p.day}`;}
export function addDays(date,count){return new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);}
export function monday(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((day+6)%7));}
export function sunday(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-day);}
export function localInstant(date,time,zone){
  const desired=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(desired))throw new Error('Choose a valid date and time.');
  const offsets=new Set();
  for(const delta of [-36,0,36]){const sample=desired+delta*3600000,p=parts(sample,zone);offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)-sample);}
  const matches=[...offsets].map(offset=>desired-offset).filter(epoch=>{const p=parts(epoch,zone);return `${p.year}-${p.month}-${p.day}`===date&&`${p.hour}:${p.minute}`===time;});
  if(matches.length!==1)throw new Error(matches.length?'This time occurs twice when daylight saving ends. Choose a time outside the repeated hour.':'This local time does not exist because daylight saving starts. Choose another time.');
  return matches[0];
}
export function formatTime(epoch,zone){return new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(epoch);}
export function formatFull(epoch,zone){return new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(epoch);}
