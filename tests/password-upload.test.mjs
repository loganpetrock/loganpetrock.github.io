import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadHash,verifyLogin} from '../rocketleague-worker/password-upload.mjs';
test('invalid hashes cannot be uploaded',()=>{
  assert.throws(()=>uploadHash('not-a-hash'),/Invalid generated hash/);
});
test('live verification sends the exact password and revokes its test session',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/login')?{token:'test-session'}:{ok:true}));};
  const password=' Synthetic ! special : password ';
  assert.deepEqual(await verifyLogin(password,fetcher),{ok:true,status:200});
  assert.equal(JSON.parse(calls[0].options.body).password,password);
  assert.equal(calls[0].options.headers.Origin,'https://petrock.dev');
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-session');
  assert.ok(calls[1].url.endsWith('/logout'));
});
test('failed login reports status without claiming success',async()=>{
  assert.deepEqual(await verifyLogin('example',async()=>new Response('{}',{status:401})),{ok:false,status:401});
});
