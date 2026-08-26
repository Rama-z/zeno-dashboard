import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const readIfPresent = (relative) => existsSync(join(root, relative)) ? read(relative) : '';

const manifestPath = 'src/content/workout/mobility/index.json';
const movementIds = [
  '90-90-hip-switch',
  'knee-to-wall-ankle-mobilization',
  'half-kneeling-hip-flexor-mobilization',
  'open-book-thoracic-rotation',
  'shoulder-cars',
  'deep-squat-pry',
];

test('workout material registry contains six validated Mobility movements', () => {
  assert.ok(existsSync(join(root, manifestPath)), 'Mobility manifest should exist');
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.category.id, 'mobility');
  assert.equal(manifest.movements.length, 6);
  assert.deepEqual(manifest.movements.map((movement) => movement.id), movementIds);
  for (const movement of manifest.movements) {
    const file = `src/content/workout/mobility/${movement.file.replace('./', '')}`;
    assert.ok(existsSync(join(root, file)), `${movement.id} JSON should exist`);
    const content = JSON.parse(read(file));
    assert.equal(content.id, movement.id);
    assert.equal(content.category, 'mobility');
    assert.ok(content.name);
    assert.ok(content.shortDescription);
    assert.ok(Array.isArray(content.equipment));
    assert.ok(Array.isArray(content.bodyAreas) && content.bodyAreas.length > 0);
    assert.ok(content.primaryTarget);
    assert.ok(content.recommendation?.text);
    assert.ok(Array.isArray(content.steps) && content.steps.length > 0);
    assert.ok(Array.isArray(content.cues) && content.cues.length > 0);
  }
});

test('workout material routes stay separate from Learning routes and map to Workout', () => {
  const routes = readIfPresent('src/app-route.ts');
  assert.match(routes, /workout-material-categories/);
  assert.match(routes, /workout-material-list/);
  assert.match(routes, /workout-material-detail/);
  assert.match(routes, /\/workout\/materials/);
  assert.match(routes, /pageForRoute[\s\S]*workout/);

  const main = readIfPresent('src/main.ts');
  assert.match(main, /renderWorkoutMaterials/);
  assert.match(main, /bindWorkoutMaterialEvents/);
  assert.match(main, /isWorkoutMaterialsRoute/);
  assert.match(main, /if \(isLearningRoute\(route\)\) bindLearningMaterialsEvents/);
  assert.match(main, /if \(isWorkoutMaterialsRoute\(route\)\) bindWorkoutMaterialEvents/);
});

test('scheduling keeps a lean immutable material provenance contract', () => {
  const api = readIfPresent('src/api.ts');
  const lifestyle = readIfPresent('src/lifestyle.ts');
  const model = readIfPresent('../backend/internal/model/model.go');
  const schema = readIfPresent('../backend/internal/store/schema.sql');
  const store = readIfPresent('../backend/internal/store/postgres.go');
  const handler = readIfPresent('../backend/internal/api/api.go');
  const openapi = readIfPresent('../backend/internal/api/openapi.yaml');

  assert.match(api, /export type WorkoutInput/);
  assert.match(api, /materialId\??: string/);
  assert.match(lifestyle, /hermes-monitor-workouts-v1/);
  assert.match(lifestyle, /scheduleWorkout/);
  assert.match(model, /MaterialID\s+string.*json:"materialId,omitempty"/);
  assert.match(schema, /material_id VARCHAR\(120\) NULL/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS material_id VARCHAR\(120\)/);
  assert.match(store, /material_id/);
  assert.match(handler, /materialId/);
  assert.match(openapi, /materialId/);
  assert.doesNotMatch(schema, /workout_materials/);
});

test('workout material UI exposes safe detail, date scheduling, and responsive styling', () => {
  const ui = readIfPresent('src/workout-materials.ts');
  const css = readIfPresent('src/workout-materials.css');
  assert.ok(existsSync(join(src, 'workout-content.ts')));
  assert.ok(existsSync(join(src, 'workout-materials.ts')));
  assert.ok(existsSync(join(src, 'workout-materials.css')));
  assert.match(ui, /How to perform/);
  assert.match(ui, /Technique cues/);
  assert.match(ui, /Safety/);
  assert.match(ui, /Add to Workout/);
  assert.match(ui, /type="date"/);
  assert.match(ui, /escapeHtml/);
  assert.match(ui, /materialId/);
  assert.match(css, /workout-material/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /44px/);
});
