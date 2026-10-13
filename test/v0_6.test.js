import test from "node:test";
import assert from "node:assert/strict";
import { ReportService } from "../src/services/reportService.js";
import { PERMISSIONS } from "../src/rbac.js";

function chain(value, error=null){const c={eq(){return c},gte(){return c},lte(){return c},order(){return c},range(){return Promise.resolve({data:value,count:Array.isArray(value)?value.length:0,error})},maybeSingle(){return Promise.resolve({data:value,error})},insert(){return c},select(){return c},update(){return c},delete(){return c}};return c;}

test("V0.6 exposes daily report permissions",()=>{assert.ok(PERMISSIONS.includes("report:create"));assert.ok(PERMISSIONS.includes("report:read"));assert.ok(PERMISSIONS.includes("report:update"));});

test("ReportService rejects access to a project outside the tenant",async()=>{const supabase={from(){return {select(){return {eq(){return this},maybeSingle:async()=>({data:null,error:null})}}}}};const service=new ReportService({supabase});await assert.rejects(()=>service.listReports({companyId:"company-a",projectId:"project-b"}),e=>e.code==="PROJECT_NOT_FOUND"&&e.status===404);});

test("ReportService lists reports with project and date boundaries",async()=>{let calls=[];const make=(result)=>new Proxy({}, {get(_t,prop){if(prop==="range") return ()=>Promise.resolve(result); if(prop==="maybeSingle") return async()=>result; return (..._args)=>make(result);}}); const supabase={from(table){calls.push(table); return make(table==="projects"?{data:{id:"p1",company_id:"c1",name:"Site"},error:null}:{data:[{id:"r1",report_date:"2026-10-01"}],count:1,error:null});}};const service=new ReportService({supabase});const out=await service.listReports({companyId:"c1",projectId:"p1",fromDate:"2026-10-01",toDate:"2026-10-01"});assert.equal(out.total,1);assert.equal(out.items[0].id,"r1");assert.deepEqual(calls,["projects","daily_site_reports"]);});
