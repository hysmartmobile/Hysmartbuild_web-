import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('PWA manifest is installable and all declared local icons exist', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  for (const icon of manifest.icons) assert.ok(existsSync(path.join(root, 'public', icon.src.replace(/^\//, ''))), `Missing icon: ${icon.src}`);
});

test('install UI supports native prompt and platform-specific fallback instructions', () => {
  const component = read('src/components/PWAInstallPrompt.jsx');
  assert.ok(component.includes("'beforeinstallprompt'"));
  assert.ok(component.includes("'appinstalled'"));
  assert.ok(component.includes('Add to Home Screen'));
  assert.ok(component.includes('Install app'));
  assert.ok(component.includes('localStorage'));
});

test('service worker uses a dedicated offline shell key and excludes authenticated/API requests', () => {
  const worker = read('public/sw.js');
  assert.ok(worker.includes('__hysmart_public_app_shell__'));
  assert.ok(worker.includes("url.pathname.startsWith('/api/')"));
  assert.ok(worker.includes("url.pathname.startsWith('/auth/')"));
  assert.ok(worker.includes("request.headers.has('authorization')"));
  assert.ok(worker.includes("request.method !== 'GET'"));
  assert.ok(worker.includes("key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME"));
});

test('web metadata declares iOS home-screen support and static hosting has SPA fallback', () => {
  const html = read('index.html');
  assert.ok(html.includes('apple-mobile-web-app-capable'));
  assert.ok(html.includes('apple-touch-icon'));
  assert.ok(read('public/_redirects').includes('/* /index.html 200'));
  assert.ok(read('public/_headers').includes('/sw.js'));
});
