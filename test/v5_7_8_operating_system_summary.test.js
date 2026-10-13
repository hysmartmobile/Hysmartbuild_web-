import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../src/services/operatingSystemService.js'), 'utf8');

test('today computes and passes its summary into roleView', () => {
  assert.match(source, /const summary=\{projects:p\.length,[^;]+\};/);
  assert.match(source, /this\.roleView\(role,\{tower,revenue,projects:p,summary,alerts/);
});

test('roleView safely handles optional Control Tower metrics and summary values', () => {
  assert.match(source, /d\.tower\?\.portfolio\?\.summary\?\.red/);
  assert.match(source, /d\.summary\?\.moneyAtRisk/);
  assert.match(source, /d\.summary\?\.unbilled/);
});
