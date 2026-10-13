import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
test("V2.1 migration adds field GPS evidence and sync idempotency",()=>{const s=read("supabase/migrations/20261004150000_v2_1_field_operations_offline.sql");for(const x of ["location_latitude","location_longitude","location_accuracy_m","location_verified","offline_sync_operations_company_operation_uidx"])assert.match(s,new RegExp(x));});
test("V2.1 attendance validates and stores GPS evidence",()=>{const s=read("src/services/workforceService.js");assert.match(s,/verifyLocation/);assert.match(s,/location_verified: location\.verified/);assert.match(s,/location_latitude: input\.locationLatitude/);});
test("V2.1 daily reports verify site ownership and GPS",()=>{const s=read("src/services/reportService.js");assert.match(s,/SITE_PROJECT_MISMATCH/);assert.match(s,/await this\.verifyLocation/);});
test("V2.1 offline sync replays through dedicated sync API",()=>{const s=read("../HySmart-Build-Web/src/lib/sync.js");assert.match(s,/\/sync\/push/);assert.match(s,/operationId:item\.operationId/);});
test("V2.1 field mutations use stable client IDs",()=>{const s=read("../HySmart-Build-Web/src/lib/api.js");assert.match(s,/crypto\.randomUUID\(\)/);assert.match(s,/CREATE_REPORT/);assert.match(s,/CREATE_ATTENDANCE/);});

test("V2.1 offline report photos are retained for post-sync upload",()=>{const s=read("../HySmart-Build-Web/src/lib/sync.js");assert.match(s,/item\.photo/);assert.match(s,/uploadToSignedUrl/);});
