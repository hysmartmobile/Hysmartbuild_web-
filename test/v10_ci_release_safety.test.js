import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v10 CI runs backend tests and release gate after locked dependency install', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run verify:release/);
  assert.match(workflow, /HySmart-Build-Backend\/package-lock\.json/);
});

test('v10 CI performs frontend production build with locked dependencies', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /HySmart-Build-Web\/package-lock\.json/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /frontend-build/);
});

test('v10 CI has read-only repository permissions and no automatic deployment step', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /\b(appleboy\/ssh-action|aws-actions\/configure-aws-credentials|azure\/webapps-deploy|vercel deploy|supabase db push)\b/i);
});
