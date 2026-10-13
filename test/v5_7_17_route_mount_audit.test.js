import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every backend route module is imported and mounted by the application', () => {
  const routeDir = path.join(root, 'src/routes');
  const app = readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const files = readdirSync(routeDir).filter(file => file.endsWith('.js'));
  const missing = files.filter(file => {
    const stem = file.replace(/\.js$/, '');
    return !app.includes(`./routes/${stem}.js`) || !new RegExp(`create[A-Za-z0-9]+Router\\([^\\n]*`).test(app);
  });
  assert.deepEqual(missing, [], `Route modules not referenced by app.js: ${missing.join(', ')}`);
  const mountedFactories = [...app.matchAll(/app\.use\([^\n]*create([A-Za-z0-9]+)Router\(/g)].map(match => match[1]);
  assert.ok(mountedFactories.length >= files.length, `Expected all ${files.length} route modules to be mounted, found ${mountedFactories.length}`);
});
