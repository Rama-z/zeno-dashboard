import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const read = (name) => fs.readFileSync(path.join(src, name), 'utf8');
const styles = read('styles.css');
const lifestyle = read('lifestyle.css');
const learningMaterials = read('learning-materials.css');
const workoutMaterials = read('workout-materials.css');
const auth = read('auth.css');
const main = read('main.ts');
const index = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

const themeBlocks = [...styles.matchAll(/(:root(?:\[data-theme='light'\]|\s*,\s*:root\[data-theme='dark'\])?)\s*\{([\s\S]*?)\n\s*\}/g)].map((match) => match[2]);
const darkTheme = themeBlocks.find((block) => block.includes('--background:#07091A')) ?? '';
const lightTheme = themeBlocks.find((block) => block.includes('--background:#F6F9FC')) ?? '';

const glassRoles = [
  '--ambient-primary',
  '--ambient-secondary',
  '--ambient-support',
  '--glass-surface-low',
  '--glass-surface-medium',
  '--glass-surface-high',
  '--glass-surface-interactive',
  '--glass-border',
  '--glass-border-strong',
  '--glass-highlight',
  '--glass-blur-shell',
  '--glass-blur-overlay',
  '--radius-control',
  '--radius-card',
  '--radius-shell',
  '--radius-overlay',
  '--shadow-card',
  '--shadow-raised',
  '--shadow-overlay',
  '--shadow-accent',
];

test('Nebula Glass roles exist in both dark and light theme tokens', () => {
  assert.ok(darkTheme, 'dark theme token block must exist');
  assert.ok(lightTheme, 'light theme token block must exist');
  for (const role of glassRoles) {
    assert.match(darkTheme, new RegExp(`${role.replaceAll('-', '\\-')}\\s*:`), `${role} missing from dark theme`);
    assert.match(lightTheme, new RegExp(`${role.replaceAll('-', '\\-')}\\s*:`), `${role} missing from light theme`);
  }
});

test('Nebula ambience and surface hierarchy are centralized in dashboard CSS', () => {
  assert.match(styles, /body\s*\{[^}]*background:[^}]*var\(--background\)/s);
  assert.match(styles, /\.zeno-dashboard::before|\.zeno-dashboard::after|body::before|body::after/);
  assert.match(styles, /--glass-surface-(low|medium|high|interactive)/);
  assert.match(styles, /\.zeno-dashboard \.learning-form button/);
  assert.match(styles, /\.zeno-dashboard \.period-filter\.selected/);
  assert.match(styles, /\.zeno-dashboard \.entry-status\.info\s*\{[^{}]*color:\s*var\(--info\)/s);
  assert.match(styles, /\.zeno-dashboard \.api-status\.connected\s*\{[^{}]*background:\s*var\(--success-bg\)/s);
  const finalSelectedRule = styles.match(/\.zeno-dashboard \.period-filter\.selected,\s*\.zeno-dashboard \.filter\.selected\s*\{([^{}]*)\}/s)?.[1] ?? '';
  assert.match(finalSelectedRule, /color:\s*var\(--primary\)/);
  assert.match(styles, /\.zeno-dashboard[^{}]*\{[^{}]*(?:backdrop-filter|-webkit-backdrop-filter)/s);
  assert.match(styles, /@supports(?:\s+not)?\s*\([^)]*backdrop-filter/);
  assert.match(styles, /prefers-reduced-transparency\s*:\s*reduce/);
  const reducedTransparencyIndex = styles.lastIndexOf('@media (prefers-reduced-transparency: reduce)');
  const responsiveIndex = styles.lastIndexOf('@media (max-width: 800px)');
  assert.ok(reducedTransparencyIndex > responsiveIndex, 'reduced transparency must win after responsive overrides');
  assert.match(styles, /\.delete-popover\s*\{\s*transform:\s*translate\(-100%,-100%\)/s);
});

test('Nebula keeps blur off ordinary cards and limits it to shell or overlay selectors', () => {
  const blurBlocks = [...styles.matchAll(/([^{}]+)\{[^{}]*(?:backdrop-filter|-webkit-backdrop-filter)[^{}]*\}/g)].map((match) => match[1]);
  assert.ok(blurBlocks.length > 0, 'at least one intentional glass blur must exist');
  assert.ok(blurBlocks.every((selector) => /sidebar|topbar|popover|overlay|dialog|backdrop|orbit-trigger|focus-mode/i.test(selector)), `unexpected blur selector: ${blurBlocks.join(' | ')}`);
  assert.doesNotMatch(lifestyle, /\.lifestyle-panel[^{}]*backdrop-filter|\.journal-card[^{}]*backdrop-filter|\.spending-summary-card[^{}]*backdrop-filter/s);
  assert.doesNotMatch(learningMaterials, /\.learning-material-card[^{}]*backdrop-filter/s);
  assert.doesNotMatch(workoutMaterials, /\.workout-material-card[^{}]*backdrop-filter/s);
});

test('Nebula preserves focus, reduced motion, and semantic status contracts', () => {
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion\s*:\s*reduce/);
  assert.match(styles, /--success\s*:/);
  assert.match(styles, /--warning\s*:/);
  assert.match(styles, /--danger\s*:/);
  assert.match(styles, /--info\s*:/);
  assert.match(lifestyle, /:focus-visible/);
  assert.match(learningMaterials, /:focus-visible/);
  assert.match(workoutMaterials, /:focus-visible/);
  assert.match(auth, /prefers-reduced-motion\s*:\s*reduce|:focus-visible/);
});

test('Nebula aligns browser chrome with the dashboard canvas', () => {
  assert.match(index, /<meta name="theme-color" content="#07091A"/i);
  assert.match(main, /theme-color[^\n]*theme === 'light' \? '#F6F9FC' : '#07091A'/);
});
