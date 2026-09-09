import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8').catch(() => '');

test('dashboard redesign keeps functionality while replacing generic shell patterns', async () => {
  const [main, styles, lifestyle, auth, appStyles, packageJson] = await Promise.all([
    read('src/main.ts'),
    read('src/styles.css'),
    read('src/lifestyle.css'),
    read('src/auth.css'),
    read('src/app-styles.ts'),
    read('package.json'),
  ]);

  assert.match(main, /class="shell zeno-dashboard/, 'dashboard needs a scoped redesigned shell');
  assert.match(main, /class="skip-link" href="#dashboard-content"/, 'dashboard needs keyboard skip navigation');
  assert.match(main, /id="dashboard-content"/, 'dashboard content needs a skip-link target');
  assert.doesNotMatch(main, /<aside class="sidebar"/, 'dashboard must not retain a layout sidebar');
  assert.match(main, /class="orbit-trigger"/, 'dashboard must expose the Orbit Command trigger');
  assert.match(main, /data-orbit-segment/, 'dashboard must expose destinations as radial segment buttons');
  assert.match(main, /aria-current=/, 'Orbit destinations must expose the active page with aria-current');
  assert.match(main, /data-global-search/, 'topbar search action must be functional rather than decorative');
  assert.match(main, /metric-card featured/, 'overview metrics must have an intentional asymmetric hierarchy');
  assert.match(main, /ph ph-/, 'dashboard icons must use the Phosphor family');
  assert.doesNotMatch(main.replace(/<svg class="orbit-shape"[\s\S]*?<\/svg>/g, ''), /<svg\b/, 'dashboard must not keep hand-rolled SVG icons');

  assert.match(packageJson, /"@phosphor-icons\/web"/, 'Phosphor web icons dependency is missing');
  assert.match(appStyles, /@phosphor-icons\/web/, 'dashboard style chunk must load Phosphor icons');
  assert.doesNotMatch(appStyles, /@fontsource\/inter/, 'dashboard must not load Inter');
  assert.doesNotMatch(`${styles}\n${lifestyle}\n${auth}`, /\bInter\b/, 'dashboard CSS must use the Zeno typography stack instead of Inter');

  assert.match(styles, /--orbit-size:/, 'Orbit geometry token is missing');
  assert.match(styles, /\.zeno-dashboard \.metrics\s*\{[^}]*grid-template-columns:\s*repeat\(12/s, 'metrics must use an asymmetric twelve-column grid');
  assert.match(styles, /\.orbit-trigger\s*\{[^}]*min-height:\s*54px/s, 'floating navigation must keep a generous touch target');
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'dashboard motion needs a reduced-motion fallback');
});
