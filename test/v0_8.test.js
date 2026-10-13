import test from "node:test";
import assert from "node:assert/strict";
import { WorkforceService } from "../src/services/workforceService.js";
import { createAuthorizationMiddleware } from "../src/middleware/authorize.js";

function responseRecorder(){return {status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}

test("worker create is tenant-bound and uses authenticated creator", async()=>{
  let payload;
  const supabase={from(table){assert.equal(table,"workers");return {insert(row){payload=row;return this;},select(){return this;},single:async()=>({data:{id:"w1",...payload},error:null})};}};
  const service=new WorkforceService({supabase});
  await service.createWorker({companyId:"c1",userId:"u1",input:{employeeCode:"EMP-001",fullName:"Site Worker",status:"ACTIVE"}});
  assert.equal(payload.company_id,"c1"); assert.equal(payload.created_by,"u1"); assert.equal(payload.employee_code,"EMP-001");
});

test("attendance validates the site and writes a tenant-bound record", async()=>{
  const calls=[]; let payload;
  const chain=(table)=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==="workers"?{id:"w1"}:{id:"s1",company_id:"c1",project_id:"p1"},error:null}),insert(row){payload=row;return this;},single:async()=>({data:{id:"a1",...payload},error:null})});
  const supabase={from(table){calls.push(table);return chain(table);}};
  const service=new WorkforceService({supabase});
  const out=await service.recordAttendance({companyId:"c1",userId:"u1",input:{workerId:"w1",siteId:"s1",attendanceDate:"2026-10-01",status:"PRESENT"}});
  assert.equal(out.company_id,"c1"); assert.equal(payload.recorded_by,"u1"); assert.equal(payload.project_id,"p1"); assert.deepEqual(calls,["workers","sites","attendance_records"]);
});

test("duplicate attendance is left to the database unique constraint", async()=>{
  const error={code:"23505",message:"duplicate key value violates unique constraint"};
  const chain=(table)=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:table==="workers"?"w1":"s1",company_id:"c1",project_id:null},error:null}),insert(){return this;},single:async()=>({data:null,error})});
  const supabase={from:()=>chain("workers")};
  const service=new WorkforceService({supabase});
  await assert.rejects(service.recordAttendance({companyId:"c1",userId:"u1",input:{workerId:"w1",siteId:"s1",attendanceDate:"2026-10-01",status:"PRESENT"}}),e=>e.code==="23505");
});

test("worker permission is denied to a role without worker access", async()=>{
  const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async()=>({company_id:"c1",user_id:"u1",role:"ACCOUNTANT",permissions:["expense:read"]})}});
  const req={user:{id:"u1"},params:{companyId:"c1"}}; const res=responseRecorder(); let next=false;
  await authorize("worker:read")(req,res,()=>{next=true;});
  assert.equal(next,false); assert.equal(res.code,403); assert.equal(res.body.error.code,"FORBIDDEN");
});

test("cross-tenant worker access is rejected by authorization context", async()=>{
  const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async({companyId})=>companyId==="c1"?{company_id:"c1",user_id:"u1",role:"HR_MANAGER",permissions:["worker:read"]}:null}});
  const req={user:{id:"u1"},params:{companyId:"c2"}}; const res=responseRecorder();
  await authorize("worker:read")(req,res,()=>{throw new Error("next should not run");});
  assert.equal(res.code,403); assert.equal(res.body.error.code,"COMPANY_ACCESS_DENIED");
});
