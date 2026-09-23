import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const root = new URL('../src/', import.meta.url);
const source = (name) => readFileSync(new URL(name, root), 'utf8');
async function load(name) {
  const js = ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
test('manual routes resolve without replacing legacy journal/material routes', async () => {
  const { resolveAppRoute, appRoutePath, pageForRoute } = await load('app-route.ts');
  assert.equal(resolveAppRoute('/learning').kind, 'page');
  assert.equal(resolveAppRoute('/learning/materials/english').kind, 'learning-categories');
  assert.equal(resolveAppRoute('/learning/modules').kind, 'learning-modules');
  assert.equal(resolveAppRoute('/learning/modules/new').kind, 'learning-module-editor');
  assert.deepEqual(resolveAppRoute('/learning/modules/a%20b'), { kind: 'learning-module-detail', id: 'a b' });
  assert.equal(resolveAppRoute('/learning/sessions/new').kind, 'learning-session-editor');
  assert.deepEqual(resolveAppRoute('/learning/sessions/a%20b'), { kind: 'learning-session-detail', id: 'a b' });
  assert.equal(appRoutePath({ kind: 'learning-module-detail', id: 'a b' }), '/learning/modules/a%20b');
  assert.equal(pageForRoute(resolveAppRoute('/learning/sessions/new')), 'learning');
});
test('manual cache resets at the authenticated account boundary', () => {
  const main = source('main.ts');
  const ui = source('learning-manual.ts');
  assert.match(ui, /resetLearningManualData/);
  assert.match(main, /resetLearningManualData\(currentUser\?\.id/);
});

test('manual API uses authenticated JSON and multipart upload without JSON content type', () => {
  const api = source('api.ts');
  assert.match(api, /learningModules:.*request|learningModules\s*:\s*\(\).*request/s);
  assert.match(api, /learningSessions:.*request|learningSessions\s*:\s*\(\).*request/s);
  assert.match(api, /new FormData\(\)/);
  assert.match(api, /form\.append\('file', file\)/);
  assert.match(api, /credentials: 'same-origin'/);
  assert.match(api, /X-CSRF-Token/);
  assert.match(api, /response\.status === 401/);
});
test('existing materials are editable through owner-scoped material mutations', () => {
  const api = source('api.ts'); const ui = source('learning-manual.ts');
  assert.match(api, /updateLearningModuleMaterial/);
  assert.match(api, /deleteLearningModuleMaterial/);
  assert.match(ui, /api\.updateLearningModuleMaterial/);
  assert.match(ui, /api\.deleteLearningModuleMaterial/);
});

test('manual surface has navigation, persistent forms and completion gate', () => {
  const main = source('main.ts');
  const ui = source('learning-manual.ts');
  assert.match(main, /data-learning-modules/);
  assert.match(main, /renderLearningManual/);
  for (const field of ['practicePlan','plannedItems','actualItems','reflection','confusion','nextStep','reviewDate','targetMinutes']) assert.match(ui, new RegExp(field));
  assert.match(ui, /reflection\.trim\(\)/);
  assert.match(ui, /api\.createLearningModuleMaterial/);
  assert.match(ui, /api\.uploadLearningModuleFile/);
  assert.doesNotMatch(ui, /api\.createLearningModuleFile/);
  assert.match(ui, /type="file"/);
  assert.match(ui, /role="alert"/);
  assert.doesNotMatch(ui, /window\.alert\(|localStorage|seed-/);
});
