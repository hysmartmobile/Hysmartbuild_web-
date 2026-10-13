import test from "node:test";
import assert from "node:assert/strict";
import { MaterialService } from "../src/services/materialService.js";

function chain(result){const c={};for(const m of ["select","eq","order","ilike","range","insert"]){c[m]=(...args)=>{if(m==="select"&&args[1]?.count)c.__count=true;return c;};}c.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);return c;}

test("inventory receipt delegates to atomic database RPC",async()=>{let args;const supabase={rpc:(name,payload)=>{args={name,payload};return Promise.resolve({data:{id:"tx-1",balance_after:12},error:null});}};const s=new MaterialService({supabase});const out=await s.moveStock({companyId:"c",userId:"u",input:{materialId:"m",type:"RECEIPT",quantity:5}});assert.equal(out.id,"tx-1");assert.equal(args.name,"apply_inventory_transaction");assert.equal(args.payload.p_quantity,5);});

test("inventory service does not calculate or directly mutate balances",async()=>{let called=false;const supabase={rpc:(name)=>{called=name;return Promise.resolve({data:{balance_after:3},error:null});}};const s=new MaterialService({supabase});await s.moveStock({companyId:"c",userId:"u",input:{materialId:"m",type:"ISSUE",quantity:2}});assert.equal(called,"apply_inventory_transaction");});

test("material request approval uses the atomic permission-checked My Work RPC",async()=>{let payload;const supabase={rpc:(name,p)=>{payload={name,p};return Promise.resolve({data:{item:{id:"r",status:"APPROVED"}},error:null});}};const s=new MaterialService({supabase});const r=await s.approveRequest({companyId:"c",userId:"u",requestId:"r",approve:true});assert.equal(r.status,"APPROVED");assert.equal(payload.name,"perform_my_work_action");assert.equal(payload.p.p_entity_type,"MATERIAL_REQUEST");assert.equal(payload.p.p_action,"APPROVE");});
