import test from "node:test";
import assert from "node:assert/strict";
import { WorkService } from "../src/services/workService.js";

function resultChain(result) {
  return { select(){return this;}, eq(){return this;}, order(){return this;}, range(){return this;}, or(){return this;}, insert(v){this.payload=v;return this;}, update(v){this.payload=v;return this;}, delete(){return this;}, single:async()=>result, maybeSingle:async()=>result, then(resolve,reject){return Promise.resolve(result).then(resolve,reject);} };
}

test("task creation is project and tenant scoped and logs activity", async()=>{
  const calls=[];
  const supabase={from(table){calls.push(table); if(table==="projects") return resultChain({data:{id:"p1",company_id:"c1",name:"Build"},error:null}); if(table==="tasks") return resultChain({data:{id:"t1",title:"Pour foundation",status:"TODO",priority:"HIGH"},error:null}); if(table==="project_activity") return resultChain({data:null,error:null}); throw new Error(table);}};
  const service=new WorkService({supabase});
  const out=await service.createTask({companyId:"c1",projectId:"p1",userId:"u1",input:{title:"Pour foundation",priority:"HIGH"}});
  assert.equal(out.id,"t1"); assert.deepEqual(calls,["projects","tasks","project_activity"]);
});

test("issue creation never trusts a project outside the authenticated company", async()=>{
  const supabase={from(table){assert.equal(table,"projects");return resultChain({data:null,error:null});}};
  const service=new WorkService({supabase});
  await assert.rejects(()=>service.createIssue({companyId:"company-a",projectId:"project-b",userId:"u1",input:{title:"Crack"}}),e=>e.code==="PROJECT_NOT_FOUND" && e.status===404);
});

test("task update records status change activity", async()=>{
  let activity;
  const supabase={from(table){
    if(table==="projects") return resultChain({data:{id:"p1",company_id:"c1",name:"Build"},error:null});
    if(table==="tasks") return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:"t1",title:"Task",status:"TODO",assigned_to:null},error:null}),update(v){this.payload=v;return this;},single:async()=>({data:{id:"t1",title:"Task",status:"COMPLETED",assigned_to:null},error:null})};
    if(table==="project_activity") return {insert(v){activity=v;return this;}};
  }};
  const service=new WorkService({supabase});
  const out=await service.updateTask({companyId:"c1",projectId:"p1",taskId:"t1",userId:"u1",input:{status:"COMPLETED"}});
  assert.equal(out.status,"COMPLETED"); assert.equal(activity.action,"STATUS_CHANGED"); assert.equal(activity.entity_type,"TASK");
});
