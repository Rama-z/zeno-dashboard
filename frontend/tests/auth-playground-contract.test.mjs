import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth page uses the scoped Zeno Playground visual language in both themes', async () => {
  const [styles, auth] = await Promise.all([read('src/auth.css'), read('src/auth.ts')]);

  assert.match(styles, /\/\* Zeno Playground auth/);
  assert.match(styles, /\.auth-shell\s*\{[^}]*--auth-bg:\s*#F5F4ED[^}]*--auth-text:\s*#202820[^}]*--auth-lime:\s*#DAF978[^}]*--auth-accent:\s*#335EEA/s);
  assert.match(styles, /:root\[data-theme=['"]dark['"]\]\s+\.auth-shell/);
  assert.match(styles, /\.auth-shell\s+\.auth-card\s*\{[^}]*border-radius:\s*24px[^}]*background:\s*var\(--auth-surface\)/s);
  assert.match(styles, /\.auth-shell\s+\.auth-submit\s*\{[^}]*border-radius:\s*999px[^}]*background:\s*var\(--auth-lime\)[^}]*color:\s*#202820/s);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*\.auth-shell\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(auth, /src="\/zeno-logo-96\.webp"/);
  assert.doesNotMatch(auth, /src="\/zeno-logo\.png"/);
});
