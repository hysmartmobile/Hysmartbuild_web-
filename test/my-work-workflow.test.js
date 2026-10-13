import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('My Work routes require authenticated role permissions for read and actions',async()=>{
 const source=await read('src/routes/myWork.js');
 assert.match(source,/authorize\('my-work:read'\)/);
 assert.match(source,/authorize\('my-work:act'\)/);
 assert.match(source,/entityType:z\.enum/);
 assert.match(source,/entityId:z\.string\(\)\.uuid\(\)/);
});

test('My Work source queries are company-scoped and user-scoped',async()=>{
 const source=await read('src/services/myWorkService.js');
 assert.match(source,/\.eq\('company_id',companyId\)/);
 assert.match(source,/assigned_to\.eq\.\$\{userId\},created_by\.eq\.\$\{userId\}/);
 assert.match(source,/recipient_user_id',userId/);
 assert.match(source,/reviewer_user_id/);
 assert.match(source,/purchase_requisitions/);
 assert.match(source,/material_requests/);
 assert.match(source,/supplier_invoices/);
 assert.match(source,/purchase_quotations/);
 assert.match(source,/allowedProject/);
});

test('decision RPC enforces source permissions, assigned ownership, reasons, and audit event',async()=>{
 const sql=await read('supabase/migrations/20261013100000_v5_7_15_personal_my_work_workflows.sql');
 for(const permission of ['report:approve','expense:approve','collaboration:approve','workflow:update','collaboration:respond','task:update','issue:update','notification:update','material:approve','procurement:approve']) assert.ok(sql.includes(permission),`missing ${permission}`);
 assert.match(sql,/MY_WORK_REJECTION_REASON_REQUIRED/);
 assert.match(sql,/MY_WORK_SELF_APPROVAL_FORBIDDEN/);
 assert.match(sql,/MY_WORK_ASSIGNMENT_REQUIRED/);
 assert.match(sql,/insert into public\.my_work_events/);
 assert.match(sql,/create or replace function public\.approve_expense/);
 assert.match(sql,/create or replace function public\.mark_expense_paid/);
 assert.match(sql,/permission_key='expense:approve'/);
 assert.match(sql,/permission_key='expense:pay'/);
 assert.match(sql,/approve_supplier_invoice_atomic/);
 assert.match(sql,/PURCHASE_QUOTATION/);
 assert.match(sql,/for update/);
});

test('every supported company role receives My Work access without receiving new domain permissions',async()=>{
 const sql=await read('supabase/migrations/20261013100000_v5_7_15_personal_my_work_workflows.sql');
 for(const role of ['SUPER_ADMIN','COMPANY_OWNER','COMPANY_ADMIN','DIRECTOR','PROJECT_MANAGER','SITE_ENGINEER','SITE_SUPERVISOR','ACCOUNTANT','STOREKEEPER','HR_MANAGER','WORKER','CLIENT','CEO','CIVIL_ENGINEER','MANAGEMENT','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR','PROCUREMENT_OFFICER']) assert.ok(sql.includes(`('${role}')`),`missing role ${role}`);
 assert.match(sql,/cross join \(values \('my-work:read'\),\('my-work:act'\)\)/);
 assert.match(sql,/select roles\.role, perms\.permission_key/);
});

test('My Work aggregation filters personal rows by user and project membership',async()=>{
 const {MyWorkService}=await import('../src/services/myWorkService.js');
 const fixtures={
  project_members:[{company_id:'c1',project_id:'p1',user_id:'u1',status:'ACTIVE'}],
  projects:[{company_id:'c1',id:'p1',name:'Assigned Project'},{company_id:'c1',id:'p2',name:'Unassigned Project'}],
  tasks:[
   {company_id:'c1',id:'t1',project_id:'p1',title:'My assigned task',status:'TODO',assigned_to:'u1',created_by:'u2',created_at:'2026-10-12T10:00:00Z'},
   {company_id:'c1',id:'t2',project_id:'p1',title:'Someone else task',status:'TODO',assigned_to:'u2',created_by:'u2',created_at:'2026-10-12T11:00:00Z'}
  ],
  daily_site_reports:[
   {company_id:'c1',id:'r1',project_id:'p1',report_date:'2026-10-12',approval_status:'PENDING',created_by:'u2',created_at:'2026-10-12T09:00:00Z'},
   {company_id:'c1',id:'r2',project_id:'p2',report_date:'2026-10-12',approval_status:'PENDING',created_by:'u2',created_at:'2026-10-12T09:30:00Z'},
   {company_id:'c1',id:'r3',project_id:'p1',report_date:'2026-10-11',approval_status:'PENDING',created_by:'u1',created_at:'2026-10-11T09:00:00Z'}
  ]
 };
 class Query{constructor(table){this.table=table;this.filters=[];this.orFilter=null;this.inFilter=null;}select(){return this;}eq(k,v){this.filters.push(x=>x[k]===v);return this;}or(v){this.orFilter=v.split(',').map(part=>{const [key,op,val]=part.split('.');return row=>op==='eq'?String(row[key])===val:false});return this;}in(k,vals){this.inFilter=row=>vals.includes(row[k]);return this;}order(){return this;}limit(){return this;}then(resolve,reject){try{let rows=(fixtures[this.table]||[]).filter(row=>this.filters.every(f=>f(row)));if(this.orFilter)rows=rows.filter(row=>this.orFilter.some(f=>f(row)));if(this.inFilter)rows=rows.filter(this.inFilter);resolve({data:rows,error:null});}catch(e){reject(e);}}}
 const service=new MyWorkService({supabase:{from:table=>new Query(table)}});
 const result=await service.get({companyId:'c1',userId:'u1',role:'SITE_ENGINEER',permissions:['my-work:read','my-work:act','task:update','report:approve']});
 assert.deepEqual(result.sections.personal.map(x=>x.sourceId),['t1']);
 assert.deepEqual(result.sections.review.map(x=>x.sourceId),['r1']);
 assert.deepEqual(result.sections.sent.map(x=>x.sourceId),['r3']);
 assert.equal(result.sections.review[0].projectName,'Assigned Project');
 assert.ok(!JSON.stringify(result).includes('Unassigned Project'));
});


test('workflow hardening removes client-written audit entries and repairs legacy expense RPCs',async()=>{
 const sql=await read('supabase/migrations/20261013130000_v5_7_16_workflow_security_routing_hardening.sql');
 assert.match(sql,/revoke all on all tables in schema public from public, anon, authenticated/);
 assert.match(sql,/alter default privileges in schema public revoke all on tables from public, anon, authenticated/);
 assert.match(sql,/drop policy if exists my_work_events_actor_insert/);
 assert.match(sql,/revoke insert, update, delete, truncate, references, trigger on public\.my_work_events from public, anon, authenticated/);
 assert.match(sql,/coalesce\(auth\.role\(\),''\) <> 'service_role'/);
 assert.match(sql,/create or replace function public\.approve_expense/);
 assert.match(sql,/create or replace function public\.mark_expense_paid/);
 const approveFn=sql.split('create or replace function public.approve_expense')[1].split('create or replace function public.mark_expense_paid')[0];
 assert.doesNotMatch(approveFn,/p_entity_type|v_project_id|p_entity_id|p_action|v_row/);
 assert.match(sql,/grant execute on function public\.mark_expense_paid\(uuid,uuid,uuid,text\) to service_role/);
 assert.match(sql,/revoke execute on all functions in schema public from public, anon, authenticated/);
 assert.match(sql,/grant execute on all functions in schema public to service_role/);
});

test('site and engineering hand-offs notify the assigned responder and return decisions to originators',async()=>{
 const sql=await read('supabase/migrations/20261013130000_v5_7_16_workflow_security_routing_hardening.sql');
 assert.match(sql,/notify_rfi_handoff/);
 assert.match(sql,/RFI_ASSIGNED/);
 assert.match(sql,/RFI_RESPONSE/);
 assert.match(sql,/notify_site_instruction_handoff/);
 assert.match(sql,/SITE_INSTRUCTION_ISSUED/);
 assert.match(sql,/SITE_INSTRUCTION_ACKNOWLEDGED/);
});

test('team invitation UI exposes all operational role families and API prevents privilege escalation',async()=>{
 const route=await read('src/routes/companies.js');
 const ui=await read('../HySmart-Build-Web/src/pages/Team.jsx');
 for(const role of ['CEO','MANAGEMENT','CIVIL_ENGINEER','COMMERCIAL_MANAGER','QUANTITY_SURVEYOR','PROCUREMENT_OFFICER']) assert.ok(ui.includes(role),`missing invitation role ${role}`);
 assert.match(ui,/inviteRoles\.map/);
 assert.match(ui,/useOutletContext/);
 assert.match(route,/ROLE_ASSIGNMENT_FORBIDDEN/);
 assert.match(route,/operationalInviteRoles\.includes\(input\.role\)/);
});
