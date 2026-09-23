import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conf = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');

test('Learning file uploads have a scoped body size and transfer timeout through Nginx', () => {
  const materialRoute = conf.match(/location\s+~\s+\^[^\n]*learning-modules[^\n]*materials[^\n]*\$?\s*\{([^}]+)\}/);
  assert.ok(materialRoute, 'missing material-specific proxy route');
  const block = materialRoute[1];
  assert.match(block, /client_max_body_size\s+10[1-9]m\s*;/);
  assert.match(block, /proxy_request_buffering\s+off\s*;/);
  assert.match(block, /proxy_read_timeout\s+(?:[9][0-9][0-9]|[1-9][0-9]{3})s\s*;/);
  assert.match(block, /proxy_send_timeout\s+(?:[9][0-9][0-9]|[1-9][0-9]{3})s\s*;/);
});
