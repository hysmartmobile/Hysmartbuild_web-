import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateCriticalPath } from '../src/services/scheduleService.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('v2.2 migration creates tenant-scoped schedule controls',()=>{
 const sql=read('supabase/migrations/20261004160000_v2_2_planning_scheduling_progress.sql');
 for(const x of ['project_schedule_activities','project_schedule_dependencies','project_schedule_baselines','project_schedule_baseline_items','project_schedule_progress_updates','project_schedule_delays','schedule:read','schedule:manage','schedule:approve']) assert.match(sql,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(sql,/enable row level security/gi);assert.match(sql,/unique\(company_id, project_id, activity_code\)/);assert.match(sql,/project_schedule_dependencies_predecessor_tenant_fk/);assert.match(sql,/project_schedule_baseline_items_activity_tenant_fk/);
});

test('CPM calculates a critical path and float',()=>{
 const a=[
  {id:'a',planned_start:'2026-10-01',planned_finish:'2026-10-03',calendar_days:3},
  {id:'b',planned_start:'2026-10-04',planned_finish:'2026-10-05',calendar_days:2},
  {id:'c',planned_start:'2026-10-04',planned_finish:'2026-10-08',calendar_days:5},
  {id:'d',planned_start:'2026-10-09',planned_finish:'2026-10-10',calendar_days:2}
 ];
 const d=[{predecessor_id:'a',successor_id:'b',dependency_type:'FS',lag_days:0},{predecessor_id:'a',successor_id:'c',dependency_type:'FS',lag_days:0},{predecessor_id:'b',successor_id:'d',dependency_type:'FS',lag_days:0},{predecessor_id:'c',successor_id:'d',dependency_type:'FS',lag_days:0}];
 const out=calculateCriticalPath(a,d);assert.equal(out.find(x=>x.id==='c').is_critical,true);assert.equal(out.find(x=>x.id==='b').is_critical,false);assert.ok(out.find(x=>x.id==='b').total_float_days>0);
});

test('CPM rejects dependency cycles',()=>{assert.throws(()=>calculateCriticalPath([{id:'a',calendar_days:1},{id:'b',calendar_days:1}],[{predecessor_id:'a',successor_id:'b',dependency_type:'FS',lag_days:0},{predecessor_id:'b',successor_id:'a',dependency_type:'FS',lag_days:0}]),e=>e.code==='SCHEDULE_CYCLE');});

test('CPM supports SS, FF and SF relationships',()=>{const a=[{id:'a',calendar_days:3},{id:'b',calendar_days:2},{id:'c',calendar_days:2},{id:'d',calendar_days:2}];const d=[{predecessor_id:'a',successor_id:'b',dependency_type:'SS',lag_days:1},{predecessor_id:'b',successor_id:'c',dependency_type:'FF',lag_days:0},{predecessor_id:'c',successor_id:'d',dependency_type:'SF',lag_days:0}];const out=calculateCriticalPath(a,d);assert.equal(out.length,4);assert.ok(out.every(x=>Number.isFinite(x.total_float_days)));});

test('schedule routes expose planning controls',()=>{const r=read('src/routes/schedule.js');for(const p of ['/schedule/wbs','/schedule/dashboard','/schedule/lookahead','/schedule/activities','/schedule/dependencies','/schedule/recalculate','/schedule/baselines','/progress','/schedule/delays'])assert.match(r,new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});

test('web planning page and API surface are wired',()=>{const app=read('../HySmart-Build-Web/src/App.jsx');const nav=read('../HySmart-Build-Web/src/components/Layout.jsx');const api=read('../HySmart-Build-Web/src/lib/api.js');assert.match(app,/Planning/);assert.match(app,/path="planning"/);assert.match(nav,/\/planning/);for(const x of ['scheduleDashboard','createScheduleActivity','createScheduleDependency','updateScheduleProgress','createScheduleDelay'])assert.match(api,new RegExp(x));});
