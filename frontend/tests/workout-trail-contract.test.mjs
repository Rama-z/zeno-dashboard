import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const readIfPresent = (relative) => existsSync(join(root, relative)) ? read(relative) : '';

test('Workout Trail owns a session movement set contract without rewriting legacy results', () => {
  const api = read('src/api.ts');
  const model = read('../backend/internal/model/model.go');
  const schema = read('../backend/internal/store/schema.sql');

  assert.match(api, /type WorkoutSessionStatus = 'planned' \| 'in_progress' \| 'completed' \| 'partial' \| 'skipped'/);
  assert.match(api, /type WorkoutExerciseType = 'strength' \| 'bodyweight' \| 'cardio' \| 'mobility' \| 'interval'/);
  assert.match(api, /actual: WorkoutSetActual \| null/);
  assert.match(model, /type WorkoutSession struct/);
  assert.match(model, /Movements\s+\[\]WorkoutMovement/);
  assert.match(model, /Actual\s+map\[string\]any/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workout_sessions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workout_movements/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workout_sets/);
  assert.match(schema, /legacy_workout_entry_id/);
  assert.match(schema, /actual JSONB/);
  assert.match(schema, /INSERT INTO workout_sessions[\s\S]*FROM workout_entries/);
  assert.doesNotMatch(schema, /actual[^\n]*jsonb_build_object[^\n]*(reps|sets|duration)/i, 'legacy targets must not become actual results');
});

test('planner exposes weekly trail, multiple sessions, contextual actions, library, and accessible reordering', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  const css = readIfPresent('src/workout-trail.css');

  assert.match(ui, /Workout Trail/);
  assert.match(ui, /data-workout-week-prev/);
  assert.match(ui, /data-workout-week-next/);
  assert.match(ui, /data-workout-month-toggle/);
  assert.match(ui, /Buat sesi pertama/);
  assert.match(ui, /Gunakan template/);
  assert.match(ui, /Jadwalkan istirahat/);
  assert.match(ui, /Pustaka gerakan/);
  assert.match(ui, /data-workout-move-up/);
  assert.match(ui, /data-workout-move-down/);
  assert.match(ui, /Mulai sesi|Lanjutkan|Lihat hasil/);
  assert.match(ui, /duplicateWorkoutPlan/);
  assert.match(ui, /actual:\s*null/);
  assert.match(css, /workout-week-strip/);
  assert.match(css, /workout-trail-line/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('adaptive exercise editor renders only fields for the selected exercise type', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /renderAdaptiveTargetFields/);
  assert.match(ui, /strength/);
  assert.match(ui, /bodyweight/);
  assert.match(ui, /cardio/);
  assert.match(ui, /mobility/);
  assert.match(ui, /interval/);
  assert.match(ui, /weightBasis/);
  assert.match(ui, /per_dumbbell|total/);
  assert.match(ui, /inputmode="decimal"/);
  assert.match(ui, /actualWeight/);
  assert.match(ui, /actualReps/);
});

test('mobility scheduling preserves the requested set count in target and generated sets', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /if \(draft\.exerciseType === 'mobility'\) \{\s*const setCount = integer\(draft\.setCount\);\s*return \{ target: compactRecord\(\{ setCount,/);
  assert.match(ui, /return \{ target: compactRecord\(\{ setCount,[^\n]+\}\), setCount \};/);
});

test('Workout touch controls keep a 44px interaction area at narrow viewports', () => {
  const css = readIfPresent('src/workout-trail.css');
  assert.match(css, /\.trail-actions button\{[^}]*width:44px[^}]*min-height:44px[^}]*flex:0 0 44px/);
  assert.match(css, /\.trail-grip\{[^}]*width:44px/);
  assert.match(css, /\.set-tools button,\.set-tools label\{[^}]*min-height:44px/);
  assert.match(css, /\.set-row-actions button\{[^}]*min-height:44px/);
  assert.match(css, /\.recent-movements button\{[^}]*min-height:44px/);
});

