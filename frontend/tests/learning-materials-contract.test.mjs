import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

const backendRoot = join(root, '..', 'backend', 'internal', 'learningseed');
const catalog = JSON.parse(readFileSync(join(backendRoot, 'catalog.json'), 'utf8'));
const lessons = JSON.parse(readFileSync(join(backendRoot, 'lessons.json'), 'utf8'));

 test('learning material runtime seed covers the matrix and upgraded lessons', () => {
  assert.ok(existsSync(join(backendRoot, 'seed.go')));
  assert.equal(catalog.topicFamilies.length, 20);
  assert.equal(catalog.matrix.length, 100);
  assert.deepEqual([...new Set(catalog.matrix.map((cell) => cell.level))].sort(), ['A1', 'A2', 'B1', 'B2', 'C1']);
  const published = catalog.matrix.filter((cell) => cell.published);
  assert.equal(published.length, 99);
  assert.equal(Object.keys(lessons).length, published.length);
  for (const cell of published) {
    const lesson = lessons[cell.id];
    assert.ok(lesson, `${cell.id} content is present`);
    assert.ok(lesson.examples.length >= 5, `${cell.id} has five examples`);
    assert.ok(lesson.rules.length >= 1);
    assert.ok(lesson.commonMistakes.length >= 1);
    assert.ok(lesson.practice.length >= 1);
    assert.ok(lesson.quiz.length >= 1);
    assert.ok(lesson.quiz.every((item) => Number.isInteger(item.objectiveIndex)));
  }
  for (const id of ['present-simple-vs-continuous', 'present-perfect-vs-past-simple', 'conditionals-zero-first-second', 'emphasis-cleft-inversion-auxiliaries']) {
    assert.ok(catalog.matrix.find((cell) => cell.id === id).contentVersion >= 2);
  }
  assert.equal(catalog.matrix.find((cell) => cell.id === 'passive-a1-awareness').coverageMode, 'awareness');
  assert.ok(catalog.supportingLessons.some((lesson) => lesson.id === 'advanced-integration-review'));
});

test('learning material routes are explicit and nested under Learning', () => {
  assert.ok(existsSync(join(root, 'src', 'app-route.ts')));
  const routes = read('src/app-route.ts');
  assert.match(routes, /learning-subjects/);
  assert.match(routes, /learning-categories/);
  assert.match(routes, /grammar-topics/);
  assert.match(routes, /grammar-lesson/);
  assert.match(routes, /not-found/);
  assert.match(routes, /isLearningMaterialRoute/);
  assert.match(routes, /\/learning\/materials/);

  const main = read('src/main.ts');
  assert.match(main, /resolveAppRoute/);
  assert.match(main, /Learning Material List/);
  assert.match(main, /ensureLearningMaterialData/);
  assert.match(main, /hermes-monitor-learning-v1/);
  assert.match(main, /isLearningRoute/);
  assert.match(read('src/app-styles.ts'), /learning-materials\.css/);
  assert.doesNotMatch(read('package.json'), /react|vue|react-router|mdx/i);
});

test('learning material client uses API loading and saves validated progress without exposing answers early', () => {
  const content = read('src/learning-content.ts');
  assert.match(content, /api\.learningMaterials/);
  assert.match(content, /api\.learningMaterial/);
  assert.doesNotMatch(content, /index\.json|resolveJsonModule/);

  const api = read('src/api.ts');
  assert.match(api, /learningMaterials/);
  assert.match(api, /learningMaterialProgress/);
  assert.match(api, /LearningMaterialProgressInput/);

  const ui = read('src/learning-materials.ts');
  assert.match(ui, /Concept/);
  assert.match(ui, /Rules and patterns/);
  assert.match(ui, /Explanation/);
  assert.match(ui, /Examples/);
  assert.match(ui, /Practice/);
  assert.match(ui, /Mastery check/);
  assert.match(ui, /Review/);
  assert.match(ui, /data-learning-quiz-submit/);
  assert.match(ui, /persistProgress/);
  assert.match(ui, /progressSaving/);
  assert.match(ui, /answer/);
  assert.match(ui, /feedback|explanation/i);
  assert.match(ui, /escapeHtml/);
  assert.doesNotMatch(ui, /prototype mastery threshold reached/i);

  const css = read('src/learning-materials.css');
  assert.match(css, /learning-material-loading/);
  assert.match(css, /learning-progress-error/);
  assert.match(css, /prefers-reduced-motion/);
});
