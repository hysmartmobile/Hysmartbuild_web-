import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const web = path.resolve(root, '../HySmart-Build-Web');
const read = (p) => fs.readFileSync(p, 'utf8');

test('production release has no accidental temp or environment secret files', () => {
  const forbidden = [];
  for (const base of [root, web]) {
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git') continue;
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if ((/\.tmp$/.test(name) || (name.startsWith('.env') && name !== '.env.example'))) forbidden.push(p);
      }
    };
    walk(base);
  }
  assert.deepEqual(forbidden, []);
});

test('web API has no localhost production fallback', () => {
  assert.doesNotMatch(read(path.join(web, 'src/lib/api.js')), /localhost:3001/);
  assert.doesNotMatch(read(path.join(web, 'src/lib/sync.js')), /localhost:3001/);
});

test('service worker is registered in production', () => {
  assert.match(read(path.join(web, 'src/main.jsx')), /serviceWorker\.register\('\/sw\.js'\)/);
});

test('service worker cleans all stale HySmart shell caches', () => {
  const sw = read(path.join(web, 'public/sw.js'));
  assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
  assert.match(sw, /key !== CACHE_NAME/);
});

test('PWA manifest provides installable raster icons', () => {
  const manifest = JSON.parse(read(path.join(web, 'public/manifest.webmanifest')));
  assert.ok(manifest.icons.some((x) => x.src === '/icon-192.png' && x.sizes === '192x192'));
  assert.ok(manifest.icons.some((x) => x.src === '/icon-512.png' && x.sizes === '512x512'));
  assert.equal(fs.statSync(path.join(web, 'public/icon-192.png')).size > 0, true);
  assert.equal(fs.statSync(path.join(web, 'public/icon-512.png')).size > 0, true);
});

test('sidebar navigation has a routed collaboration page', () => {
  const app = read(path.join(web, 'src/App.jsx'));
  assert.match(app, /<Route path="collaboration" element={<Collaboration\/>}\/>/);
});

test('production environment rejects localhost CORS/web URLs', () => {
  const env = read(path.join(root, 'src/config/env.js'));
  assert.match(env, /Production CORS_ORIGIN must not contain localhost/);
  assert.match(env, /Production WEB_APP_URL must not point to localhost/);
  assert.match(env, /Production BILLING_CALLBACK_URL must not point to localhost/);
});

test('authenticated actor identity reaches request audit records', () => {
  assert.match(read(path.join(root, 'src/middleware/auth.js')), /res\.locals\.actorUserId = data\.user\.id/);
  assert.match(read(path.join(root, 'src/middleware/audit.js')), /res\.locals\.actorUserId/);
});

test('readiness checks latest BOQ and daily-intelligence schema', () => {
  const service = read(path.join(root, 'src/service.js'));
  assert.match(service, /purchase_order_items/);
  assert.match(service, /daily_intelligence_snapshots/);
  assert.match(service, /daily_intelligence_outcomes/);
});

test('frontend Supabase configuration fails clearly when production env is missing', () => {
  const supabase = read(path.join(web, 'src/lib/supabase.js'));
  assert.match(supabase, /VITE_SUPABASE_URL/);
  assert.match(supabase, /VITE_SUPABASE_ANON_KEY/);
});
