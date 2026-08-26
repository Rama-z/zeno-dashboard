import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

test('font profile preference is exposed in Appearance with Compact as the default', () => {
  const main = read('src/main.ts');
  const styles = read('src/styles.css');
  assert.match(main, /fontProfile/);
  assert.match(main, /['"]compact['"]/);
  assert.match(main, /hermes-monitor-font-profile/);
  assert.match(main, /Compact/);
  assert.match(main, /Standard/);
  assert.match(main, /Expanded/);
  assert.match(main, /data-font-profile/);
  assert.match(main, /dataset\.fontProfile/);
  assert.match(styles, /data-font-profile=['"]compact['"]/);
  assert.match(styles, /data-font-profile=['"]standard['"]/);
  assert.match(styles, /data-font-profile=['"]expanded['"]/);
  const compact = styles.match(/:root\[data-font-profile=['"]compact['"]\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const standard = styles.match(/:root\[data-font-profile=['"]standard['"]\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const expanded = styles.match(/:root\[data-font-profile=['"]expanded['"]\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(compact, /--zeno-type-body-size:\s*13px/);
  assert.match(compact, /--zeno-type-page-title-size:\s*clamp\(33px,3\.35vw,47px\)/);
  assert.match(standard, /--zeno-type-body-size:\s*14px/);
  assert.match(expanded, /--zeno-type-body-size:\s*15px/);
  assert.match(styles, /--zeno-type-display-size:/);
  assert.match(styles, /--zeno-type-code-size:/);
});

test('font profile controls are keyboard-accessible and do not add a dependency', () => {
  const main = read('src/main.ts');
  const auth = read('src/auth.ts');
  const appStyles = read('src/app-styles.ts');
  assert.match(main, /role="radiogroup"/);
  assert.match(main, /type="radio"/);
  assert.match(main, /aria-label="Font profile"/);
  assert.match(main, /font profile/i);
  assert.match(auth, /data-font-profile/);
  assert.match(auth, /role="radiogroup"/);
  assert.match(appStyles, /auth\.css[\s\S]*font-profiles\.css/);
  assert.doesNotMatch(read('package.json'), /fontawesome|google-fonts|typography/i);
  assert.ok(existsSync(join(root, 'src/styles.css')));
});

test('semantic typography roles cover every visual stylesheet and lesson surface', () => {
  const files = [
    'src/styles.css',
    'src/lifestyle.css',
    'src/learning-materials.css',
    'src/auth.css',
    'src/landing.css',
    'src/font-profiles.css',
  ];
  const css = Object.fromEntries(files.map((file) => [file, read(file)]));
  const combined = Object.values(css).join('\\n');
  const roles = [
    'display',
    'page-title',
    'section-title',
    'card-title',
    'body',
    'body-small',
    'control',
    'label',
    'meta',
    'code',
  ];
  for (const role of roles) assert.ok(combined.includes(`--zeno-type-${role}-size`), `missing ${role} token`);
  const styles = css['src/styles.css'];
  for (const profile of ['compact', 'standard', 'expanded']) {
    const start = styles.indexOf(`:root[data-font-profile='${profile}']`);
    assert.notEqual(start, -1, `missing ${profile} profile`);
    const end = styles.indexOf('}', start);
    assert.ok(styles.slice(start, end).includes('--zeno-type-body-size:'), `missing ${profile} body token`);
  }
  for (const file of files) assert.ok(css[file].includes('var(--zeno-type-'), `missing semantic usage in ${file}`);

  const requiredRoleRules = [
    ['src/styles.css', '.zeno-dashboard .metric-card > span', 'label', 'dashboard metric labels'],
    ['src/styles.css', '.zeno-dashboard .entry-title', 'card-title', 'session titles'],
    ['src/styles.css', '.zeno-dashboard .delete-popover', 'body', 'delete popovers'],
    ['src/styles.css', '.zeno-dashboard .settings-save', 'control', 'workspace save control'],
    ['src/styles.css', '.zeno-dashboard .learning-category', 'meta', 'learning categories'],
    ['src/styles.css', '.font-profile-option span', 'control', 'font profile labels'],
    ['src/styles.css', '.font-profile-option small', 'meta', 'font profile descriptions'],
    ['src/lifestyle.css', '.markdown-body h2', 'section-title', 'markdown headings'],
    ['src/lifestyle.css', '.workout-copy h3', 'card-title', 'workout titles'],
    ['src/lifestyle.css', '.spending-copy h3', 'card-title', 'spending titles'],
    ['src/lifestyle.css', '.spending-day-head strong', 'meta', 'spending day totals'],
    ['src/learning-materials.css', '.lesson-hero h1', 'page-title', 'lesson hero'],
    ['src/learning-materials.css', '.concept-card p', 'body', 'lesson copy'],
    ['src/learning-materials.css', '.example-card q', 'body', 'lesson examples'],
    ['src/learning-materials.css', '.learning-topic-toolbar label', 'label', 'topic filter labels'],
    ['src/learning-materials.css', '.mastery-score strong', 'display', 'mastery score'],
    ['src/auth.css', '.auth-card-heading h1', 'section-title', 'auth heading'],
    ['src/auth.css', '.auth-card input', 'control', 'auth controls'],
    ['src/auth.css', '.profile-identity h2', 'card-title', 'profile identity'],
    ['src/auth.css', '.activity-audit-meta span', 'meta', 'activity metadata'],
    ['src/landing.css', '.landing-hero h1', 'display', 'landing hero'],
    ['src/landing.css', '.landing-hero-copy > p:not(.landing-eyebrow)', 'body', 'landing body'],
    ['src/landing.css', '.landing-marquee-track span', 'body-small', 'landing marquee'],
  ];
  for (const [file, selector, role, label] of requiredRoleRules) {
    const source = css[file];
    const start = source.lastIndexOf(selector);
    assert.notEqual(start, -1, `missing ${label} selector`);
    const end = source.indexOf('}', start);
    assert.ok(source.slice(start, end).includes(`var(--zeno-type-${role}-`), `missing ${label} token mapping`);
  }
});

test('font profile remains device-local and is not submitted with workspace settings', () => {
  const main = read('src/main.ts');
  assert.ok(main.includes('localStorage.setItem(fontProfileStorageKey, fontProfile)'));
  assert.ok(main.includes('localStorage.getItem(fontProfileStorageKey)'));
  assert.ok(main.includes("value === 'compact' || value === 'standard' || value === 'expanded'"));
  assert.doesNotMatch(main, /updateSettings\([^)]*fontProfile/);
  assert.doesNotMatch(read('src/api.ts'), /fontProfile|font_profile/);
});
