import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v16 field report uses editable speech-to-text by default and makes original audio opt-in',()=>{
 const page=fs.readFileSync(new URL('../../HySmart-Build-Web/src/pages/Reports.jsx',import.meta.url),'utf8');
 assert.match(page,/const startDictation=\(\)=>/);
 assert.match(page,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
 assert.match(page,/Editable transcript/);
 assert.match(page,/Retain original audio as evidence \(optional\)/);
 assert.match(page,/checked=\{retainAudio\}/);
 assert.match(page,/onClick=\{\(\)=>startRecording\('audio'\)\} disabled=\{!!recordingType\|\|fileBusy\}/);
});

test('v16 report service routes in-app notifications only to active project members other than the author',()=>{
 const service=fs.readFileSync(new URL('../src/services/reportService.js',import.meta.url),'utf8');
 assert.match(service,/from\("project_members"\)\.select\("user_id"\)/);
 assert.match(service,/\.eq\("company_id",companyId\)\.eq\("project_id",projectId\)\.eq\("status","ACTIVE"\)/);
 assert.match(service,/id!==userId/);
 assert.match(service,/type:"DAILY_SITE_REPORT"/);
 assert.match(service,/notification_delivery:notificationDelivery/);
 assert.match(service,/notificationDelivery=\{status:"FAILED"/);
});
