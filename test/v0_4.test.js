import test from "node:test";
import assert from "node:assert/strict";
import { ProjectService } from "../src/services/projectService.js";
import { createAuthorizationMiddleware } from "../src/middleware/authorize.js";

function chain(result) {
  return { select(){return this;}, eq(){return this;}, order(){return this;}, range(){return this;}, or(){return this;}, insert(){return this;}, update(){return this;}, delete(){return this;}, single:async()=>result, maybeSingle:async()=>result, then(resolve,reject){return Promise.resolve(result).then(resolve,reject);} };
}

test("project list is tenant-scoped and paginated", async()=>{
  let args=[];
  const supabase={from(table){assert.equal(table,"projects");const c=chain({data:[{id:"p1",company_id:"c1"}],count:1,error:null});const original=c.eq;c.eq=function(k,v){args.push([k,v]);return this;};return c;}};
  const service=new ProjectService({supabase});
  const out=await service.listProjects({companyId:"c1",page:2,pageSize:10,search:"Lekki",status:"ACTIVE"});
  assert.equal(out.total,1); assert.equal(out.page,2); assert.ok(args.some(x=>x[0]==="company_id"&&x[1]==="c1")); assert.ok(args.some(x=>x[0]==="status"&&x[1]==="ACTIVE"));
});

test("project create uses authenticated user and tenant from server context", async()=>{
  let payload;
  const supabase={from(table){assert.equal(table,"projects");return {insert(v){payload=v;return this;},select(){return this;},single:async()=>({data:{id:"p1",...payload},error:null})};}};
  const service=new ProjectService({supabase});
  await service.createProject({companyId:"company-a",userId:"user-a",input:{name:"Bridge Project",budget:1200000}});
  assert.equal(payload.company_id,"company-a"); assert.equal(payload.created_by,"user-a"); assert.equal(payload.name,"Bridge Project");
});

test("authorization blocks project access across tenants", async()=>{
  const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async({companyId})=>companyId==="company-a"?{company_id:companyId,user_id:"u1",role:"PROJECT_MANAGER",permissions:["project:read"]}:null}});
  const req={user:{id:"u1"},params:{companyId:"company-b"}}; const res={status(c){this.code=c;return this;},json(b){this.body=b;return this;}}; let next=false;
  await authorize("project:read")(req,res,()=>{next=true;}); assert.equal(next,false); assert.equal(res.code,403); assert.equal(res.body.error.code,"COMPANY_ACCESS_DENIED");
});

test("project manager cannot use project delete permission unless explicitly mapped", async()=>{
  const authorize=createAuthorizationMiddleware({rbacService:{getAuthorization:async()=>({company_id:"c1",user_id:"u1",role:"PROJECT_MANAGER",permissions:["project:read","project:update"]})}});
  const req={user:{id:"u1"},params:{companyId:"c1"}}; const res={status(c){this.code=c;return this;},json(b){this.body=b;return this;}}; let next=false;
  await authorize("project:delete")(req,res,()=>{next=true;}); assert.equal(next,false); assert.equal(res.code,403); assert.equal(res.body.error.code,"FORBIDDEN");
});
