import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SupportService} from '../src/services/supportService.js';

function membershipSupabase(member){return {from(table){assert.equal(table,'company_members');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:member,error:null};}};}};}

test('customer care provides quick verified help articles for common product workflows',async()=>{
 const service=new SupportService({supabase:{}});const faqs=await service.faq();
 assert.ok(faqs.length>=8);assert.ok(faqs.some(x=>/daily site report/i.test(x.question)));assert.ok(faqs.some(x=>/subscription payment/i.test(x.question)));assert.ok(faqs.every(x=>x.answer.length>40));
 const answer=await service.answerQuestion('How can I check subscription payment?');assert.equal(answer.mode,'VERIFIED_HELP_ARTICLES');assert.match(answer.answer,/Billing/);assert.equal(answer.needsHumanSupport,false);
});

test('support access requires active membership in the selected company',async()=>{
 const service=new SupportService({supabase:membershipSupabase({company_id:'company-1',role:'MEMBER',status:'SUSPENDED'})});
 await assert.rejects(()=>service.tickets({user:{id:'user-1'},companyId:'company-1'}),e=>e.code==='COMPANY_MEMBERSHIP_REQUIRED'&&e.status===403);
});

test('company feedback cannot be submitted by a normal member',async()=>{
 const service=new SupportService({supabase:membershipSupabase({company_id:'company-1',role:'SITE_ENGINEER',status:'ACTIVE'})});
 await assert.rejects(()=>service.createFeedback({user:{id:'user-1',email:'member@example.com'},companyId:'company-1',input:{rating:5,category:'GENERAL',subject:'Feature request',message:'Please improve this feature'}}),e=>e.code==='OWNER_FEEDBACK_REQUIRED'&&e.status===403);
});

test('platform owner data and customer feedback tables are isolated behind backend access checks',async()=>{
 const migration=await readFile(new URL('../supabase/migrations/20261009230000_v5_7_12_customer_care_platform_admin.sql',import.meta.url),'utf8');
 const adminRoute=await readFile(new URL('../src/routes/admin.js',import.meta.url),'utf8');
 assert.match(migration,/create table if not exists public\.support_tickets/i);assert.match(migration,/create table if not exists public\.company_feedback/i);assert.match(migration,/alter table public\.support_tickets enable row level security/i);assert.match(migration,/alter table public\.company_feedback enable row level security/i);
 assert.match(adminRoute,/r\.use\("\/admin", admin\)/);assert.match(adminRoute,/\/admin\/overview/);assert.match(adminRoute,/\/admin\/support\/tickets/);assert.match(adminRoute,/\/admin\/feedback/);
});
