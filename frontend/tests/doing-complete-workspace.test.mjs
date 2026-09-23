import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const module = readFileSync(new URL('../src/doing-complete.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app-route.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/doing-complete.css', import.meta.url), 'utf8');

test('Complete Doing uses a typed 23-attribute DTO and the existing authenticated API', () => {
  for (const key of ['title','area','project','type','status','priority','urgency','impact','effort','energy','focus','duration','context','device','location','timePreference','difficulty','resistance','due','nextAction','definitionOfDone','plannedDate','notes']) {
    assert.match(api, new RegExp(`\\b${key}:`), key);
    assert.match(module, new RegExp(`\\b${key}\\b`), key);
  }
  assert.match(api, /definitionOfDone: DoingCriterion\[\]/);
  assert.match(api, /done: boolean/);
  assert.match(api, /plannedDate: string \| null/);
  assert.match(api, /due: string \| null/);
  assert.match(module, /api\.doingTasks\(\)/);
  assert.match(module, /api\.createDoingTask\(/);
  assert.match(module, /api\.updateDoingTask\(/);
  assert.match(main, /from '\.\/doing-complete'/);
});

test('Complete Doing has list, detail and editor with filters, week and checklist', () => {
  for (const marker of ['data-doing-new','data-doing-query','data-doing-status-filter','data-doing-priority-filter','data-doing-project-filter','data-doing-day','data-doing-all-dates','data-doing-open','data-doing-back','data-doing-edit','data-doing-check','data-doing-check-add','data-doing-check-remove','data-doing-cancel','data-doing-submit']) assert.match(module, new RegExp(marker), marker);
  assert.match(main, /navigate: navigateTo/);
  assert.match(route, /kind: 'doing-detail'/);
  assert.match(module, /requestAnimationFrame/);
  assert.match(module, /aria-live="polite"/);
  assert.doesNotMatch(module, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.match(css, /@media\s*\(max-width: 680px\)/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /font-family:\s*var\(--font/);
  assert.match(module, /api\.doing\(\)/, 'Overview must continue reading legacy entries');
  assert.match(module, /legacyMetadata/, 'legacy fields remain visible read-only');
  assert.match(module, /duration:\{minMinutes:Number\(data\.get\('durationMinMinutes'\)\), maxMinutes:Number\(data\.get\('durationMaxMinutes'\)\)\}/);
  assert.doesNotMatch(module, /!task\.due/, 'Due remains nullable');
  assert.match(module, /data-doing-retry/, 'a failed API load must offer retry');
  assert.match(module, /loadError/, 'failed API load must not masquerade as an empty list');
  assert.match(module, /dc-loading/, 'initial load must not show zero tasks prematurely');
  assert.match(module, /refreshLegacyOverview/, 'workspace writes must refresh Overview data');
  assert.match(module, /Array\.from\(task\.notes\)\.length\s*>\s*20000/);
  assert.match(module, /Array\.from\(item\.text\)\.length\s*>\s*500/);
  assert.match(module, /task\.definitionOfDone\.length\s*>\s*100/);
});
