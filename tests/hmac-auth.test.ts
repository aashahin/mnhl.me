import {describe,expect,test} from 'bun:test';
import {Hono} from 'hono';
import {hmacAuthMiddleware} from '../src/middleware/hmac-auth';
import type {AppEnv,Bindings} from '../src/types';
const app=new Hono<AppEnv>();app.use('*',hmacAuthMiddleware);app.get('/probe',c=>c.json({tenantId:c.get('tenantId')}));
async function request(secret:string,bindings:Partial<Bindings>){
 const timestamp=String(Date.now());const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,encoder.encode(`${timestamp}.GET./probe.`));const signature=Array.from(new Uint8Array(mac),b=>b.toString(16).padStart(2,'0')).join('');
 return app.request('https://mnhl.me/probe',{headers:{'x-signature':signature,'x-timestamp':timestamp,'x-tenant-id':'tenant-1'}},bindings as Bindings);
}
describe('HMAC rotation compatibility',()=>{
 test('accepts current and previous keys during overlap, then rejects the retired key',async()=>{
  const overlap={HMAC_SECRET:'new-key-for-test',HMAC_PREVIOUS_SECRET:'previous-key-for-test'};
  for(const key of [overlap.HMAC_SECRET,overlap.HMAC_PREVIOUS_SECRET]){const res=await request(key,overlap);expect(res.status).toBe(200);expect(await res.json()).toEqual({tenantId:'tenant-1'});}
  const final={HMAC_SECRET:overlap.HMAC_SECRET};expect((await request(overlap.HMAC_SECRET,final)).status).toBe(200);expect((await request(overlap.HMAC_PREVIOUS_SECRET,final)).status).toBe(401);expect((await request('unrelated-key',overlap)).status).toBe(401);
 });
 test('requires a configured primary key even when the previous key exists',async()=>{
  expect((await request('previous-key-for-test',{HMAC_SECRET:'',HMAC_PREVIOUS_SECRET:'previous-key-for-test'})).status).toBe(401);
 });
});
