import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('..', import.meta.url).pathname;
test('HySmart Intelligence adds Ask HySmart, predictions and alerts without replacing the project page', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/AIIntelligence.jsx'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8');
  assert.match(page, /Ask HySmart/);
  assert.match(page, /Predictive signals/);
  assert.match(page, /Proactive alerts/);
  assert.match(page, /human review/i);
  assert.match(api, /aiAssistantOverview/);
  assert.match(api, /askProjectAi/);
});

test('HySmart Intelligence exposes trained schedule model status and permission-gated refresh action', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/AIIntelligence.jsx'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8');
  assert.match(source, /Trained schedule model/);
  assert.match(source, /intelligence-model:train/);
  assert.match(source, /Train \/ refresh schedule model/);
  assert.match(source, /Holdout accuracy/);
  assert.match(api, /trainProjectAiModel/);
});
