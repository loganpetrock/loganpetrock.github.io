// Run from rocketleague-worker: node set-password.mjs
// Input is visible so you can verify it. Store only the resulting hash in Cloudflare.
import {createInterface} from 'node:readline/promises';
import {randomBytes} from 'node:crypto';
import {passwordHash} from './worker.mjs';
import {uploadHash,verifyLogin} from './password-upload.mjs';
if(!process.stdin.isTTY){console.error('Run this in an interactive terminal.');process.exit(1);}
const terminal=createInterface({input:process.stdin,output:process.stdout});
console.log('Your typing will be visible in this terminal. Do not share a screenshot of it.');
try {
  while(true){
    let value=await terminal.question('New admin password (14–256 characters): ');
    if(value.length<14||value.length>256){console.log('Use 14–256 characters. Please try again.');continue;}
    let confirmation=await terminal.question('Type it again to confirm: ');
    if(value!==confirmation){console.log('The passwords did not match. Please try again.');continue;}
    const salt=randomBytes(16).toString('hex');const digest=await passwordHash(value,salt);
    confirmation='';
    if(process.argv.includes('--upload')){
      terminal.close();
      console.log('\nPasswords match. Uploading the generated hash directly to petrock-rocketleague…');
      await uploadHash(`${salt}:${digest}`);
      console.log('Checking your new password against the live login…');
      let result;
      for(let attempt=0;attempt<4;attempt++){
        result=await verifyLogin(value);
        if(result.ok||result.status!==401)break;
        await new Promise(resolve=>setTimeout(resolve,3000));
      }
      value='';
      if(!result.ok)throw new Error(`The upload completed, but live login returned HTTP ${result.status}. Share this status only, not your password.`);
      console.log('SUCCESS: live login verified. Open https://petrock.dev/rocketleague/ and use the password you just chose.');
    }else{
      value='';
      console.log(`\nPasswords match. Paste this entire value into Wrangler's ADMIN_PASSWORD_HASH secret prompt:\n${salt}:${digest}`);
    }
    break;
  }
} catch(error){console.error(error.message);process.exitCode=1;} finally {terminal.close();}
