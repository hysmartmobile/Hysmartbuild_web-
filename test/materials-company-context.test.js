import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/pages/Materials.jsx',import.meta.url),'utf8');

test('materials and inventory reload when the active company changes',()=>{
  assert.match(source,/useOutletContext/);
  assert.match(source,/\[outlet\.companyId\]/);
  assert.match(source,/setData\(\[\]\);setInv\(\[\]\)/);
  assert.match(source,/requestVersion=useRef\(0\)/);
  assert.match(source,/requestId!==requestVersion\.current/);
  assert.match(source,/requestVersion\.current\+=1/);
});

test('materials and inventory failures are visible and retryable instead of appearing as empty stock',()=>{
  assert.match(source,/setError\(e\?\.message\|\|'Materials and inventory could not be loaded/);
  assert.match(source,/role="alert"/);
  assert.match(source,/<Button onClick=\{load\} disabled=\{loading\}>Retry<\/Button>/);
  assert.doesNotMatch(source,/\.catch\(\(\)=>\{\}\)/);
});

test('material creation reports errors and prevents duplicate submissions while saving',()=>{
  assert.match(source,/setSaving\(true\)/);
  assert.match(source,/catch\(e\)\{setError/);
  assert.match(source,/disabled=\{saving\}/);
});
