import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('theme utility safely persists and broadcasts a validated light/dark theme', () => {
  const source = read('../src/lib/theme.js');
  assert.match(source, /STORAGE_KEY\s*=\s*'hysmart\.theme'/);
  assert.match(source, /new Set\(\['light', 'dark'\]\)/);
  assert.match(source, /hysmart-theme-change/);
  assert.match(source, /catch \{ \/\* Theme still works for this session\. \*\/ \}/);
});

test('global navigation exposes an accessible theme toggle', () => {
  const source = read('../src/components/Layout.jsx');
  assert.match(source, /className="iconbtn theme-toggle"/);
  assert.match(source, /aria-label=\{theme==='dark'\?'Switch to light mode':'Switch to dark mode'\}/);
  assert.match(source, /aria-pressed=\{theme==='dark'\}/);
  assert.match(source, /hysmart-theme-change/);
});

test('Settings and global toggle share the same theme state', () => {
  const source = read('../src/pages/Settings.jsx');
  assert.match(source, /getTheme\(\)/);
  assert.match(source, /toggleTheme\(\)/);
  assert.match(source, /hysmart-theme-change/);
});

test('theme stylesheet provides semantic aliases and dark-mode surfaces', () => {
  const css = read('../src/styles.css');
  for (const token of ['--text:', '--surface:', '--surface-2:', '--border:', '--primary:', '--focus-ring:']) {
    assert.ok(css.includes(token), `missing semantic token ${token}`);
  }
  for (const selector of ['[data-theme="dark"] .modalcard', '[data-theme="dark"] .company-menu', '[data-theme="dark"] .erp-tabs button', '[data-theme="dark"] .btn.primary', '@media (prefers-reduced-motion: reduce)']) {
    assert.ok(css.includes(selector), `missing theme coverage: ${selector}`);
  }
});
