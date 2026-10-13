import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WorkforceService } from '../src/services/workforceService.js';


function supabaseFor({ worker, site, project, attendance }) {
  return {
    from(table) {
      const state = { table, inserted: null, selected: null, filters: [] };
      const builder = {
        select(value) { state.selected = value; return builder; },
        eq(key, value) { state.filters.push([key, value]); return builder; },
        maybeSingle: async () => ({ data: table === 'workers' ? worker : table === 'sites' ? site : table === 'projects' ? project : null, error: null }),
        insert(value) { state.inserted = value; return builder; },
        single: async () => ({ data: { ...state.inserted, id: state.inserted.id || 'generated-id' }, error: null }),
      };
      return builder;
    },
  };
}

test('v14 media upload and attachment routes share a strict supported MIME and size contract', () => {
  const routes = fs.readFileSync(new URL('../src/routes/reports.js', import.meta.url), 'utf8');
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'video/webm', 'video/mp4', 'video/quicktime']) assert.ok(routes.includes(`"${mimeType}"`), `missing ${mimeType}`);
  assert.match(routes, /fileSize:z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\*1024\*1024\)/);
  assert.match(routes, /mediaUploadSchema/);
  assert.match(routes, /mediaAttachmentSchema/);
});

test('v14 media migration keeps the storage bucket private and caps uploads at 100 MB', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261009150000_v5_9_field_media_capture.sql', import.meta.url), 'utf8');
  assert.match(migration, /public = false/);
  assert.match(migration, /file_size_limit = 104857600/);
  assert.match(migration, /allowed_mime_types/);
});

test('v14 attendance site lookup includes coordinates needed for server-side GPS verification', async () => {
  const site = { id: 'site-id', company_id: 'company-id', project_id: 'project-id', name: 'Main Site', status: 'ACTIVE', latitude: 6.5244, longitude: 3.3792 };
  const svc = new WorkforceService({ supabase: supabaseFor({ worker: { id: 'worker-id', company_id: 'company-id' }, site, project: { id: 'project-id', company_id: 'company-id' } }) });
  const result = await svc.assertSite({ companyId: 'company-id', siteId: 'site-id' });
  assert.equal(result.latitude, 6.5244);
  assert.equal(result.longitude, 3.3792);
  assert.equal(svc.verifyLocation({ site: result, latitude: 6.5245, longitude: 3.3793, accuracyM: 10 }).verified, true);
  assert.equal(svc.verifyLocation({ site: result, latitude: 6.6, longitude: 3.5, accuracyM: 10 }).verified, false);
  const recorded = await svc.recordAttendance({ companyId: 'company-id', userId: 'user-id', input: { workerId: 'worker-id', projectId: 'project-id', siteId: 'site-id', attendanceDate: '2026-10-09', status: 'PRESENT', checkInAt: '2026-10-09T08:00:00.000Z', locationLatitude: 6.5245, locationLongitude: 3.3793, locationAccuracyM: 10 } });
  assert.equal(recorded.location_latitude, 6.5245);
  assert.equal(recorded.location_longitude, 3.3793);
  assert.equal(recorded.location_accuracy_m, 10);
  assert.equal(recorded.location_verified, true);
});

test('v14 field capture UI records audio/video and maps GPS to backend field names', () => {
  const report = fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Reports.jsx', import.meta.url), 'utf8');
  const attendance = fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Attendance.jsx', import.meta.url), 'utf8');
  assert.match(report, /getUserMedia/);
  assert.match(report, /new MediaRecorder/);
  assert.match(report, /uploadToSignedUrl/);
  assert.match(report, /locationLatitude:pos\.coords\.latitude/);
  assert.match(report, /locationAccuracyM:pos\.coords\.accuracy/);
  assert.match(attendance, /locationLatitude:pos\.coords\.latitude/);
  assert.match(attendance, /locationLongitude:pos\.coords\.longitude/);
  assert.match(attendance, /locationAccuracyM:pos\.coords\.accuracy/);
});

test('v14 database migration raises private evidence limits for audio/video without making the bucket public', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261009150000_v5_9_field_media_capture.sql', import.meta.url), 'utf8');
  assert.match(migration, /'audio\/webm'/);
  assert.match(migration, /'video\/mp4'/);
  assert.match(migration, /104857600/);
  assert.match(migration, /where id = 'site-report-photos'/);
  assert.doesNotMatch(migration, /public\s*=\s*true/i);
});

test('v15 field capture prevents stale GPS reuse and clearly asks before unverified submission', () => {
  const report = fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Reports.jsx', import.meta.url), 'utf8');
  const attendance = fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Attendance.jsx', import.meta.url), 'utf8');
  assert.match(report, /120000/);
  assert.match(report, /No GPS evidence is attached/);
  assert.match(attendance, /120000/);
  assert.match(attendance, /No GPS evidence is attached/);
  assert.match(attendance, /clearLocation\(\)/);
});

test('v15 offline evidence caption preserves the actual media type', () => {
  const api = fs.readFileSync(new URL('../../HySmart-Build-Web/src/lib/api.js', import.meta.url), 'utf8');
  assert.match(api, /photo\.type\.startsWith\('image\/'\)\?'Site photo':photo\.type\.startsWith\('video\/'\)\?'Site video':'Voice recording'/);
});