test('localized decimal set fields preserve comma drafts and expose inline validation errors', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  const css = readIfPresent('src/workout-trail.css');

  assert.match(ui, /function localizedNumber/);
  assert.match(ui, /replace\(',', '\.'\)/);
  assert.match(ui, /const decimal = 'type="text" inputmode="decimal" data-local-decimal'/);
  assert.match(ui, /type="text"[^>]*data-local-decimal/);
  assert.match(ui, /class="set-input-error"/);
  assert.match(ui, /function movementDraftError/);
  assert.match(ui, /function visibleSetInput/);
  assert.match(ui, /button\.dataset\.workoutAddMovement[^\n]*movementFormError = null/);
  assert.match(ui, /button\.dataset\.workoutEditMovement[^\n]*movementFormError = null/);
  assert.match(ui, /button\.dataset\.workoutLibrary[^\n]*movementFormError = null/);
  assert.match(ui, /button\.dataset\.workoutRecent[^\n]*movementFormError = null/);
  assert.match(ui, /class="panel-form-error"/);
  assert.match(ui, /Target beban \(\$\{escapeHtml\(draft\.weightUnit\)\}\)/);
  assert.match(ui, /Jarak \(opsional, \$\{escapeHtml\(draft\.distanceUnit\)\}\)/);
  assert.match(ui, /role="alert"/);
  assert.match(ui, /aria-invalid=/);
  assert.match(ui, /aria-describedby=/);
  assert.match(css, /--workout-focus:var\(--accent\)/);
  assert.match(css, /outline:2px solid var\(--workout-focus\)/);
  assert.match(css, /:root\[data-theme='light'\] \.workout-shell\{/);
  assert.match(css, /:root\[data-theme='light'\] \.focus-mobile-set\{[^}]*background:#fff/);
  assert.match(css, /:root\[data-theme='light'\] \.mobile-set-inputs input/);
  assert.match(css, /\.set-input-error/);
});

test('Focus Mode separates targets and actuals, persists timers, and supports partial completion', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /Focus Mode/);
  assert.match(ui, /Gunakan target/);
  assert.match(ui, /Salin set sebelumnya/);
  assert.match(ui, /Simpan set/);
  assert.match(ui, /Lewati set/);
  assert.match(ui, /Batalkan selesai/);
  assert.match(ui, /Tambah set/);
  assert.match(ui, /Jeda sesi/);
  assert.match(ui, /Lanjut sesi/);
  assert.match(ui, /Tambah 15 dtk/);
  assert.match(ui, /Lewati istirahat/);
  assert.match(ui, /Simpan sebagai sebagian selesai/);
  assert.match(ui, /Tandai sisa dilewati/);
  assert.match(ui, /restTimerEndsAt/);
  assert.match(ui, /Date\.now\(\)/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /Menyimpan|Tersimpan|Coba lagi/);
});

test('failed set save keeps the draft until persistence succeeds', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.doesNotMatch(trail, /setDrafts\.delete\(set\.id\);\s*void persistSession/);
  assert.match(trail, /void persistSession\(next, options, \(\) => setDrafts\.delete\(set\.id\)\)/);
});

test('ending a paused workout settles the active pause before clearing pausedAt', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /function settleSessionPause/);
  assert.match(trail, /settleSessionPause\(session\)/);
  assert.doesNotMatch(trail, /endedAt: new Date\(\)\.toISOString\(\), pausedAt: undefined/);
});

test('session saves serialize through the queue instead of dropping concurrent mutations', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /SerializedSessionSaveQueue/);
  assert.match(trail, /saveQueue\.enqueue\(next\.id/);
  assert.match(trail, /const setSaveBusy = saveState === 'saving'/);
  assert.match(trail, /aria-busy="\$\{setSaveBusy\}"/);
  assert.doesNotMatch(trail, /if \(saveState === 'saving'\) return;[\s\S]{0,120}const \{ session, movement, set \} = findSetContext/);
});

