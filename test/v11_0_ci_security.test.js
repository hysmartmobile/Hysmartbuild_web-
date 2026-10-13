import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const backendPackage = JSON.parse(fs.readFileSync(path.join(root, 'HySmart-Build-Backend/package.json'), 'utf8'));
const webPackage = JSON.parse(fs.readFileSync(path.join(root, 'HySmart-Build-Web/package.json'), 'utf8'));

test('v11 CI audits backend dependencies at high severity after locked install', () => {
  assert.match(workflow, /name: Audit backend dependency tree[\s\S]*?run: npm audit --audit-level=high[\s\S]*?working-directory: HySmart-Build-Backend/);
  assert.match(workflow, /name: Install backend dependencies[\s\S]*?run: npm ci/);
});

test('v11 CI audits frontend dependencies and retains production build gate', () => {
  assert.match(workflow, /name: Audit frontend dependency tree[\s\S]*?run: npm audit --audit-level=high[\s\S]*?working-directory: HySmart-Build-Web[\s\S]*?name: Build frontend[\s\S]*?run: npm run build/);
  assert.ok(fs.existsSync(path.join(root, 'HySmart-Build-Web/package-lock.json')));
  assert.equal(webPackage.scripts.build, 'vite build');
});

test('v11 CI remains non-deploying with read-only repository permissions', () => {
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.doesNotMatch(workflow, /uses:\s+.*deploy|run:\s+.*deploy/i);
  assert.equal(backendPackage.scripts.test, 'node --test');
  assert.equal(backendPackage.scripts['verify:release'], 'node test/v5_7_release_gate.test.js');
});
