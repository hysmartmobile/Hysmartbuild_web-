import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backend = path.join(root, 'HySmart-Build-Backend');
const web = path.join(root, 'HySmart-Build-Web');
const read = (file) => fs.readFileSync(file, 'utf8');

test('v9 staging readiness: frontend and backend lockfiles exist for reproducible installs', () => {
  for (const dir of [backend, web]) {
    const pkg = JSON.parse(read(path.join(dir, 'package.json')));
    const lock = JSON.parse(read(path.join(dir, 'package-lock.json')));
    assert.equal(lock.name, pkg.name, `${dir} lockfile name matches package`);
    assert.equal(lock.version, pkg.version, `${dir} lockfile version matches package`);
    assert.ok(lock.lockfileVersion >= 2, `${dir} uses a modern npm lockfile`);
  }
  assert.equal(JSON.parse(read(path.join(web, 'package.json'))).scripts.build, 'vite build');
  assert.equal(JSON.parse(read(path.join(backend, 'package.json'))).scripts['verify:release'], 'node test/v5_7_release_gate.test.js');
});

test('v9 staging readiness: migration filenames are timestamped, unique, and SQL files are non-empty', () => {
  const dir = path.join(backend, 'supabase', 'migrations');
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(names.length >= 50, `expected full migration inventory, got ${names.length}`);
  assert.equal(new Set(names).size, names.length, 'migration filenames must be unique');
  for (const name of names) {
    assert.match(name, /^\d{14}_[a-z0-9_]+\.sql$/, `timestamped migration filename: ${name}`);
    assert.ok(read(path.join(dir, name)).trim().length > 0, `migration is not empty: ${name}`);
  }
});

test('v9 staging readiness: go/no-go runbook explicitly requires live verification before pilot', () => {
  const doc = read(path.join(root, 'STAGING-VERIFICATION-v9.md'));
  for (const phrase of [
    'DISPOSABLE STAGING DATABASE ONLY',
    'tenant isolation',
    'Backup restore',
    'payment provider',
    'frontend build',
    'Do not run migrations against production',
    'GO only when every gate is evidenced'
  ]) assert.ok(doc.includes(phrase), `runbook must contain: ${phrase}`);
});