test('failed save retry drains the queue instead of wedging behind the failed head', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /saveQueue\.retryFailed\(\)/);
});

test('session conflict discards the wedged queue and clears stale retry before refreshing server state', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /saveQueue\.discard\(id\);\s*retrySave = null;/);
});

test('stale session conflict refreshes from server instead of silently overwriting', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /error instanceof ApiError && error\.status === 409/);
  assert.match(trail, /syncWorkoutTrailData\(\)/);
  assert.match(trail, /Sesi sudah berubah di perangkat lain/);
});

test('rest day persists atomically as skipped in a single create request', () => {
  const trail = readIfPresent('src/workout-trail.ts');
  assert.match(trail, /status: 'skipped', estimatedMinutes: 0, pausedSeconds: 0, location: '', note: 'Hari pemulihan terjadwal', movements: \[\]/);
  assert.doesNotMatch(trail, /created\.status = 'skipped'; return api\.updateWorkoutSession/);
});

test('Workout history and templates use actual valid data and plan-only duplication', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /Riwayat/);
  assert.match(ui, /data-workout-history-date/);
  assert.match(ui, /data-workout-history-exercise/);
  assert.match(ui, /Simpan sebagai template/);
  assert.match(ui, /Ulangi sesi/);
  assert.match(ui, /volumeFromActualSets/);
  assert.match(ui, /set\.status === 'completed'/);
  assert.match(ui, /set\.actual/);
  assert.match(ui, /resetWorkoutActuals/);
});

test('previous result requires matching exercise, unit, and weight basis', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /function comparablePreviousMovement/);
  assert.match(ui, /candidate\.exerciseType !== current\.exerciseType/);
  assert.match(ui, /candidate\.target\.weightUnit[^\n]*current\.target\.weightUnit/);
  assert.match(ui, /candidate\.target\.weightBasis[^\n]*current\.target\.weightBasis/);
  assert.match(ui, /comparablePreviousMovement\(candidate, movement\)/);
});

test('summary details include only sets with recorded actual results', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /function recordedWorkoutSets/);
  assert.match(ui, /set\.status === 'completed' && Boolean\(set\.actual\)/);
  assert.match(ui, /const recordedMovements = session\.movements[\s\S]*recordedSets/);
  assert.match(ui, /recordedMovements\.map/);
  assert.match(ui, /Belum ada hasil aktual yang tercatat/);
});

test('volume uses finite nonnegative comparable actuals and labels their unit basis', () => {
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(ui, /function workoutVolume/);
  assert.match(ui, /Number\.isFinite\(set\.actual\.weight\)/);
  assert.match(ui, /Number\.isFinite\(set\.actual\.reps\)/);
  assert.match(ui, /set\.actual\.weightUnit[^\n]*unit/);
  assert.match(ui, /set\.actual\.weightBasis[^\n]*basis/);
  assert.match(ui, /volume !== null/);
  assert.match(ui, /volume\.unit/);
  assert.match(ui, /volume\.basis/);
});

test('Petal Cluster docks away from every critical Workout control', () => {
  const main = read('src/main.ts');
  assert.match(main, /data-workout-save-set/);
  assert.match(main, /data-workout-retry/);
  assert.match(main, /\.rest-timer\.visible/);
  assert.match(main, /\.end-actions button/);
  assert.match(main, /workoutCriticalControls/);
});

test('existing route and Petal Cluster remain the only navigation system', () => {
  const route = read('src/app-route.ts');
  const orbit = read('src/orbit-navigation.ts');
  const ui = readIfPresent('src/workout-trail.ts');
  assert.match(route, /workout:\s*'\/workout'/);
  assert.match(orbit, /route:\s*'\/workout'/);
  assert.doesNotMatch(ui, /bottom-nav|mobile-bottom-navigation|Beranda[\s\S]*Profil/);
});
