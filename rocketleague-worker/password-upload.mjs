import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,resolve,delimiter} from 'node:path';

// Pass secrets over stdin, never through shell arguments or a temporary file.
export function uploadHash(value) {
  if(!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(value))throw new Error('Invalid generated hash. Nothing was uploaded.');
  const nodeDirectory=dirname(process.execPath);
  const pnpm=resolve(nodeDirectory,'../node_modules/pnpm/bin/pnpm.mjs');
  const npx=resolve(nodeDirectory,'node_modules/npm/bin/npx-cli.js');
  const args=existsSync(pnpm)?[pnpm,'dlx','wrangler']:existsSync(npx)?[npx,'--yes','wrangler']:null;
  if(!args)throw new Error('Cannot find the package runner beside Node. Run this with the bundled Node runtime.');
  return new Promise((accept,reject)=>{
    const child=spawn(process.execPath,[...args,'secret','put','ADMIN_PASSWORD_HASH','--name','petrock-rocketleague'],{
      cwd:import.meta.dirname,windowsHide:true,
      env:{...process.env,PATH:nodeDirectory+delimiter+(process.env.PATH||''),pnpm_config_pm_on_fail:'ignore'},
      stdio:['pipe','inherit','inherit'],
    });
    child.on('error',reject);
    child.stdin.on('error',reject);
    child.on('close',code=>code===0?accept():reject(new Error(`Secret upload failed (exit ${code}).`)));
    child.stdin.end(value);
  });
}

export async function verifyLogin(password,fetcher=fetch) {
  const endpoint='https://petrock-rocketleague.petrock.workers.dev';
  const headers={'Content-Type':'application/json',Origin:'https://petrock.dev'};
  const response=await fetcher(endpoint+'/login',{method:'POST',headers,body:JSON.stringify({password}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return {ok:false,status:response.status};
  const result=await response.json();
  if(typeof result.token!=='string')throw new Error('Login returned an unexpected response.');
  const logout=await fetcher(endpoint+'/logout',{method:'POST',headers:{...headers,Authorization:`Bearer ${result.token}`},body:'{}',signal:AbortSignal.timeout(20000)});
  if(!logout.ok)throw new Error('Login worked, but the temporary verification session could not be closed. It expires in eight hours.');
  return {ok:true,status:response.status};
}
