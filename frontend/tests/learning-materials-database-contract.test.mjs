import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const exists = (relative) => existsSync(join(root, relative));

const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
const families = ['tenses', 'modals', 'passive', 'conditionals', 'word-order', 'questions', 'negation', 'clauses', 'articles', 'countability', 'determiners', 'pronouns', 'gerunds', 'infinitives', 'participles', 'reported-speech', 'relative-clauses', 'conjunctions', 'prepositions', 'comparison'];

test('database learning seed covers the 20-family five-level matrix', () => {
  assert.ok(exists('backend/internal/learningseed/catalog.json'), 'catalog seed should exist');
  assert.ok(exists('backend/internal/learningseed/lessons.json'), 'lesson seed should exist');
  const catalog = JSON.parse(read('backend/internal/learningseed/catalog.json'));
  assert.equal(catalog.subject.id, 'english');
  assert.equal(catalog.category.id, 'grammar');
  assert.equal(catalog.topicFamilies.length, 20);
  assert.deepEqual(catalog.topicFamilies.map((family) => family.id), families);
  assert.equal(catalog.matrix.length, 100);
  assert.deepEqual([...new Set(catalog.matrix.map((cell) => cell.level))].sort((a, b) => levels.indexOf(a) - levels.indexOf(b)), levels);
  assert.equal(new Set(catalog.matrix.map((cell) => `${cell.topicId}:${cell.level}`)).size, 100);
  assert.ok(catalog.matrix.some((cell) => cell.topicId === 'passive' && cell.level === 'A1' && cell.coverageMode === 'awareness'));
});

test('published database lessons retain existing IDs and satisfy the content floor', () => {
  const catalog = JSON.parse(read('backend/internal/learningseed/catalog.json'));
  const lessons = JSON.parse(read('backend/internal/learningseed/lessons.json'));
  const published = catalog.matrix.filter((cell) => cell.published);
  const existingIds = ['present-simple-vs-continuous', 'present-perfect-vs-past-simple', 'conditionals-zero-first-second', 'emphasis-cleft-inversion-auxiliaries'];
  for (const id of existingIds) assert.ok(lessons[id], `${id} should be seeded`);
  assert.equal(published.length, 99, 'A1, A2, B1, B2, and C1 taught batches should be published');
  assert.equal(published.filter((cell) => cell.level === 'A2').length, 20, 'A2 should cover every matrix family including the retained tense lesson');
  assert.equal(published.filter((cell) => cell.level === 'B1').length, 20, 'B1 should cover every matrix family including retained lessons');
  assert.equal(published.filter((cell) => cell.level === 'B2').length, 20, 'B2 should cover every matrix family');
  assert.equal(published.filter((cell) => cell.level === 'C1').length, 20, 'C1 should cover every matrix family including the retained word-order lesson');
  for (const cell of published) {
    const lesson = lessons[cell.id];
    assert.ok(lesson, `${cell.id} should have lesson content`);
    assert.ok(Array.isArray(lesson.rules) && lesson.rules.length > 0, `${cell.id} needs rules`);
    assert.ok(lesson.rules.every((rule) => typeof rule.pattern === 'string' && rule.pattern.length > 0), `${cell.id} needs rule patterns`);
    assert.equal(lesson.sequence, cell.sequence, `${cell.id} sequence must mirror catalogue`);
    assert.equal(lesson.title, cell.title, `${cell.id} title must mirror catalogue`);
    assert.ok(Array.isArray(lesson.examples) && lesson.examples.length >= 5, `${cell.id} needs five examples`);
    assert.ok(Array.isArray(lesson.commonMistakes), `${cell.id} needs common mistakes`);
    assert.ok(Array.isArray(lesson.practice) && lesson.practice.length > 0, `${cell.id} needs practice`);
    assert.ok(Array.isArray(lesson.quiz) && lesson.quiz.length > 0, `${cell.id} needs a quiz`);
  }
  for (const id of existingIds) assert.ok(catalog.matrix.find((cell) => cell.id === id).contentVersion >= 2, `${id} should use upgraded content version`);
});

test('learning materials runtime contract uses PostgreSQL APIs and keeps journal endpoints separate', () => {
  const api = read('frontend/src/api.ts');
  const content = read('frontend/src/learning-content.ts');
  const materials = read('frontend/src/learning-materials.ts');
  const main = read('frontend/src/main.ts');
  const backendApi = read('backend/internal/api/api.go');
  const schema = read('backend/internal/store/schema.sql');
  assert.match(api, /learningMaterials/);
  assert.match(api, /learningMaterialProgress/);
  assert.match(content, /cache|API|LearningMaterial/i);
  assert.doesNotMatch(content, /import .*content\/learning/);
  assert.match(materials, /loading|error|review|progress|published/i);
  assert.match(main, /learningMaterials/);
  assert.match(backendApi, /learning-materials/);
  assert.match(schema, /learning_materials/);
  assert.match(schema, /learning_topic_progress/);
  assert.match(schema, /schema_migrations[\s\S]*17/);
  assert.match(read('backend/Makefile'), /seed-learning/);
});
