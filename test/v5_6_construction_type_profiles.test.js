import assert from 'node:assert/strict';import {ConstructionTypeProfileService} from '../src/services/constructionTypeProfileService.js';
const fake={from(){return {select(){return this},eq(){return this},limit:async()=>({data:[{id:'p1',name:'Tower',construction_type:'BUILDING'}],error:null}),maybeSingle:async()=>({data:{id:'p1',name:'Tower',construction_type:'ESTATE'},error:null}),update(){return this}}}};
const s=new ConstructionTypeProfileService({supabase:fake});
assert.equal(s.profiles().length,7);assert.equal(s.profiles().find(x=>x.key==='ESTATE').units.includes('plot'),true);
const row=(await s.get({companyId:'c',projectId:'p'}))[0];assert.equal(row.constructionType,'ESTATE');
console.log('v5.6 construction type profile tests passed');
