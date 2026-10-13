import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Today service reads attendance from the migrated attendance_records table',()=>{
 const service=fs.readFileSync(path.join(root,'src/services/operatingSystemService.js'),'utf8');
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261002010000_v0_8_workers_attendance.sql'),'utf8');
 assert.match(migration,/create table public\.attendance_records\s*\(/i);
 assert.match(service,/from\('attendance_records'\)\.select\('id,status,attendance_date'\)/);
 assert.doesNotMatch(service,/from\('attendance'\)/);
});
test('Today service uses real attendance table name in source metadata',()=>{
 const service=fs.readFileSync(path.join(root,'src/services/operatingSystemService.js'),'utf8');
 assert.match(service,/sources:\['projects','daily_site_reports','attendance_records','production'/);
});
