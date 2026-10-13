import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, '../src');
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}
function normalizeRoute(route) {
  return route.replace(/^\/+|\/+$/g, '').replace(/:[^/]+/g, ':param');
}

test('frontend relative imports resolve to real source/assets', () => {
  const missing = [];
  for (const file of filesUnder(srcDir).filter(file => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file))) {
    const source = readFileSync(file, 'utf8');
    const pattern = /(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
      const target = path.resolve(path.dirname(file), match[1]);
      const candidates = [target, ...['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css', '.json'].map(ext => target + ext), ...['index.js', 'index.jsx', 'index.mjs'].map(name => path.join(target, name))];
      if (!candidates.some(existsSync)) missing.push(`${path.relative(srcDir, file)} -> ${match[1]}`);
    }
  }
  assert.deepEqual(missing, [], `Unresolved relative imports:\n${missing.join('\n')}`);
});

test('every sidebar navigation target is declared as a React route or the index route', () => {
  const app = readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
  const layout = readFileSync(path.join(srcDir, 'components/Layout.jsx'), 'utf8');
  const declared = new Set([...app.matchAll(/<Route\s+path="([^"]*)"/g)].map(match => normalizeRoute(match[1])));
  declared.add(''); // React Router index route.
  const navigation = [...layout.matchAll(/\['([^']+)'\s*,\s*'[^']+'/g)].map(match => match[1]);
  const missing = navigation.filter(route => !declared.has(normalizeRoute(route)));
  assert.deepEqual(missing, [], `Sidebar routes without declarations: ${missing.join(', ')}`);
});

test('offline sync failures are visible and failed changes can be retried deliberately', () => {
  const panel = readFileSync(path.join(srcDir, 'components/SyncQueuePanel.jsx'), 'utf8');
  const layout = readFileSync(path.join(srcDir, 'components/Layout.jsx'), 'utf8');
  assert.ok(layout.includes('<SyncQueuePanel/>'), 'global layout must expose sync queue management');
  assert.ok(panel.includes('role="dialog" aria-modal="true"'));
  assert.ok(panel.includes("item.state === 'conflict'"));
  assert.ok(panel.includes("item.state === 'failed'"));
  assert.ok(panel.includes("state: 'pending', lastError: null"));
  assert.ok(panel.includes('Resolve by opening the related record') || panel.includes('review the current server version'));
});

test('PWA service worker has a release-specific cache and never caches API responses', () => {
  const worker = readFileSync(path.resolve(srcDir, '../public/sw.js'), 'utf8');
  assert.ok(worker.includes('v5.7.8-rc34'));
  assert.ok(worker.includes("if (url.pathname.startsWith('/api/')) return;"));
  assert.ok(worker.includes("key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME"));
});
