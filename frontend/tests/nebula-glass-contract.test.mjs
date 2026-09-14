import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const read = (name) => fs.readFileSync(path.join(src, name), 'utf8');
const styles = read('styles.css');
const playground = read('playground-dashboard.css');
const lifestyle = read('lifestyle.css');
const learningMaterials = read('learning-materials.css');
const workoutMaterials = read('workout-materials.css');
const auth = read('auth.css');
const appStyles = read('app-styles.ts');
const main = read('main.ts');
const index = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

const requiredTokens = [
  '--background', '--background-secondary', '--surface', '--surface-secondary',
  '--surface-hover', '--border', '--border-subtle', '--text-primary',
  '--text-secondary', '--text-muted', '--primary', '--primary-hover',
  '--accent', '--success', '--warning', '--danger', '--info',
  '--radius-control', '--radius-card', '--radius-shell', '--radius-overlay',
  '--shadow-card', '--shadow-raised', '--shadow-overlay', '--shadow-accent',
];

test('Playground semantic tokens exist for both dashboard themes', () => {
  assert.match(styles, /:root,:root\[data-theme='dark'\]\s*\{/);
  assert.match(styles, /:root\[data-theme='light'\]\s*\{/);
  assert.match(styles, /--background:#202820/);
  assert.match(styles, /--surface:#2A342A/);
  assert.match(styles, /--text-primary:#F5F4ED/);
  assert.match(styles, /--primary:#DAF978/);
  assert.match(styles, /--accent:#93ACFF/);
  assert.match(styles, /--background:#F5F4ED/);
  assert.match(styles, /--surface:#FFFEF8/);
  assert.match(styles, /--text-primary:#202820/);
  assert.match(styles, /--accent:#335EEA/);
  for (const token of requiredTokens) assert.match(styles, new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`), `${token} missing`);
});

test('Playground uses solid warm surfaces and central semantic states', () => {
  assert.match(appStyles, /playground-dashboard\.css/);
  assert.match(playground, /\.zeno-dashboard\s*\{[\s\S]*background:\s*var\(--background\)/);
  assert.match(playground, /\.zeno-dashboard \.topbar\s*\{[\s\S]*background:\s*var\(--surface\)/);
  assert.match(playground, /\.zeno-dashboard \.metric-card\.accent[\s\S]*background:\s*var\(--primary\)/);
  assert.match(playground, /\.zeno-dashboard :is\([\s\S]*background:\s*var\(--surface\)/);
  assert.match(playground, /\.zeno-dashboard \.filter\.selected/);
  assert.match(playground, /\.zeno-dashboard \.calendar-day\.selected/);
  assert.match(playground, /\.zeno-dashboard \.api-status\.connected[\s\S]*var\(--success-bg\)/);
  assert.match(playground, /\.delete-popover\s*\{[\s\S]*background:\s*var\(--surface\)/);
  assert.doesNotMatch(playground, /backdrop-filter:\s*blur/);
});

test('Aurora Ribbon is a shared, non-interactive, edge-framed dashboard layer', () => {
  assert.match(main, /class="aurora-ribbon" aria-hidden="true"/);
  assert.match(main, /<svg viewBox="0 0 1600 1000" preserveAspectRatio="none"/);
  for (const token of ['--aurora-lime', '--aurora-blue', '--aurora-cyan', '--aurora-center', '--aurora-core-opacity', '--aurora-cloud-opacity', '--aurora-core-blur', '--aurora-cloud-blur']) {
    assert.match(playground, new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`), `${token} missing`);
  }
  assert.match(playground, /\.zeno-dashboard \.aurora-ribbon\s*\{[\s\S]*position:\s*fixed[\s\S]*pointer-events:\s*none/);
  assert.match(playground, /\.zeno-dashboard \.aurora-ribbon svg\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*100%/);
  assert.match(playground, /\.zeno-dashboard \.aurora-ribbon-core\s*\{[\s\S]*filter:\s*blur\(var\(--aurora-core-blur\)\)/);
  assert.match(playground, /\.zeno-dashboard \.aurora-ribbon-cloud\s*\{[\s\S]*filter:\s*blur\(var\(--aurora-cloud-blur\)\)/);
  assert.match(playground, /\.zeno-dashboard \.aurora-ribbon::after[\s\S]*var\(--aurora-center\)/);
  assert.match(playground, /\.zeno-dashboard > \.main[\s\S]*z-index:\s*1/);
  assert.doesNotMatch(playground, /\.aurora-ribbon[^{]*\{[^}]*backdrop-filter/);
  assert.match(playground, /@media \(max-width: 640px\)[\s\S]*\.zeno-dashboard \.aurora-ribbon[\s\S]*--aurora-core-opacity/);
  assert.match(playground, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.zeno-dashboard \.aurora-ribbon/);
  assert.match(playground, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*\.zeno-dashboard \.aurora-ribbon/);
});

test('Playground removes glass behavior from ordinary feature cards without weakening status states', () => {
  for (const css of [playground, lifestyle, learningMaterials, workoutMaterials]) {
    assert.doesNotMatch(css, /\.lifestyle-panel[^{}]*backdrop-filter|\.journal-card[^{}]*backdrop-filter|\.spending-summary-card[^{}]*backdrop-filter|\.learning-material-card[^{}]*backdrop-filter|\.workout-material-card[^{}]*backdrop-filter/s);
  }
  assert.match(playground, /prefers-reduced-transparency\s*:\s*reduce/);
  assert.match(styles, /--success\s*:/);
  assert.match(styles, /--warning\s*:/);
  assert.match(styles, /--danger\s*:/);
  assert.match(styles, /--info\s*:/);
});

test('Playground preserves focus, reduced motion, and one-time dashboard entry motion', () => {
  assert.match(playground, /:focus-visible/);
  assert.match(playground, /prefers-reduced-motion\s*:\s*reduce/);
  assert.match(playground, /data-playground-entry='enter'/);
  assert.match(main, /data-playground-entry=/);
  assert.match(main, /dashboardEntryPending = false/);
  assert.match(lifestyle, /:focus-visible/);
  assert.match(learningMaterials, /:focus-visible/);
  assert.match(workoutMaterials, /:focus-visible/);
  assert.match(auth, /prefers-reduced-motion\s*:\s*reduce|:focus-visible/);
});

test('Playground aligns browser chrome with the dashboard canvas', () => {
  assert.match(index, /<meta name="theme-color" content="#202820"/i);
  assert.match(main, /theme-color[^\n]*theme === 'light' \? '#F5F4ED' : '#202820'/);
});
