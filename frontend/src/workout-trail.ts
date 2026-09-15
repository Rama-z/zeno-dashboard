import {
  api,
  ApiError,
  type WorkoutExerciseType,
  type WorkoutInput,
  type WorkoutMovementInput,
  type WorkoutMovementResponse,
  type WorkoutSessionInput,
  type WorkoutSessionResponse,
  type WorkoutSetActual,
  type WorkoutSetResponse,
  type WorkoutSetTarget,
  type WorkoutTemplateResponse,
} from './api';
import { SerializedSessionSaveQueue } from './session-save-queue';
import { mobilityMaterials, type WorkoutMaterial } from './workout-content';

export type WorkoutTrailBindOptions = {
  rerender: () => void;
  onStatus: (online: boolean, error: string) => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
type WorkoutView = 'plan' | 'history';
type PanelKind = 'session' | 'movement' | 'end' | null;
type SetDraft = { weight?: string; reps?: string; duration?: string; distance?: string; rpe?: string };
type MovementDraft = {
  name: string;
  exerciseType: WorkoutExerciseType;
  materialId?: string;
  equipment: string[];
  muscleGroups: string[];
  note: string;
  setCount: string;
  repsMin: string;
  repsMax: string;
  weight: string;
  weightUnit: 'kg' | 'lb';
  weightBasis: 'total' | 'per_dumbbell';
  durationMinutes: string;
  addedWeight: string;
  assistanceWeight: string;
  distance: string;
  distanceUnit: 'km' | 'mi';
  incline: string;
  resistance: string;
  side: 'both' | 'left' | 'right' | 'alternating';
  rounds: string;
  workSeconds: string;
  intervalRestSeconds: string;
  relatedMovement: string;
  restSeconds: string;
};

const sessionCacheKey = 'zeno-workout-sessions-v2';
const templateCacheKey = 'zeno-workout-templates-v1';
const restPreferenceKey = 'zeno-workout-rest-timer-enabled';
const today = localDateKey(new Date());
let sessions = loadCache<WorkoutSessionResponse[]>(sessionCacheKey, []);
let templates = loadCache<WorkoutTemplateResponse[]>(templateCacheKey, []);
let selectedDate = dateFromLocation();
let visibleWeek = mondayOf(parseLocalDate(selectedDate));
let view: WorkoutView = viewFromLocation();
let focusSessionId = new URLSearchParams(window.location.search).get('session') ?? '';
let activeMovementId = new URLSearchParams(window.location.search).get('movement') ?? '';
let panel: PanelKind = null;
let panelSessionId = '';
let editingMovementId = '';
let editingSessionId = '';
let pendingDeleteSessionId = '';
let pendingDeleteMovementId = '';
let monthOpen = false;
let movementDraft = emptyMovementDraft();
let movementFormError: { field: string; message: string } | null = null;
let saveState: SaveState = 'idle';
let saveError = '';
let retrySave: (() => void) | null = null;
let restTimerEnabled = localStorage.getItem(restPreferenceKey) !== 'false';
let setDrafts = new Map<string, SetDraft>();
let setValidationErrors = new Map<string, string>();
let historyDate = '';
let historyExercise = '';
let clockTimer: number | null = null;
let draggedMovementId = '';

function loadCache<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveCache() {
  localStorage.setItem(sessionCacheKey, JSON.stringify(sessions));
  localStorage.setItem(templateCacheKey, JSON.stringify(templates));
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));
}

function icon(name: string) {
  return `<span class="ph ph-${name}" aria-hidden="true"></span>`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function validLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseLocalDate(value);
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === value;
}

function dateFromLocation() {
  const value = new URLSearchParams(window.location.search).get('date') ?? '';
  return validLocalDate(value) ? value : today;
}

function viewFromLocation(): WorkoutView {
  return new URLSearchParams(window.location.search).get('view') === 'history' ? 'history' : 'plan';
}

function mondayOf(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(12, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function updateRoute(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  url.pathname = '/workout';
  Object.entries(changes).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
  history.replaceState({ page: 'workout' }, '', `${url.pathname}${url.search}`);
}

function setSelectedDate(value: string) {
  if (!validLocalDate(value)) return;
  selectedDate = value;
  visibleWeek = mondayOf(parseLocalDate(value));
  updateRoute({ date: value });
}

function emptyMovementDraft(type: WorkoutExerciseType = 'strength'): MovementDraft {
  return {
    name: '', exerciseType: type, equipment: [], muscleGroups: [], note: '', setCount: '3', repsMin: '8', repsMax: '10',
    weight: '', weightUnit: 'kg', weightBasis: 'total', durationMinutes: '10', addedWeight: '', assistanceWeight: '', distance: '',
    distanceUnit: 'km', incline: '', resistance: '', side: 'both', rounds: '4', workSeconds: '30', intervalRestSeconds: '30',
    relatedMovement: '', restSeconds: '60',
  };
}

function draftFromMovement(movement: WorkoutMovementResponse): MovementDraft {
  const target = movement.target;
  return {
    ...emptyMovementDraft(movement.exerciseType),
    name: movement.name,
    materialId: movement.materialId,
    equipment: [...movement.equipment],
    muscleGroups: [...movement.muscleGroups],
    note: movement.note,
    setCount: String(target.setCount ?? (movement.sets.length || 1)),
    repsMin: String(target.repsMin ?? target.reps ?? ''),
    repsMax: String(target.repsMax ?? target.reps ?? ''),
    weight: String(target.weight ?? ''),
    weightUnit: target.weightUnit === 'lb' ? 'lb' : 'kg',
    weightBasis: target.weightBasis === 'per_dumbbell' ? 'per_dumbbell' : 'total',
    durationMinutes: String(target.durationMinutes ?? ''),
    addedWeight: String(target.addedWeight ?? ''),
    assistanceWeight: String(target.assistanceWeight ?? ''),
    distance: String(target.distance ?? ''),
    distanceUnit: target.distanceUnit === 'mi' ? 'mi' : 'km',
    incline: String(target.incline ?? ''),
    resistance: String(target.resistance ?? ''),
    side: ['left', 'right', 'alternating'].includes(String(target.side)) ? target.side as MovementDraft['side'] : 'both',
    rounds: String(target.rounds ?? (movement.sets.length || 1)),
    workSeconds: String(target.workSeconds ?? ''),
    intervalRestSeconds: String(target.intervalRestSeconds ?? ''),
    relatedMovement: String(target.relatedMovement ?? ''),
    restSeconds: String(movement.restSeconds ?? ''),
  };
}

function localizedNumber(value: string): { value?: number; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const normalized = trimmed.replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return { error: 'Gunakan angka non-negatif dengan koma atau titik desimal.' };
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0
    ? { value: parsed }
    : { error: 'Gunakan angka non-negatif dengan koma atau titik desimal.' };
}

function optionalNumber(value: string): number | undefined {
  return localizedNumber(value).value;
}

function integer(value: string, fallback = 1) {
  const parsed = optionalNumber(value);
  return parsed === undefined ? fallback : Math.max(1, Math.round(parsed));
}

function compactRecord(values: Record<string, string | number | boolean | undefined>): WorkoutSetTarget {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== '')) as WorkoutSetTarget;
}

function targetAndSetCount(draft: MovementDraft): { target: WorkoutSetTarget; setCount: number } {
  if (draft.exerciseType === 'strength') {
    return { target: compactRecord({ setCount: integer(draft.setCount, 3), repsMin: optionalNumber(draft.repsMin), repsMax: optionalNumber(draft.repsMax), weight: optionalNumber(draft.weight), weightUnit: draft.weightUnit, weightBasis: draft.weightBasis }), setCount: integer(draft.setCount, 3) };
  }
  if (draft.exerciseType === 'bodyweight') {
    return { target: compactRecord({ setCount: integer(draft.setCount, 3), reps: optionalNumber(draft.repsMin), durationMinutes: optionalNumber(draft.durationMinutes), addedWeight: optionalNumber(draft.addedWeight), assistanceWeight: optionalNumber(draft.assistanceWeight), weightUnit: draft.weightUnit }), setCount: integer(draft.setCount, 3) };
  }
  if (draft.exerciseType === 'cardio') {
    return { target: compactRecord({ durationMinutes: optionalNumber(draft.durationMinutes), distance: optionalNumber(draft.distance), distanceUnit: draft.distanceUnit, incline: optionalNumber(draft.incline), resistance: optionalNumber(draft.resistance) }), setCount: 1 };
  }
  if (draft.exerciseType === 'mobility') {
    const setCount = integer(draft.setCount);
    return { target: compactRecord({ setCount, durationMinutes: optionalNumber(draft.durationMinutes), reps: optionalNumber(draft.repsMin), side: draft.side }), setCount };
  }
  return { target: compactRecord({ rounds: integer(draft.rounds, 4), workSeconds: optionalNumber(draft.workSeconds), intervalRestSeconds: optionalNumber(draft.intervalRestSeconds), relatedMovement: draft.relatedMovement }), setCount: integer(draft.rounds, 4) };
}

function movementFromDraft(draft: MovementDraft, existing?: WorkoutMovementResponse): WorkoutMovementResponse {
  const { target, setCount } = targetAndSetCount(draft);
  const sets = Array.from({ length: setCount }, (_, index): WorkoutSetResponse => {
    const previous = existing?.sets[index];
    return previous ? { ...previous, number: index + 1, target: cleanTarget(target) } : {
      id: crypto.randomUUID(), number: index + 1, target: { ...target }, actual: null, status: 'unrecorded',
    };
  });
  return {
    id: existing?.id ?? crypto.randomUUID(), sessionId: existing?.sessionId, materialId: draft.materialId, custom: !draft.materialId,
    name: draft.name.trim(), exerciseType: draft.exerciseType, position: existing?.position ?? 1, equipment: draft.equipment,
    muscleGroups: draft.muscleGroups, target, restSeconds: optionalNumber(draft.restSeconds), status: existing?.status ?? 'planned',
    note: draft.note.trim(), sets,
  };
}

function cleanTarget(target: WorkoutSetTarget) {
  return Object.fromEntries(Object.entries(target).filter(([, value]) => value !== undefined && value !== null && value !== '')) as WorkoutSetTarget;
}

export function resetWorkoutActuals(movements: WorkoutMovementResponse[]): WorkoutMovementInput[] {
  return movements.map((movement, index) => ({
    ...movement,
    id: undefined,
    sessionId: undefined,
    position: index + 1,
    status: 'planned',
    target: cleanTarget(movement.target),
    sets: movement.sets.map((set, setIndex) => ({ id: undefined, number: setIndex + 1, target: cleanTarget(set.target), actual: null, status: 'unrecorded', recordedAt: undefined, rpe: undefined })),
  }));
}

export function duplicateWorkoutPlan(session: WorkoutSessionResponse, date: string): WorkoutSessionInput {
  return {
    name: `${session.name} (salinan)`, date, localTime: session.localTime, timezone: session.timezone || 'Asia/Jakarta', status: 'planned',
    estimatedMinutes: session.estimatedMinutes, startedAt: undefined, pausedAt: undefined, pausedSeconds: 0, endedAt: undefined,
    restTimerEndsAt: undefined, restTimerPausedRemainingSeconds: undefined, location: session.location, note: session.note,
    movements: resetWorkoutActuals(session.movements),
  };
}

function workoutVolume(movement: WorkoutMovementResponse) {
  const unit = String(movement.target.weightUnit ?? 'kg');
  const basis = String(movement.target.weightBasis ?? 'total');
  const sets = recordedWorkoutSets(movement).filter((set) => {
    if (!set.actual || typeof set.actual.weight !== 'number' || typeof set.actual.reps !== 'number') return false;
    if (!Number.isFinite(set.actual.weight) || !Number.isFinite(set.actual.reps) || set.actual.weight < 0 || set.actual.reps < 0) return false;
    if (String(set.actual.weightUnit ?? unit) !== unit) return false;
    return String(set.actual.weightBasis ?? basis) === basis;
  });
  if (!sets.length) return null;
  return {
    value: sets.reduce((total, set) => total + Number(set.actual!.weight) * Number(set.actual!.reps), 0),
    unit,
    basis,
    setCount: sets.length,
  };
}

export function volumeFromActualSets(movement: WorkoutMovementResponse) {
  return workoutVolume(movement)?.value ?? 0;
}

function sessionInput(session: WorkoutSessionResponse): WorkoutSessionResponse {
  return {
    ...session,
    movements: session.movements.map((movement, movementIndex) => ({
      ...movement, position: movementIndex + 1, target: cleanTarget(movement.target),
      sets: movement.sets.map((set, setIndex) => ({ ...set, number: setIndex + 1, target: cleanTarget(set.target), actual: set.actual ? cleanTarget(set.actual) : null })),
    })),
  };
}

export async function syncWorkoutTrailData() {
  const [sessionResponse, templateResponse] = await Promise.all([api.workoutSessions(), api.workoutTemplates()]);
  sessions = sessionResponse.sessions;
  templates = templateResponse.templates;
  saveCache();
}

export function syncWorkoutTrailRoute() {
  selectedDate = dateFromLocation();
  visibleWeek = mondayOf(parseLocalDate(selectedDate));
  view = viewFromLocation();
  const query = new URLSearchParams(window.location.search);
  focusSessionId = query.get('mode') === 'focus' || query.get('mode') === 'summary' ? query.get('session') ?? '' : '';
  activeMovementId = query.get('movement') ?? '';
  panel = null;
  pendingDeleteSessionId = '';
  pendingDeleteMovementId = '';
}

export function currentWorkoutTrailDate() {
  return selectedDate;
}

export function workoutOverviewSessions() {
  return sessions.map((session) => ({ ...session, movements: [...session.movements] }));
}

export async function scheduleWorkoutMaterial(input: WorkoutInput) {
  const material = mobilityMaterials.find((entry) => entry.id === input.materialId);
  const draft = emptyMovementDraft('mobility');
  draft.name = input.exercise;
  draft.materialId = input.materialId;
  draft.durationMinutes = input.durationMinutes ? String(input.durationMinutes) : '';
  draft.repsMin = input.reps ? String(input.reps) : '';
  draft.setCount = input.sets ? String(input.sets) : '1';
  draft.note = input.note;
  draft.equipment = material?.equipment ?? [];
  draft.muscleGroups = material?.bodyAreas ?? [];
  const movement = movementFromDraft(draft);
  const created = await api.createWorkoutSession({
    name: input.exercise, date: input.date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta', status: 'planned',
    estimatedMinutes: input.durationMinutes, pausedSeconds: 0, location: '', note: input.note,
    movements: [{ ...movement, id: undefined, sets: movement.sets.map((set) => ({ ...set, id: undefined })) }],
  });
  sessions = [created, ...sessions];
  setSelectedDate(created.date);
  saveCache();
}

function selectedSessions() {
  return sessions.filter((session) => session.date === selectedDate).sort((a, b) => (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.createdAt.localeCompare(b.createdAt));
}

function movementIcon(type: WorkoutExerciseType) {
  const names: Record<WorkoutExerciseType, string> = { strength: 'barbell', bodyweight: 'person-simple-run', cardio: 'heartbeat', mobility: 'person-simple-walk', interval: 'timer' };
  return icon(names[type]);
}

function statusLabel(status: WorkoutSessionResponse['status']) {
  return ({ planned: 'Terencana', in_progress: 'Berlangsung', completed: 'Selesai', partial: 'Sebagian selesai', skipped: 'Dilewati' })[status];
}

function movementStatusLabel(status: WorkoutMovementResponse['status']) {
  return ({ planned: 'Belum dimulai', in_progress: 'Sedang dikerjakan', completed: 'Selesai', skipped: 'Dilewati' })[status];
}

function targetSummary(movement: WorkoutMovementResponse) {
  const target = movement.target;
  const parts: string[] = [];
  if (target.setCount) parts.push(`${target.setCount} set`);
  if (target.repsMin && target.repsMax) parts.push(`${target.repsMin}-${target.repsMax} rep`);
  else if (target.reps) parts.push(`${target.reps} rep`);
  if (target.weight !== undefined) parts.push(`${target.weight} ${target.weightUnit ?? 'kg'}${target.weightBasis === 'per_dumbbell' ? ' / dumbbell' : ''}`);
  if (target.durationMinutes) parts.push(`${target.durationMinutes} menit`);
  if (target.distance) parts.push(`${target.distance} ${target.distanceUnit ?? 'km'}`);
  if (target.rounds) parts.push(`${target.rounds} ronde`);
  if (target.workSeconds) parts.push(`${target.workSeconds} dtk kerja`);
  return parts.length ? parts.join(' · ') : 'Target belum diatur';
}

function sessionDurationSeconds(session: WorkoutSessionResponse) {
  if (!session.startedAt) return 0;
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  let paused = session.pausedSeconds * 1000;
  if (session.pausedAt && !session.endedAt) paused += Math.max(0, Date.now() - new Date(session.pausedAt).getTime());
  return Math.max(0, Math.floor((end - new Date(session.startedAt).getTime() - paused) / 1000));
}

function settleSessionPause(session: WorkoutSessionResponse, now = Date.now()) {
  if (!session.pausedAt) return session;
  const pausedAt = new Date(session.pausedAt).getTime();
  const addedSeconds = Number.isFinite(pausedAt) ? Math.max(0, Math.floor((now - pausedAt) / 1000)) : 0;
  return { ...session, pausedAt: undefined, pausedSeconds: session.pausedSeconds + addedSeconds };
}

function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function renderWeekStrip() {
  const days = Array.from({ length: 7 }, (_, index) => addDays(visibleWeek, index));
  return `<section class="workout-week" aria-label="Pilih hari workout">
    <div class="workout-week-heading"><div><span>Workout Trail</span><strong>${escapeHtml(days[0].toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }))}</strong></div><div class="workout-week-actions">
      <button type="button" data-workout-week-prev aria-label="Minggu sebelumnya">${icon('caret-left')}</button>
      <button type="button" data-workout-today>Hari ini</button>
      <button type="button" data-workout-week-next aria-label="Minggu berikutnya">${icon('caret-right')}</button>
      <button type="button" data-workout-month-toggle aria-expanded="${monthOpen}">${icon('calendar-dots')} Kalender bulanan</button>
    </div></div>
    ${monthOpen ? `<div class="workout-month-popover"><label><span>Pilih tanggal</span><input type="date" data-workout-month-picker value="${selectedDate}" /></label></div>` : ''}
    <div class="workout-week-strip">${days.map((day) => {
      const key = localDateKey(day);
      const entries = sessions.filter((session) => session.date === key);
      const hasDone = entries.some((session) => session.status === 'completed' || session.status === 'partial');
      const hasPlan = entries.some((session) => session.status === 'planned' || session.status === 'in_progress');
      const isRest = entries.some((session) => session.status === 'skipped' && session.movements.length === 0);
      const marker = isRest ? `<span class="day-marker rest">${icon('moon')}</span>` : hasDone ? `<span class="day-marker done">${icon('check')}</span>` : hasPlan ? '<span class="day-marker planned"></span>' : '<span class="day-marker empty"></span>';
      return `<button type="button" class="workout-day ${key === selectedDate ? 'selected' : ''} ${key === today ? 'today' : ''}" data-workout-day="${key}" aria-pressed="${key === selectedDate}"><span>${day.toLocaleDateString('id-ID', { weekday: 'short' })}</span><strong>${day.getDate()}</strong>${marker}<small>${isRest ? 'Istirahat' : entries.length > 1 ? `${entries.length} sesi` : hasDone ? 'Selesai' : hasPlan ? 'Terencana' : key === today ? 'Hari ini' : 'Kosong'}</small></button>`;
    }).join('')}</div>
  </section>`;
}

function primarySessionAction(session: WorkoutSessionResponse) {
  if (session.status === 'completed' || session.status === 'partial') return `<button class="workout-primary" data-workout-summary="${session.id}">${icon('chart-line-up')} Lihat hasil</button>`;
  if (session.status === 'in_progress') return `<button class="workout-primary" data-workout-focus="${session.id}">${icon('play')} Lanjutkan</button>`;
  return `<button class="workout-primary" data-workout-start="${session.id}" ${session.movements.length ? '' : 'disabled title="Tambahkan gerakan sebelum memulai"'}>${icon('play')} Mulai sesi</button>`;
}

function renderTrailMovement(session: WorkoutSessionResponse, movement: WorkoutMovementResponse, index: number) {
  const complete = movement.status === 'completed';
  return `<li class="workout-trail-item ${movement.status}" draggable="true" data-workout-drag="${movement.id}">
    <div class="workout-trail-line" aria-hidden="true"></div>
    <button type="button" class="trail-grip" aria-label="Seret ${escapeHtml(movement.name)} untuk mengurutkan" title="Seret untuk mengurutkan">${icon('dots-six-vertical')}</button>
    <span class="trail-node">${complete ? icon('check') : movementIcon(movement.exerciseType)}<b>${String(index + 1).padStart(2, '0')}</b></span>
    <div class="trail-copy"><strong>${escapeHtml(movement.name)}</strong><span>${escapeHtml(targetSummary(movement))}</span><small>${escapeHtml(movementStatusLabel(movement.status))}</small></div>
    <div class="trail-actions">
      <button type="button" data-workout-move-up="${movement.id}" data-session="${session.id}" aria-label="Pindah ${escapeHtml(movement.name)} ke atas" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up')}</button>
      <button type="button" data-workout-move-down="${movement.id}" data-session="${session.id}" aria-label="Pindah ${escapeHtml(movement.name)} ke bawah" ${index === session.movements.length - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
      <button type="button" data-workout-edit-movement="${movement.id}" data-session="${session.id}" aria-label="Edit ${escapeHtml(movement.name)}">${icon('pencil-simple')}</button>
      <button type="button" data-workout-duplicate-movement="${movement.id}" data-session="${session.id}" aria-label="Duplikasi ${escapeHtml(movement.name)}">${icon('copy')}</button>
      <button type="button" class="danger" data-workout-delete-movement="${movement.id}" data-session="${session.id}" aria-label="Hapus ${escapeHtml(movement.name)}">${icon('trash')}</button>
    </div>
    ${pendingDeleteMovementId === movement.id ? `<div class="workout-inline-confirm" role="dialog" aria-label="Konfirmasi hapus gerakan"><span>Hapus gerakan ini? Hasil yang sudah dicatat ikut terhapus.</span><button type="button" class="danger" data-workout-delete-movement-confirm="${movement.id}" data-session="${session.id}">Hapus</button><button type="button" data-workout-cancel-delete>Batal</button></div>` : ''}
  </li>`;
}

function renderSessionCard(session: WorkoutSessionResponse) {
  const completed = session.movements.filter((movement) => movement.status === 'completed').length;
  const duration = session.startedAt ? `${formatClock(sessionDurationSeconds(session))} aktual` : `${session.estimatedMinutes || 0} menit estimasi`;
  return `<article class="workout-session-card ${session.status}" data-session-card="${session.id}">
    <header><div class="session-status ${session.status}">${icon(session.status === 'completed' ? 'check-circle' : session.status === 'in_progress' ? 'play-circle' : 'calendar-blank')} ${escapeHtml(statusLabel(session.status))}</div><div class="session-heading"><h2>${escapeHtml(session.name)}</h2><p>${session.movements.length} gerakan <span aria-hidden="true">·</span> ${escapeHtml(duration)}${session.localTime ? ` <span aria-hidden="true">·</span> ${escapeHtml(session.localTime)}` : ''}</p></div><div class="session-header-actions">${primarySessionAction(session)}<button type="button" data-workout-edit-session="${session.id}" aria-label="Edit sesi">${icon('pencil-simple')}</button><button type="button" data-workout-duplicate-session="${session.id}" aria-label="Duplikasi sesi">${icon('copy')}</button><button type="button" data-workout-save-template="${session.id}" aria-label="Simpan sebagai template">${icon('bookmark-simple')}</button><button type="button" class="danger" data-workout-delete-session="${session.id}" aria-label="Hapus sesi">${icon('trash')}</button></div></header>
    <div class="session-progress-copy"><span>${completed} dari ${session.movements.length} gerakan selesai</span>${session.note ? `<span>${escapeHtml(session.note)}</span>` : ''}</div>
    ${session.movements.length ? `<ol class="workout-trail-list">${session.movements.map((movement, index) => renderTrailMovement(session, movement, index)).join('')}</ol>` : `<div class="workout-session-empty"><p>Belum ada gerakan dalam sesi ini.</p></div>`}
    <button type="button" class="workout-add-movement" data-workout-add-movement="${session.id}">${icon('plus')} Tambah gerakan</button>
    ${pendingDeleteSessionId === session.id ? `<div class="workout-inline-confirm session-confirm" role="dialog" aria-label="Konfirmasi hapus sesi"><span>Hapus sesi ${escapeHtml(session.name)} beserta gerakan dan set-nya?</span><button type="button" class="danger" data-workout-delete-session-confirm="${session.id}">Hapus</button><button type="button" data-workout-cancel-delete>Batal</button></div>` : ''}
  </article>`;
}

function renderPlan() {
  const entries = selectedSessions();
  return `<div class="workout-plan-grid"><div class="workout-plan-main">
    <div class="workout-selected-heading"><div><span>Hari dipilih</span><h1>${escapeHtml(parseLocalDate(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }))}</h1><p>${entries.length ? `${entries.length} sesi dijadwalkan` : 'Belum ada sesi untuk hari ini'}</p></div><button type="button" class="workout-primary" data-workout-create-session>${icon('plus')} Buat sesi</button></div>
    ${entries.length ? `<div class="workout-session-list">${entries.map(renderSessionCard).join('')}</div>` : `<section class="workout-empty-state"><span>${icon('map-trifold')}</span><h2>Mulai trail latihanmu</h2><p>Buat rencana tanpa hasil fiktif. Target baru dianggap tercatat setelah kamu menyimpan set di Focus Mode.</p><div><button type="button" class="workout-primary" data-workout-create-session>Buat sesi pertama</button><button type="button" data-workout-open-templates>Gunakan template</button><button type="button" data-workout-rest-day>Jadwalkan istirahat</button></div></section>`}
  </div>${renderContextPanel()}</div>`;
}

function renderSessionForm() {
  const session = sessions.find((entry) => entry.id === editingSessionId);
  return `<aside class="workout-context-panel" aria-labelledby="workout-session-panel-title"><div class="panel-title"><div><span>${session ? 'Edit sesi' : 'Sesi baru'}</span><h2 id="workout-session-panel-title">${session ? escapeHtml(session.name) : 'Buat sesi workout'}</h2></div><button type="button" data-workout-close-panel aria-label="Tutup panel">${icon('x')}</button></div>
    <form data-workout-session-form="${session?.id ?? ''}"><label><span>Nama sesi</span><input name="name" maxlength="160" value="${escapeHtml(session?.name ?? '')}" placeholder="Contoh: Lower body" required /></label><label><span>Tanggal lokal</span><input type="date" name="date" value="${escapeHtml(session?.date ?? selectedDate)}" required /></label>
      ${session ? `<div class="form-row"><label><span>Jam (opsional)</span><input type="time" name="localTime" value="${escapeHtml(session.localTime ?? '')}" /></label><label><span>Estimasi menit</span><input type="number" inputmode="numeric" min="0" name="estimatedMinutes" value="${session.estimatedMinutes || ''}" /></label></div><label><span>Lokasi (opsional)</span><input name="location" maxlength="160" value="${escapeHtml(session.location)}" /></label><label><span>Catatan sesi (opsional)</span><textarea name="note" maxlength="2000" rows="3">${escapeHtml(session.note)}</textarea></label>` : '<p class="panel-helper">Nama dan tanggal saja sudah cukup. Detail lain bisa ditambahkan setelah sesi dibuat.</p>'}
      <button class="workout-primary panel-submit" type="submit">${session ? 'Simpan perubahan' : 'Buat sesi'}</button></form>
    ${!session && templates.length ? `<section class="template-picker"><h3>Gunakan template</h3>${templates.slice(0, 4).map((template) => `<button type="button" data-workout-use-template="${template.id}"><span>${icon('bookmark-simple')}</span><span><strong>${escapeHtml(template.name)}</strong><small>${template.movements.length} gerakan</small></span>${icon('caret-right')}</button>`).join('')}</section>` : ''}
  </aside>`;
}

function renderLibraryItem(material: WorkoutMaterial) {
  return `<button type="button" class="movement-library-item" data-workout-library="${material.id}" data-search="${escapeHtml(`${material.name} ${material.bodyAreas.join(' ')} mobility`.toLowerCase())}"><span>${movementIcon('mobility')}</span><span><strong>${escapeHtml(material.name)}</strong><small>Mobilitas <span aria-hidden="true">·</span> ${escapeHtml(material.bodyAreas.join(', '))}</small></span>${icon('plus')}</button>`;
}

export function renderAdaptiveTargetFields(draft: MovementDraft) {
  const decimal = 'type="text" inputmode="decimal" data-local-decimal';
  if (draft.exerciseType === 'strength') return `<div class="adaptive-fields"><div class="form-row three"><label><span>Jumlah set</span><input name="setCount" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.setCount)}" required /></label><label><span>Rep minimum</span><input name="repsMin" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.repsMin)}" /></label><label><span>Rep maksimum</span><input name="repsMax" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.repsMax)}" /></label></div><div class="form-row three"><label><span>Target beban (${escapeHtml(draft.weightUnit)})</span><input name="weight" ${decimal} value="${escapeHtml(draft.weight)}" /></label><label><span>Satuan</span><select name="weightUnit"><option value="kg" ${draft.weightUnit === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${draft.weightUnit === 'lb' ? 'selected' : ''}>lb</option></select></label><label><span>Basis beban</span><select name="weightBasis"><option value="total" ${draft.weightBasis === 'total' ? 'selected' : ''}>Total</option><option value="per_dumbbell" ${draft.weightBasis === 'per_dumbbell' ? 'selected' : ''}>Per dumbbell</option></select></label></div></div>`;
  if (draft.exerciseType === 'bodyweight') return `<div class="adaptive-fields"><div class="form-row"><label><span>Jumlah set</span><input name="setCount" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.setCount)}" required /></label><label><span>Repetisi (opsional)</span><input name="repsMin" type="number" inputmode="numeric" min="0" value="${escapeHtml(draft.repsMin)}" /></label></div><div class="form-row three"><label><span>Durasi menit (opsional)</span><input name="durationMinutes" ${decimal} value="${escapeHtml(draft.durationMinutes)}" /></label><label><span>Beban tambahan (${escapeHtml(draft.weightUnit)})</span><input name="addedWeight" ${decimal} value="${escapeHtml(draft.addedWeight)}" /></label><label><span>Bantuan beban (${escapeHtml(draft.weightUnit)})</span><input name="assistanceWeight" ${decimal} value="${escapeHtml(draft.assistanceWeight)}" /></label></div></div>`;
  if (draft.exerciseType === 'cardio') return `<div class="adaptive-fields"><div class="form-row"><label><span>Durasi menit</span><input name="durationMinutes" ${decimal} value="${escapeHtml(draft.durationMinutes)}" required /></label><label><span>Jarak (opsional, ${escapeHtml(draft.distanceUnit)})</span><input name="distance" ${decimal} value="${escapeHtml(draft.distance)}" /></label></div><div class="form-row three"><label><span>Satuan jarak</span><select name="distanceUnit"><option value="km" ${draft.distanceUnit === 'km' ? 'selected' : ''}>km</option><option value="mi" ${draft.distanceUnit === 'mi' ? 'selected' : ''}>mi</option></select></label><label><span>Incline (opsional, %)</span><input name="incline" ${decimal} value="${escapeHtml(draft.incline)}" /></label><label><span>Resistance (opsional, level)</span><input name="resistance" ${decimal} value="${escapeHtml(draft.resistance)}" /></label></div></div>`;
  if (draft.exerciseType === 'mobility') return `<div class="adaptive-fields"><div class="form-row three"><label><span>Durasi menit</span><input name="durationMinutes" ${decimal} value="${escapeHtml(draft.durationMinutes)}" /></label><label><span>Pengulangan (opsional)</span><input name="repsMin" type="number" inputmode="numeric" min="0" value="${escapeHtml(draft.repsMin)}" /></label><label><span>Sisi tubuh</span><select name="side"><option value="both" ${draft.side === 'both' ? 'selected' : ''}>Keduanya</option><option value="left" ${draft.side === 'left' ? 'selected' : ''}>Kiri</option><option value="right" ${draft.side === 'right' ? 'selected' : ''}>Kanan</option><option value="alternating" ${draft.side === 'alternating' ? 'selected' : ''}>Bergantian</option></select></label></div></div>`;
  return `<div class="adaptive-fields"><div class="form-row three"><label><span>Jumlah ronde</span><input name="rounds" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.rounds)}" required /></label><label><span>Durasi kerja (detik)</span><input name="workSeconds" type="number" inputmode="numeric" min="1" value="${escapeHtml(draft.workSeconds)}" required /></label><label><span>Durasi istirahat (detik)</span><input name="intervalRestSeconds" type="number" inputmode="numeric" min="0" value="${escapeHtml(draft.intervalRestSeconds)}" /></label></div><label><span>Gerakan terkait</span><input name="relatedMovement" value="${escapeHtml(draft.relatedMovement)}" placeholder="Contoh: Sprint" /></label></div>`;
}

function captureMovementDraft(form: HTMLFormElement) {
  const data = new FormData(form);
  movementDraft = {
    ...movementDraft,
    name: String(data.get('name') ?? movementDraft.name), exerciseType: String(data.get('exerciseType') ?? movementDraft.exerciseType) as WorkoutExerciseType,
    note: String(data.get('note') ?? ''), setCount: String(data.get('setCount') ?? movementDraft.setCount), repsMin: String(data.get('repsMin') ?? ''),
    repsMax: String(data.get('repsMax') ?? ''), weight: String(data.get('weight') ?? ''), weightUnit: String(data.get('weightUnit') ?? movementDraft.weightUnit) as MovementDraft['weightUnit'],
    weightBasis: String(data.get('weightBasis') ?? movementDraft.weightBasis) as MovementDraft['weightBasis'], durationMinutes: String(data.get('durationMinutes') ?? ''),
    addedWeight: String(data.get('addedWeight') ?? ''), assistanceWeight: String(data.get('assistanceWeight') ?? ''), distance: String(data.get('distance') ?? ''),
    distanceUnit: String(data.get('distanceUnit') ?? movementDraft.distanceUnit) as MovementDraft['distanceUnit'], incline: String(data.get('incline') ?? ''),
    resistance: String(data.get('resistance') ?? ''), side: String(data.get('side') ?? movementDraft.side) as MovementDraft['side'], rounds: String(data.get('rounds') ?? movementDraft.rounds),
    workSeconds: String(data.get('workSeconds') ?? ''), intervalRestSeconds: String(data.get('intervalRestSeconds') ?? ''), relatedMovement: String(data.get('relatedMovement') ?? ''),
    restSeconds: String(data.get('restSeconds') ?? ''),
  };
}

function movementDraftError(draft: MovementDraft): { field: string; message: string } | null {
  const decimalFields: Array<[string, string, string]> = draft.exerciseType === 'strength'
    ? [['weight', 'Target beban', draft.weight]]
    : draft.exerciseType === 'bodyweight'
      ? [['durationMinutes', 'Durasi', draft.durationMinutes], ['addedWeight', 'Beban tambahan', draft.addedWeight], ['assistanceWeight', 'Bantuan beban', draft.assistanceWeight]]
      : draft.exerciseType === 'cardio'
        ? [['durationMinutes', 'Durasi', draft.durationMinutes], ['distance', 'Jarak', draft.distance], ['incline', 'Incline', draft.incline], ['resistance', 'Resistance', draft.resistance]]
        : draft.exerciseType === 'mobility'
          ? [['durationMinutes', 'Durasi', draft.durationMinutes]]
          : [];
  for (const [field, label, value] of decimalFields) {
    if (value.trim() && localizedNumber(value).error) return { field, message: `${label} harus berupa angka non-negatif dengan koma atau titik desimal.` };
  }
  if (draft.exerciseType === 'cardio' && !draft.durationMinutes.trim()) return { field: 'durationMinutes', message: 'Durasi wajib diisi.' };
  return null;
}

function renderMovementForm() {
  const recent = [...new Set(sessions.flatMap((session) => session.movements.map((movement) => movement.name)))].slice(0, 4);
  return `<aside class="workout-context-panel movement-panel" aria-labelledby="workout-movement-panel-title"><div class="panel-title"><div><span>${editingMovementId ? 'Edit gerakan' : 'Tambah gerakan'}</span><h2 id="workout-movement-panel-title">Pustaka gerakan</h2></div><button type="button" data-workout-close-panel aria-label="Tutup panel">${icon('x')}</button></div>
    <label class="library-search"><span>Cari gerakan</span><div>${icon('magnifying-glass')}<input data-workout-library-search placeholder="Cari di pustaka gerakan" /></div></label>
    <div class="movement-library-list">${mobilityMaterials.map(renderLibraryItem).join('')}</div>
    ${recent.length ? `<div class="recent-movements"><span>Gerakan terbaru</span>${recent.map((name) => `<button type="button" data-workout-recent="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>` : ''}
    <div class="custom-divider"><span>atau buat gerakan custom</span></div>
    <form data-workout-movement-form><label><span>Nama gerakan</span><input name="name" maxlength="160" value="${escapeHtml(movementDraft.name)}" required /></label><label><span>Jenis latihan</span><select name="exerciseType" data-workout-exercise-type><option value="strength" ${movementDraft.exerciseType === 'strength' ? 'selected' : ''}>Beban</option><option value="bodyweight" ${movementDraft.exerciseType === 'bodyweight' ? 'selected' : ''}>Bodyweight</option><option value="cardio" ${movementDraft.exerciseType === 'cardio' ? 'selected' : ''}>Kardio</option><option value="mobility" ${movementDraft.exerciseType === 'mobility' ? 'selected' : ''}>Mobilitas</option><option value="interval" ${movementDraft.exerciseType === 'interval' ? 'selected' : ''}>Interval</option></select></label>
      ${renderAdaptiveTargetFields(movementDraft)}
      <label><span>Istirahat antarset (opsional, detik)</span><input name="restSeconds" type="number" inputmode="numeric" min="0" value="${escapeHtml(movementDraft.restSeconds)}" /></label><label><span>Catatan gerakan (opsional)</span><textarea name="note" rows="2" maxlength="2000">${escapeHtml(movementDraft.note)}</textarea></label>
      <p class="panel-helper">Field kosong tidak disimpan sebagai nol. Target tetap terpisah dari hasil aktual.</p>${movementFormError ? `<p class="panel-form-error" id="movement-form-error" role="alert">${icon('warning-circle')} ${escapeHtml(movementFormError.message)}</p>` : ''}<button class="workout-primary panel-submit" type="submit">${editingMovementId ? 'Simpan gerakan' : 'Tambahkan ke sesi'}</button></form>
  </aside>`;
}

function renderEndPanel() {
  const session = sessions.find((entry) => entry.id === panelSessionId);
  if (!session) return '';
  const remaining = session.movements.flatMap((movement) => movement.sets).filter((set) => set.status === 'unrecorded').length;
  return `<aside class="workout-context-panel end-panel" aria-labelledby="end-session-title"><div class="panel-title"><div><span>Akhiri sesi</span><h2 id="end-session-title">Masih ada ${remaining} set belum dicatat</h2></div><button type="button" data-workout-close-panel aria-label="Tutup panel">${icon('x')}</button></div><p>Hasil tidak akan diubah agar terlihat memenuhi target. Pilih status yang sesuai dengan latihanmu.</p><div class="end-actions"><button type="button" class="workout-primary" data-workout-continue> Lanjut latihan</button><button type="button" data-workout-finish-partial>Simpan sebagai sebagian selesai</button><button type="button" data-workout-finish-skipped>Tandai sisa dilewati</button></div></aside>`;
}

function renderContextPanel() {
  if (panel === 'session') return renderSessionForm();
  if (panel === 'movement') return renderMovementForm();
  if (panel === 'end') return renderEndPanel();
  return `<aside class="workout-context-panel workout-quick-panel"><div class="panel-title"><div><span>Rencanakan berikutnya</span><h2>Gerak dengan jelas</h2></div></div><p>Pilih sesi untuk menambah gerakan, gunakan template, atau duplikasi rencana terakhir. Hasil aktual selalu mulai kosong.</p>${templates.length ? `<div class="template-picker"><h3>Template saya</h3>${templates.slice(0, 3).map((template) => `<button type="button" data-workout-use-template="${template.id}"><span>${icon('bookmark-simple')}</span><span><strong>${escapeHtml(template.name)}</strong><small>${template.movements.length} gerakan</small></span>${icon('caret-right')}</button>`).join('')}</div>` : ''}<button type="button" class="workout-link-button" data-workout-duplicate-previous>${icon('copy')} Duplikasi sesi sebelumnya</button><button type="button" class="workout-link-button" data-workout-materials>${icon('books')} Buka Pustaka gerakan</button></aside>`;
}

function activeSession() {
  return sessions.find((session) => session.id === focusSessionId);
}

function activeMovement(session: WorkoutSessionResponse) {
  return session.movements.find((movement) => movement.id === activeMovementId) ?? session.movements.find((movement) => movement.status === 'in_progress') ?? session.movements.find((movement) => movement.status === 'planned') ?? session.movements[0];
}

function comparablePreviousMovement(candidate: WorkoutMovementResponse, current: WorkoutMovementResponse) {
  if (candidate.name.toLocaleLowerCase('id-ID') !== current.name.toLocaleLowerCase('id-ID')) return false;
  if (candidate.exerciseType !== current.exerciseType) return false;
  if ((candidate.target.weightUnit ?? 'kg') !== (current.target.weightUnit ?? 'kg')) return false;
  if ((candidate.target.weightBasis ?? 'total') !== (current.target.weightBasis ?? 'total')) return false;
  if ((candidate.target.distanceUnit ?? 'km') !== (current.target.distanceUnit ?? 'km')) return false;
  return candidate.sets.some((set) => set.status === 'completed' && set.actual
    && (set.actual.weightUnit ?? candidate.target.weightUnit ?? 'kg') === (current.target.weightUnit ?? 'kg')
    && (set.actual.weightBasis ?? candidate.target.weightBasis ?? 'total') === (current.target.weightBasis ?? 'total')
    && (set.actual.distanceUnit ?? candidate.target.distanceUnit ?? 'km') === (current.target.distanceUnit ?? 'km'));
}

function previousMovementResult(current: WorkoutSessionResponse, movement: WorkoutMovementResponse) {
  return sessions
    .filter((session) => session.id !== current.id && session.date <= current.date)
    .sort((a, b) => `${b.date}${b.endedAt ?? b.updatedAt}`.localeCompare(`${a.date}${a.endedAt ?? a.updatedAt}`))
    .flatMap((session) => session.movements.map((candidate) => ({ session, candidate })))
    .find(({ candidate }) => comparablePreviousMovement(candidate, movement));
}

function setTargetText(set: WorkoutSetResponse) {
  const target = set.target;
  const parts: string[] = [];
  if (target.weight !== undefined) parts.push(`${target.weight} ${target.weightUnit ?? 'kg'}`);
  if (target.repsMin && target.repsMax) parts.push(`${target.repsMin}-${target.repsMax} rep`);
  else if (target.reps) parts.push(`${target.reps} rep`);
  if (target.durationMinutes) parts.push(`${target.durationMinutes} menit`);
  if (target.workSeconds) parts.push(`${target.workSeconds} dtk`);
  return parts.join(' × ') || targetSummary({ target } as WorkoutMovementResponse);
}

function draftForSet(set: WorkoutSetResponse) {
  const draft = setDrafts.get(set.id);
  if (draft) return draft;
  return {
    weight: set.actual?.weight !== undefined ? String(set.actual.weight) : '',
    reps: set.actual?.reps !== undefined ? String(set.actual.reps) : '',
    duration: set.actual?.durationMinutes !== undefined ? String(set.actual.durationMinutes) : '',
    distance: set.actual?.distance !== undefined ? String(set.actual.distance) : '',
    rpe: set.rpe !== undefined ? String(set.rpe) : '',
  };
}

function visibleSetInput(setId: string) {
  return [...document.querySelectorAll<HTMLInputElement>(`[data-set-id="${CSS.escape(setId)}"][aria-invalid="true"]`)]
    .find((input) => input.getClientRects().length > 0 && getComputedStyle(input).visibility !== 'hidden');
}

function renderSetInputs(movement: WorkoutMovementResponse, set: WorkoutSetResponse, mode: 'desktop' | 'mobile') {
  const draft = draftForSet(set);
  const error = setValidationErrors.get(set.id) ?? '';
  const errorId = `set-input-error-${mode}-${set.id}`;
  const validation = error ? ` aria-invalid="true" aria-describedby="${escapeHtml(errorId)}"` : ' aria-invalid="false"';
  const decimal = `type="text" inputmode="decimal" data-local-decimal${validation}`;
  const message = error ? `<p class="set-input-error" id="${escapeHtml(errorId)}" role="alert">${icon('warning-circle')} ${escapeHtml(error)}</p>` : '';
  if (movement.exerciseType === 'strength' || movement.exerciseType === 'bodyweight') return `<label><span>Beban aktual (${escapeHtml(movement.target.weightUnit ?? 'kg')})</span><input name="actualWeight" data-set-field="weight" data-set-id="${set.id}" ${decimal} value="${escapeHtml(draft.weight ?? '')}" aria-label="Beban aktual set ${set.number}" /></label><label><span>Repetisi aktual (rep)</span><input name="actualReps" data-set-field="reps" data-set-id="${set.id}" inputmode="numeric" type="number" min="0" value="${escapeHtml(draft.reps ?? '')}" aria-label="Repetisi aktual set ${set.number}"${validation} /></label>${mode === 'mobile' ? `<label><span>RPE (opsional, skala 1-10)</span><input data-set-field="rpe" data-set-id="${set.id}" type="text" inputmode="decimal" data-local-decimal value="${escapeHtml(draft.rpe ?? '')}"${validation} /></label>` : ''}${message}`;
  return `<label><span>Durasi aktual (menit)</span><input data-set-field="duration" data-set-id="${set.id}" ${decimal} value="${escapeHtml(draft.duration ?? '')}" /></label>${movement.exerciseType === 'cardio' ? `<label><span>Jarak aktual (${escapeHtml(movement.target.distanceUnit ?? 'km')})</span><input data-set-field="distance" data-set-id="${set.id}" ${decimal} value="${escapeHtml(draft.distance ?? '')}" /></label>` : ''}${mode === 'mobile' ? `<label><span>RPE (opsional, skala 1-10)</span><input data-set-field="rpe" data-set-id="${set.id}" type="text" inputmode="decimal" data-local-decimal value="${escapeHtml(draft.rpe ?? '')}"${validation} /></label>` : ''}${message}`;
}

function renderSetActions(session: WorkoutSessionResponse, movement: WorkoutMovementResponse, set: WorkoutSetResponse) {
  if (set.status === 'completed') return `<button type="button" class="set-done" data-workout-uncomplete-set="${set.id}" data-session="${session.id}" data-movement="${movement.id}">${icon('check')} Batalkan selesai</button>`;
  if (set.status === 'skipped') return `<button type="button" data-workout-uncomplete-set="${set.id}" data-session="${session.id}" data-movement="${movement.id}">Pulihkan set</button>`;
  const setSaveBusy = saveState === 'saving';
  return `<button type="button" class="workout-primary" data-workout-save-set="${set.id}" data-session="${session.id}" data-movement="${movement.id}" aria-busy="${setSaveBusy}"${setSaveBusy ? ' disabled aria-disabled="true"' : ''}>${icon('check')} Simpan set</button><button type="button" data-workout-skip-set="${set.id}" data-session="${session.id}" data-movement="${movement.id}">Lewati set</button>`;
}

function renderFocusSets(session: WorkoutSessionResponse, movement: WorkoutMovementResponse) {
  const activeSet = movement.sets.find((set) => set.status === 'unrecorded') ?? movement.sets[movement.sets.length - 1];
  return `<div class="focus-set-table"><div class="set-table-head"><span>Set</span><span>Target</span><span>Hasil aktual</span><span>Status</span></div>${movement.sets.map((set) => `<div class="focus-set-row ${set.status}"><strong>${set.number}</strong><span>${escapeHtml(setTargetText(set))}</span><div class="set-inline-inputs">${renderSetInputs(movement, set, 'desktop')}</div><div class="set-row-actions">${renderSetActions(session, movement, set)}</div></div>`).join('')}</div>
  ${activeSet ? `<div class="focus-mobile-set"><div class="mobile-set-heading"><span>Set aktif</span><strong>Set ${activeSet.number} dari ${movement.sets.length}</strong></div><p>Target: ${escapeHtml(setTargetText(activeSet))}</p><div class="mobile-set-inputs">${renderSetInputs(movement, activeSet, 'mobile')}</div><div class="mobile-set-actions">${renderSetActions(session, movement, activeSet)}</div></div>` : ''}`;
}

function restTimerSeconds(session: WorkoutSessionResponse) {
  if (session.restTimerPausedRemainingSeconds !== undefined) return session.restTimerPausedRemainingSeconds;
  if (!session.restTimerEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(session.restTimerEndsAt).getTime() - Date.now()) / 1000));
}

function renderRestTimer(session: WorkoutSessionResponse) {
  const visible = Boolean(session.restTimerEndsAt || session.restTimerPausedRemainingSeconds !== undefined);
  return `<section class="rest-timer ${visible ? 'visible' : ''}" aria-label="Timer istirahat"><div><span>Timer istirahat</span><strong data-rest-clock>${formatClock(restTimerSeconds(session))}</strong><small>Terpisah dari durasi sesi</small></div><div>${session.restTimerEndsAt ? `<button type="button" data-workout-rest-pause>Jeda</button>` : `<button type="button" data-workout-rest-resume>Lanjut</button>`}<button type="button" data-workout-rest-add>Tambah 15 dtk</button><button type="button" data-workout-rest-skip>Lewati istirahat</button></div></section>`;
}

function renderFocusMode(session: WorkoutSessionResponse) {
  const movement = activeMovement(session);
  if (!movement) return `<section class="workout-empty-state"><h1>Sesi belum memiliki gerakan</h1><button type="button" data-workout-exit-focus>Kembali ke planner</button></section>`;
  const completed = session.movements.filter((entry) => entry.status === 'completed').length;
  const previous = previousMovementResult(session, movement);
  const saveCopy = saveState === 'saving' ? 'Menyimpan' : saveState === 'saved' ? 'Tersimpan' : saveState === 'failed' ? `Gagal menyimpan: ${saveError}` : 'Siap mencatat';
  return `<section class="workout-focus" aria-label="Focus Mode"><header class="focus-session-header"><button type="button" data-workout-exit-focus aria-label="Kembali ke planner">${icon('arrow-left')}</button><div><span>Focus Mode</span><h1>${escapeHtml(session.name)}</h1><p><span class="session-status in_progress">${escapeHtml(statusLabel(session.status))}</span><span data-session-clock>${formatClock(sessionDurationSeconds(session))}</span></p></div><div class="focus-progress"><strong>${completed} / ${session.movements.length} gerakan selesai</strong><div aria-hidden="true">${session.movements.map((entry) => `<i class="${entry.status}"></i>`).join('')}</div></div><div class="focus-session-actions">${session.pausedAt ? '<button type="button" data-workout-session-resume>Lanjut sesi</button>' : '<button type="button" data-workout-session-pause>Jeda sesi</button>'}<button type="button" data-workout-open-end>Akhiri sesi</button></div></header>
    <nav class="focus-movement-nav" aria-label="Navigasi gerakan">${session.movements.map((entry, index) => `<button type="button" class="${entry.id === movement.id ? 'active' : ''} ${entry.status}" data-workout-focus-movement="${entry.id}"><span>${entry.status === 'completed' ? icon('check') : index + 1}</span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(movementStatusLabel(entry.status))}</small></button>`).join('')}</nav>
    ${renderRestTimer(session)}
    <div class="focus-grid"><main class="focus-exercise"><header><span class="focus-exercise-icon">${movementIcon(movement.exerciseType)}</span><div><small>Gerakan ${movement.position} dari ${session.movements.length}</small><h2>${escapeHtml(movement.name)}</h2><p>${escapeHtml(targetSummary(movement))}</p></div>${previous ? `<div class="previous-result"><span>Hasil sesi sebelumnya</span><strong>${escapeHtml(previous.candidate.sets.filter((set) => set.status === 'completed').map((set) => set.actual ? Object.values(set.actual).join(' × ') : '').filter(Boolean).join(', '))}</strong><small>${escapeHtml(previous.session.date)}</small></div>` : ''}</header>
      <div class="set-tools"><button type="button" data-workout-use-target="${movement.id}">Gunakan target</button><button type="button" data-workout-copy-previous="${movement.id}">Salin set sebelumnya</button><label><input type="checkbox" data-workout-rest-enabled ${restTimerEnabled ? 'checked' : ''} /> Timer istirahat otomatis</label></div>
      ${renderFocusSets(session, movement)}
      <button type="button" class="workout-add-set" data-workout-add-set="${movement.id}">${icon('plus')} Tambah set</button>
    </main><aside class="focus-side"><div class="save-status ${saveState}" role="status" aria-live="polite">${icon(saveState === 'failed' ? 'warning-circle' : 'cloud-check')}<span>${escapeHtml(saveCopy)}</span>${saveState === 'failed' ? '<button type="button" data-workout-retry>Coba lagi</button>' : ''}</div><section><span>Target gerakan</span><strong>${escapeHtml(targetSummary(movement))}</strong><p>Target hanya referensi. Simpan hasil aktual tiap set secara terpisah.</p></section>${movement.note ? `<section><span>Catatan</span><p>${escapeHtml(movement.note)}</p></section>` : ''}<section class="rpe-help"><span>RPE</span><p>1 terasa sangat mudah. 10 adalah usaha maksimal. Pengisian bersifat opsional.</p></section></aside></div>
    ${panel === 'end' ? renderEndPanel() : ''}
  </section>`;
}

function recordedWorkoutSets(movement: WorkoutMovementResponse) {
  return movement.sets.filter((set) => set.status === 'completed' && Boolean(set.actual));
}

function renderSummary(session: WorkoutSessionResponse) {
  const recordedMovements = session.movements
    .map((movement) => ({ movement, recordedSets: recordedWorkoutSets(movement) }))
    .filter(({ recordedSets }) => recordedSets.length > 0);
  const completedSets = recordedMovements.flatMap(({ recordedSets }) => recordedSets);
  const skippedSets = session.movements.flatMap((movement) => movement.sets).filter((set) => set.status === 'skipped');
  const detail = recordedMovements.length
    ? recordedMovements.map(({ movement, recordedSets }) => {
      const volume = workoutVolume(movement);
      return `<article><div><span>${movementIcon(movement.exerciseType)}</span><div><h2>${escapeHtml(movement.name)}</h2><p>${escapeHtml(targetSummary(movement))}</p></div><strong>${recordedSets.length} set tercatat</strong></div><ol>${recordedSets.map((set) => `<li class="${set.status}"><span>Set ${set.number}</span><span>Target ${escapeHtml(setTargetText(set))}</span><strong>Aktual ${escapeHtml(Object.entries(set.actual!).map(([key, value]) => `${key}: ${value}`).join(', '))}</strong></li>`).join('')}</ol>${volume !== null ? `<p class="volume-note">Volume aktual valid dari ${volume.setCount} set: ${volume.value} ${escapeHtml(volume.unit)}·rep (${escapeHtml(volume.basis === 'per_dumbbell' ? 'per dumbbell' : 'total')})</p>` : ''}</article>`;
    }).join('')
    : '<div class="workout-empty-state compact"><h2>Belum ada hasil aktual yang tercatat</h2><p>Set yang dilewati atau belum dicatat tidak ditampilkan sebagai hasil.</p></div>';
  return `<section class="workout-summary"><header><button type="button" data-workout-exit-focus>${icon('arrow-left')} Kembali ke planner</button><div><span>Ringkasan sesi</span><h1>${escapeHtml(session.name)}</h1><p>${escapeHtml(statusLabel(session.status))} <span aria-hidden="true">·</span> ${formatClock(sessionDurationSeconds(session))} durasi aktual</p></div><button type="button" class="workout-primary" data-workout-repeat-session="${session.id}">${icon('arrow-clockwise')} Ulangi sesi</button></header><div class="summary-facts"><div><span>Gerakan tercatat</span><strong>${recordedMovements.length}</strong></div><div><span>Set tercatat</span><strong>${completedSets.length}</strong></div><div><span>Set dilewati</span><strong>${skippedSets.length}</strong></div></div><div class="summary-movements">${detail}</div><label class="summary-note"><span>Catatan sesi</span><textarea rows="3" data-workout-summary-note maxlength="2000">${escapeHtml(session.note)}</textarea></label><div class="summary-actions"><button type="button" data-workout-save-summary-note="${session.id}">Simpan catatan</button><button type="button" data-workout-save-template="${session.id}">Simpan sebagai template</button></div></section>`;
}

function renderHistory() {
  const normalized = historyExercise.trim().toLocaleLowerCase('id-ID');
  const visible = sessions.filter((session) => (historyDate ? session.date === historyDate : true) && (normalized ? session.movements.some((movement) => movement.name.toLocaleLowerCase('id-ID').includes(normalized)) : true) && ['completed', 'partial', 'skipped'].includes(session.status));
  return `<section class="workout-history"><div class="history-toolbar"><div><span>Riwayat</span><h1>Latihan yang benar-benar tercatat</h1><p>Filter berdasarkan tanggal atau gerakan. Perbandingan hanya memakai hasil aktual yang valid.</p></div><div><label><span>Tanggal</span><input type="date" data-workout-history-date value="${escapeHtml(historyDate)}" /></label><label><span>Gerakan</span><input data-workout-history-exercise value="${escapeHtml(historyExercise)}" placeholder="Cari nama gerakan" /></label></div></div>${visible.length ? `<div class="history-list">${visible.map((session) => `<article><div><span class="session-status ${session.status}">${escapeHtml(statusLabel(session.status))}</span><h2>${escapeHtml(session.name)}</h2><p>${escapeHtml(session.date)} <span aria-hidden="true">·</span> ${formatClock(sessionDurationSeconds(session))}</p></div><div><strong>${session.movements.filter((movement) => movement.status === 'completed').length}/${session.movements.length} gerakan</strong><button type="button" data-workout-summary="${session.id}">Lihat hasil</button></div></article>`).join('')}</div>` : `<div class="workout-empty-state compact"><h2>Belum ada hasil yang cocok</h2><p>Selesaikan atau simpan sebagian sesi agar muncul di riwayat.</p></div>`}</section>`;
}

export function renderWorkoutTrail() {
  const queryMode = new URLSearchParams(window.location.search).get('mode');
  const focus = activeSession();
  if (focus && queryMode === 'focus') return `<div class="workout-shell">${renderFocusMode(focus)}</div>`;
  if (focus && queryMode === 'summary') return `<div class="workout-shell">${renderSummary(focus)}</div>`;
  return `<div class="workout-shell"><div class="workout-page-heading"><div><span>Activity trail</span><h1>Gerak hari ini.</h1><p>Rencana yang ringan, pencatatan yang jujur.</p></div><div class="workout-view-tabs" role="tablist"><button type="button" role="tab" aria-selected="${view === 'plan'}" data-workout-view="plan">Rencana</button><button type="button" role="tab" aria-selected="${view === 'history'}" data-workout-view="history">Riwayat</button></div></div>${renderWeekStrip()}${view === 'plan' ? renderPlan() : renderHistory()}</div>`;
}

const saveQueue = new SerializedSessionSaveQueue<WorkoutSessionResponse>(
  (id, snapshot) => api.updateWorkoutSession(id, snapshot),
);

async function persistSession(next: WorkoutSessionResponse, options: WorkoutTrailBindOptions, after?: (saved: WorkoutSessionResponse) => void) {
  saveState = 'saving'; saveError = ''; options.rerender();
  saveQueue.enqueue(next.id, sessionInput(next), {
    optimistic: (id, snapshot) => {
      sessions = sessions.map((session) => session.id === id ? { ...snapshot, movements: next.movements } : session);
      retrySave = () => { void persistSession(next, options, after); };
    },
    success: (id, saved, hasQueuedSuccessor) => {
      sessions = sessions.map((session) => session.id === id ? { ...saved, movements: hasQueuedSuccessor ? session.movements : saved.movements } : session);
      if (!hasQueuedSuccessor) {
        saveState = 'saved'; retrySave = null; saveCache(); options.onStatus(true, ''); after?.(saved); options.rerender();
        window.setTimeout(() => { if (saveState === 'saved' && !saveQueue.hasPending()) { saveState = 'idle'; options.rerender(); } }, 1200);
      }
    },
    failure: (id, error) => {
      if (error instanceof ApiError && error.status === 409) {
        saveQueue.discard(id);
        retrySave = null;
        saveState = 'failed'; saveError = 'Sesi sudah berubah di perangkat lain; memuat versi terbaru…'; options.onStatus(false, saveError); options.rerender();
        void syncWorkoutTrailData().then(() => { saveState = 'failed'; saveError = 'Sesi sudah berubah di perangkat lain; perubahan terakhir tidak disimpan.'; saveCache(); options.onStatus(false, saveError); options.rerender(); }).catch(() => { saveState = 'failed'; saveError = 'Sesi sudah berubah di perangkat lain; muat ulang sebelum menyimpan.'; options.onStatus(false, saveError); options.rerender(); });
        return;
      }
      saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Progres belum dapat disimpan.'; options.onStatus(false, saveError); options.rerender();
    },
  });
}

function sessionById(id: string) {
  return sessions.find((session) => session.id === id);
}

function reorderMovement(session: WorkoutSessionResponse, movementId: string, offset: number) {
  const index = session.movements.findIndex((movement) => movement.id === movementId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= session.movements.length) return session;
  const movements = [...session.movements];
  [movements[index], movements[target]] = [movements[target], movements[index]];
  return { ...session, movements: movements.map((movement, position) => ({ ...movement, position: position + 1 })) };
}

function actualFromDraft(movement: WorkoutMovementResponse, draft: SetDraft): WorkoutSetActual | null {
  const actual = movement.exerciseType === 'strength' || movement.exerciseType === 'bodyweight'
    ? compactRecord({ weight: optionalNumber(draft.weight ?? ''), reps: optionalNumber(draft.reps ?? ''), weightUnit: movement.target.weightUnit ?? 'kg', weightBasis: movement.target.weightBasis ?? 'total' })
    : compactRecord({ durationMinutes: optionalNumber(draft.duration ?? ''), distance: optionalNumber(draft.distance ?? ''), distanceUnit: movement.target.distanceUnit });
  return Object.keys(actual).some((key) => !['weightUnit', 'weightBasis', 'distanceUnit'].includes(key)) ? actual : null;
}

function setDraftError(movement: WorkoutMovementResponse, draft: SetDraft) {
  const actualValues = movement.exerciseType === 'strength' || movement.exerciseType === 'bodyweight'
    ? [draft.weight ?? '', draft.reps ?? '']
    : [draft.duration ?? '', draft.distance ?? ''];
  if (actualValues.some((value) => value.trim() && localizedNumber(value).error)) {
    return 'Gunakan angka non-negatif dengan koma atau titik desimal.';
  }
  const rpe = localizedNumber(draft.rpe ?? '');
  if (rpe.error || (rpe.value !== undefined && (rpe.value < 1 || rpe.value > 10))) return 'RPE harus berupa angka 1 sampai 10.';
  if (!actualFromDraft(movement, draft)) return 'Isi setidaknya satu hasil aktual sebelum menyimpan.';
  return '';
}

function updateSet(session: WorkoutSessionResponse, movementId: string, setId: string, updater: (set: WorkoutSetResponse, movement: WorkoutMovementResponse) => WorkoutSetResponse) {
  return {
    ...session,
    movements: session.movements.map((movement) => {
      if (movement.id !== movementId) return movement;
      const sets = movement.sets.map((set) => set.id === setId ? updater(set, movement) : set);
      const done = sets.length > 0 && sets.every((set) => set.status === 'completed' || set.status === 'skipped');
      const hasCompleted = sets.some((set) => set.status === 'completed');
      return { ...movement, sets, status: done ? (hasCompleted ? 'completed' : 'skipped') : 'in_progress' };
    }),
  } as WorkoutSessionResponse;
}

function findSetContext(button: HTMLElement) {
  const session = sessionById(button.dataset.session ?? focusSessionId);
  const movement = session?.movements.find((entry) => entry.id === button.dataset.movement);
  const set = movement?.sets.find((entry) => entry.id === button.dataset.workoutSaveSet || entry.id === button.dataset.workoutSkipSet || entry.id === button.dataset.workoutUncompleteSet);
  return { session, movement, set };
}

function setRestAfterSave(session: WorkoutSessionResponse, movement: WorkoutMovementResponse) {
  if (!restTimerEnabled || !movement.restSeconds) return session;
  return { ...session, restTimerEndsAt: new Date(Date.now() + movement.restSeconds * 1000).toISOString(), restTimerPausedRemainingSeconds: undefined };
}

function useTargetDrafts(movement: WorkoutMovementResponse) {
  movement.sets.filter((set) => set.status === 'unrecorded').forEach((set) => setDrafts.set(set.id, {
    weight: set.target.weight !== undefined ? String(set.target.weight) : '',
    reps: set.target.reps !== undefined ? String(set.target.reps) : set.target.repsMax !== undefined ? String(set.target.repsMax) : '',
    duration: set.target.durationMinutes !== undefined ? String(set.target.durationMinutes) : '',
    distance: set.target.distance !== undefined ? String(set.target.distance) : '', rpe: '',
  }));
}

function copyPreviousSetDraft(movement: WorkoutMovementResponse) {
  const next = movement.sets.find((set) => set.status === 'unrecorded');
  if (!next) return;
  const previous = [...movement.sets].reverse().find((set) => set.number < next.number && set.status === 'completed' && set.actual);
  if (previous?.actual) setDrafts.set(next.id, { weight: String(previous.actual.weight ?? ''), reps: String(previous.actual.reps ?? ''), duration: String(previous.actual.durationMinutes ?? ''), distance: String(previous.actual.distance ?? ''), rpe: previous.rpe ? String(previous.rpe) : '' });
}

async function createSessionFromTemplate(template: WorkoutTemplateResponse, options: WorkoutTrailBindOptions) {
  saveState = 'saving'; options.rerender();
  try {
    const created = await api.createWorkoutSession({ name: template.name, date: selectedDate, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta', status: 'planned', estimatedMinutes: 0, pausedSeconds: 0, location: '', note: '', templateId: template.id, movements: resetWorkoutActuals(template.movements) });
    sessions = [created, ...sessions]; saveState = 'saved'; panel = null; saveCache(); options.onStatus(true, ''); options.rerender();
  } catch (error) { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Template belum dapat digunakan.'; options.onStatus(false, saveError); options.rerender(); }
}

export function bindWorkoutTrailEvents(options: WorkoutTrailBindOptions) {
  if (clockTimer !== null) window.clearInterval(clockTimer);
  clockTimer = window.setInterval(() => {
    const session = activeSession();
    if (!session) return;
    const sessionClock = document.querySelector<HTMLElement>('[data-session-clock]');
    if (sessionClock) sessionClock.textContent = formatClock(sessionDurationSeconds(session));
    const rest = document.querySelector<HTMLElement>('[data-rest-clock]');
    if (rest) rest.textContent = formatClock(restTimerSeconds(session));
  }, 1000);

  const root = document.querySelector<HTMLElement>('.workout-shell');
  if (!root) return;
  root.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.setId && input.dataset.setField) {
      const draft = { ...(setDrafts.get(input.dataset.setId) ?? {}) };
      draft[input.dataset.setField as keyof SetDraft] = input.value;
      setDrafts.set(input.dataset.setId, draft);
      if (setValidationErrors.delete(input.dataset.setId)) {
        root.querySelectorAll<HTMLElement>(`.set-input-error[id$="-${CSS.escape(input.dataset.setId)}"]`).forEach((message) => message.remove());
        root.querySelectorAll<HTMLInputElement>(`[data-set-id="${CSS.escape(input.dataset.setId)}"]`).forEach((field) => {
          field.setAttribute('aria-invalid', 'false');
          field.removeAttribute('aria-describedby');
        });
      }
    }
    if (input.closest('[data-workout-movement-form]') && movementFormError) {
      movementFormError = null;
      root.querySelector('.panel-form-error')?.remove();
      root.querySelectorAll<HTMLInputElement>('[data-workout-movement-form] [aria-invalid="true"]').forEach((field) => {
        field.setAttribute('aria-invalid', 'false');
        field.removeAttribute('aria-describedby');
      });
    }
    if (input.matches('[data-workout-library-search]')) {
      const query = input.value.trim().toLocaleLowerCase('id-ID');
      root.querySelectorAll<HTMLElement>('[data-workout-library]').forEach((entry) => { entry.hidden = Boolean(query) && !(entry.dataset.search ?? '').includes(query); });
    }
  });
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.matches('[data-workout-exercise-type]')) {
      const form = target.closest<HTMLFormElement>('form'); if (!form) return;
      captureMovementDraft(form); movementDraft.exerciseType = target.value as WorkoutExerciseType; movementFormError = null; options.rerender();
    } else if (target.matches('[data-workout-month-picker]')) { setSelectedDate(target.value); monthOpen = false; options.rerender(); }
    else if (target.matches('[data-workout-history-date]')) { historyDate = target.value; options.rerender(); }
    else if (target.matches('[data-workout-history-exercise]')) { historyExercise = target.value; options.rerender(); requestAnimationFrame(() => root.querySelector<HTMLInputElement>('[data-workout-history-exercise]')?.focus()); }
    else if (target.matches('[data-workout-rest-enabled]')) { restTimerEnabled = (target as HTMLInputElement).checked; localStorage.setItem(restPreferenceKey, String(restTimerEnabled)); }
  });
  root.addEventListener('dragstart', (event) => { draggedMovementId = (event.target as HTMLElement).closest<HTMLElement>('[data-workout-drag]')?.dataset.workoutDrag ?? ''; });
  root.addEventListener('dragover', (event) => { if ((event.target as HTMLElement).closest('[data-workout-drag]')) event.preventDefault(); });
  root.addEventListener('drop', (event) => {
    event.preventDefault(); const target = (event.target as HTMLElement).closest<HTMLElement>('[data-workout-drag]'); if (!target || !draggedMovementId || target.dataset.workoutDrag === draggedMovementId) return;
    const sessionElement = target.closest<HTMLElement>('[data-session-card]'); const session = sessionById(sessionElement?.dataset.sessionCard ?? ''); if (!session) return;
    const from = session.movements.findIndex((movement) => movement.id === draggedMovementId); const to = session.movements.findIndex((movement) => movement.id === target.dataset.workoutDrag);
    const movements = [...session.movements]; const [moved] = movements.splice(from, 1); movements.splice(to, 0, moved);
    void persistSession({ ...session, movements: movements.map((movement, index) => ({ ...movement, position: index + 1 })) }, options);
  });

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.workoutWeekPrev !== undefined) { visibleWeek = addDays(visibleWeek, -7); setSelectedDate(localDateKey(visibleWeek)); options.rerender(); return; }
    if (button.dataset.workoutWeekNext !== undefined) { visibleWeek = addDays(visibleWeek, 7); setSelectedDate(localDateKey(visibleWeek)); options.rerender(); return; }
    if (button.dataset.workoutToday !== undefined) { setSelectedDate(today); options.rerender(); return; }
    if (button.dataset.workoutMonthToggle !== undefined) { monthOpen = !monthOpen; options.rerender(); return; }
    if (button.dataset.workoutDay) { setSelectedDate(button.dataset.workoutDay); panel = null; options.rerender(); return; }
    if (button.dataset.workoutView) { view = button.dataset.workoutView as WorkoutView; updateRoute({ view: view === 'history' ? 'history' : null, mode: null, session: null, movement: null }); options.rerender(); return; }
    if (button.dataset.workoutCreateSession !== undefined) { panel = 'session'; editingSessionId = ''; options.rerender(); return; }
    if (button.dataset.workoutOpenTemplates !== undefined) { panel = 'session'; editingSessionId = ''; options.rerender(); return; }
    if (button.dataset.workoutMaterials !== undefined) { window.location.assign(`/workout/materials?date=${encodeURIComponent(selectedDate)}`); return; }
    if (button.dataset.workoutClosePanel !== undefined || button.dataset.workoutContinue !== undefined) { panel = null; movementFormError = null; options.rerender(); return; }
    if (button.dataset.workoutEditSession) { panel = 'session'; editingSessionId = button.dataset.workoutEditSession; options.rerender(); return; }
    if (button.dataset.workoutAddMovement) { panel = 'movement'; panelSessionId = button.dataset.workoutAddMovement; editingMovementId = ''; movementDraft = emptyMovementDraft(); movementFormError = null; options.rerender(); return; }
    if (button.dataset.workoutEditMovement) { const session = sessionById(button.dataset.session ?? ''); const movement = session?.movements.find((entry) => entry.id === button.dataset.workoutEditMovement); if (session && movement) { panel = 'movement'; panelSessionId = session.id; editingMovementId = movement.id; movementDraft = draftFromMovement(movement); movementFormError = null; options.rerender(); } return; }
    if (button.dataset.workoutLibrary) { const material = mobilityMaterials.find((entry) => entry.id === button.dataset.workoutLibrary); if (material) { movementDraft = emptyMovementDraft('mobility'); movementDraft.name = material.name; movementDraft.materialId = material.id; movementDraft.equipment = [...material.equipment]; movementDraft.muscleGroups = [...material.bodyAreas]; movementDraft.durationMinutes = material.recommendation.durationMinutes ? String(material.recommendation.durationMinutes) : ''; movementDraft.repsMin = material.recommendation.reps ? String(material.recommendation.reps) : ''; movementFormError = null; options.rerender(); } return; }
    if (button.dataset.workoutRecent) { movementDraft = emptyMovementDraft(); movementDraft.name = button.dataset.workoutRecent; movementFormError = null; options.rerender(); return; }
    if (button.dataset.workoutMoveUp || button.dataset.workoutMoveDown) { const id = button.dataset.workoutMoveUp ?? button.dataset.workoutMoveDown!; const session = sessionById(button.dataset.session ?? ''); if (session) void persistSession(reorderMovement(session, id, button.dataset.workoutMoveUp ? -1 : 1), options); return; }
    if (button.dataset.workoutDuplicateMovement) { const session = sessionById(button.dataset.session ?? ''); const movement = session?.movements.find((entry) => entry.id === button.dataset.workoutDuplicateMovement); if (session && movement) { const copy = { ...movement, id: crypto.randomUUID(), name: `${movement.name} (salinan)`, status: 'planned' as const, sets: movement.sets.map((set) => ({ ...set, id: crypto.randomUUID(), actual: null, status: 'unrecorded' as const, recordedAt: undefined, rpe: undefined })) }; void persistSession({ ...session, movements: [...session.movements, copy].map((entry, index) => ({ ...entry, position: index + 1 })) }, options); } return; }
    if (button.dataset.workoutDeleteMovement) { pendingDeleteMovementId = button.dataset.workoutDeleteMovement; options.rerender(); return; }
    if (button.dataset.workoutDeleteMovementConfirm) { const session = sessionById(button.dataset.session ?? ''); if (session) { pendingDeleteMovementId = ''; void persistSession({ ...session, movements: session.movements.filter((entry) => entry.id !== button.dataset.workoutDeleteMovementConfirm).map((entry, index) => ({ ...entry, position: index + 1 })) }, options); } return; }
    if (button.dataset.workoutDeleteSession) { pendingDeleteSessionId = button.dataset.workoutDeleteSession; options.rerender(); return; }
    if (button.dataset.workoutCancelDelete !== undefined) { pendingDeleteSessionId = ''; pendingDeleteMovementId = ''; options.rerender(); return; }
    if (button.dataset.workoutDeleteSessionConfirm) { const id = button.dataset.workoutDeleteSessionConfirm; saveState = 'saving'; options.rerender(); void api.deleteWorkoutSession(id).then(() => { sessions = sessions.filter((entry) => entry.id !== id); saveState = 'saved'; pendingDeleteSessionId = ''; saveCache(); options.onStatus(true, ''); options.rerender(); }).catch((error) => { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Sesi belum dapat dihapus.'; options.onStatus(false, saveError); options.rerender(); }); return; }
    if (button.dataset.workoutDuplicateSession) { const session = sessionById(button.dataset.workoutDuplicateSession); if (session) { saveState = 'saving'; options.rerender(); void api.createWorkoutSession(duplicateWorkoutPlan(session, selectedDate)).then((created) => { sessions = [created, ...sessions]; saveState = 'saved'; saveCache(); options.onStatus(true, ''); options.rerender(); }).catch((error) => { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Sesi belum dapat diduplikasi.'; options.rerender(); }); } return; }
    if (button.dataset.workoutDuplicatePrevious !== undefined) { const previous = sessions.filter((entry) => entry.date < selectedDate).sort((a, b) => b.date.localeCompare(a.date))[0]; if (previous) { saveState = 'saving'; options.rerender(); void api.createWorkoutSession(duplicateWorkoutPlan(previous, selectedDate)).then((created) => { sessions = [created, ...sessions]; saveState = 'saved'; saveCache(); options.rerender(); }); } return; }
    if (button.dataset.workoutSaveTemplate) { const session = sessionById(button.dataset.workoutSaveTemplate); if (session) void api.createWorkoutTemplate({ name: session.name, movements: resetWorkoutActuals(session.movements) }).then((created) => { templates = [created, ...templates]; saveCache(); saveState = 'saved'; options.onStatus(true, ''); options.rerender(); }).catch((error) => { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Template belum dapat disimpan.'; options.rerender(); }); return; }
    if (button.dataset.workoutUseTemplate) { const template = templates.find((entry) => entry.id === button.dataset.workoutUseTemplate); if (template) void createSessionFromTemplate(template, options); return; }
    if (button.dataset.workoutRestDay !== undefined) { void api.createWorkoutSession({ name: 'Hari istirahat', date: selectedDate, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta', status: 'skipped', estimatedMinutes: 0, pausedSeconds: 0, location: '', note: 'Hari pemulihan terjadwal', movements: [] }).then((saved) => { sessions = [saved, ...sessions]; saveCache(); options.rerender(); }).catch((error) => { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Hari istirahat belum dapat disimpan.'; options.onStatus(false, saveError); options.rerender(); }); return; }
    if (button.dataset.workoutStart) { const session = sessionById(button.dataset.workoutStart); if (session) { const first = session.movements[0]; const next = { ...session, status: 'in_progress' as const, startedAt: new Date().toISOString(), pausedAt: undefined, endedAt: undefined, movements: session.movements.map((movement) => ({ ...movement, status: movement.id === first.id ? 'in_progress' as const : movement.status })) }; void persistSession(next, options, (saved) => { focusSessionId = saved.id; activeMovementId = first.id; updateRoute({ date: saved.date, mode: 'focus', session: saved.id, movement: first.id, view: null }); }); } return; }
    if (button.dataset.workoutFocus) { const session = sessionById(button.dataset.workoutFocus); if (session) { focusSessionId = session.id; activeMovementId = activeMovement(session)?.id ?? ''; updateRoute({ date: session.date, mode: 'focus', session: session.id, movement: activeMovementId, view: null }); options.rerender(); } return; }
    if (button.dataset.workoutSummary) { const session = sessionById(button.dataset.workoutSummary); if (session) { focusSessionId = session.id; updateRoute({ date: session.date, mode: 'summary', session: session.id, movement: null, view: null }); options.rerender(); } return; }
    if (button.dataset.workoutExitFocus !== undefined) { const session = activeSession(); if (session) setSelectedDate(session.date); focusSessionId = ''; activeMovementId = ''; panel = null; updateRoute({ mode: null, session: null, movement: null }); options.rerender(); return; }
    if (button.dataset.workoutFocusMovement) { activeMovementId = button.dataset.workoutFocusMovement; updateRoute({ movement: activeMovementId }); options.rerender(); return; }
    if (button.dataset.workoutSessionPause !== undefined || button.dataset.workoutSessionResume !== undefined) { const session = activeSession(); if (!session) return; if (button.dataset.workoutSessionPause !== undefined) void persistSession({ ...session, pausedAt: new Date().toISOString() }, options); else void persistSession(settleSessionPause(session), options); return; }
    if (button.dataset.workoutOpenEnd !== undefined) { panel = 'end'; panelSessionId = focusSessionId; options.rerender(); return; }
    if (button.dataset.workoutUseTarget) { const session = activeSession(); const movement = session?.movements.find((entry) => entry.id === button.dataset.workoutUseTarget); if (movement) { useTargetDrafts(movement); options.rerender(); } return; }
    if (button.dataset.workoutCopyPrevious) { const session = activeSession(); const movement = session?.movements.find((entry) => entry.id === button.dataset.workoutCopyPrevious); if (movement) { copyPreviousSetDraft(movement); options.rerender(); } return; }
    if (button.dataset.workoutSaveSet) { const { session, movement, set } = findSetContext(button); if (!session || !movement || !set) return; const draft = draftForSet(set); const validationError = setDraftError(movement, draft); if (validationError) { setValidationErrors.set(set.id, validationError); saveState = 'failed'; saveError = validationError; options.rerender(); requestAnimationFrame(() => visibleSetInput(set.id)?.focus()); return; } const actual = actualFromDraft(movement, draft)!; const rpe = optionalNumber(draft.rpe ?? ''); setValidationErrors.delete(set.id); let next = updateSet(session, movement.id, set.id, (current) => ({ ...current, actual, status: 'completed', recordedAt: new Date().toISOString(), rpe })); next = setRestAfterSave(next, movement); void persistSession(next, options, () => setDrafts.delete(set.id)); return; }
    if (button.dataset.workoutSkipSet || button.dataset.workoutUncompleteSet) { const { session, movement, set } = findSetContext(button); if (!session || !movement || !set) return; setDrafts.delete(set.id); const status = button.dataset.workoutSkipSet ? 'skipped' as const : 'unrecorded' as const; void persistSession(updateSet(session, movement.id, set.id, (current) => ({ ...current, actual: null, status, recordedAt: undefined, rpe: undefined })), options); return; }
    if (button.dataset.workoutAddSet) { const session = activeSession(); const movement = session?.movements.find((entry) => entry.id === button.dataset.workoutAddSet); if (session && movement) { const last = movement.sets[movement.sets.length - 1]; const created: WorkoutSetResponse = { id: crypto.randomUUID(), number: movement.sets.length + 1, target: { ...(last?.target ?? movement.target) }, actual: null, status: 'unrecorded' }; void persistSession({ ...session, movements: session.movements.map((entry) => entry.id === movement.id ? { ...entry, sets: [...entry.sets, created], status: 'in_progress' } : entry) }, options); } return; }
    if (button.dataset.workoutRestPause !== undefined || button.dataset.workoutRestResume !== undefined || button.dataset.workoutRestAdd !== undefined || button.dataset.workoutRestSkip !== undefined) { const session = activeSession(); if (!session) return; let next = { ...session }; if (button.dataset.workoutRestPause !== undefined) { next.restTimerPausedRemainingSeconds = restTimerSeconds(session); next.restTimerEndsAt = undefined; } else if (button.dataset.workoutRestResume !== undefined) { const seconds = session.restTimerPausedRemainingSeconds ?? 0; next.restTimerEndsAt = new Date(Date.now() + seconds * 1000).toISOString(); next.restTimerPausedRemainingSeconds = undefined; } else if (button.dataset.workoutRestAdd !== undefined) { if (session.restTimerEndsAt) next.restTimerEndsAt = new Date(new Date(session.restTimerEndsAt).getTime() + 15000).toISOString(); else next.restTimerPausedRemainingSeconds = (session.restTimerPausedRemainingSeconds ?? 0) + 15; } else { next.restTimerEndsAt = undefined; next.restTimerPausedRemainingSeconds = undefined; } void persistSession(next, options); return; }
    if (button.dataset.workoutFinishPartial !== undefined || button.dataset.workoutFinishSkipped !== undefined) { const session = activeSession(); if (!session) return; const skip = button.dataset.workoutFinishSkipped !== undefined; const settled = settleSessionPause(session); const next = { ...settled, status: (skip ? 'completed' : 'partial') as WorkoutSessionResponse['status'], endedAt: new Date().toISOString(), restTimerEndsAt: undefined, restTimerPausedRemainingSeconds: undefined, movements: skip ? settled.movements.map((movement) => ({ ...movement, status: movement.status === 'planned' || movement.status === 'in_progress' ? 'skipped' as const : movement.status, sets: movement.sets.map((set) => set.status === 'unrecorded' ? { ...set, status: 'skipped' as const } : set) })) : settled.movements }; panel = null; void persistSession(next, options, (saved) => { focusSessionId = saved.id; updateRoute({ mode: 'summary', session: saved.id, movement: null }); }); return; }
    if (button.dataset.workoutRepeatSession) { const session = sessionById(button.dataset.workoutRepeatSession); if (session) { void api.createWorkoutSession(duplicateWorkoutPlan(session, selectedDate)).then((created) => { sessions = [created, ...sessions]; focusSessionId = ''; updateRoute({ mode: null, session: null, movement: null }); saveCache(); options.rerender(); }); } return; }
    if (button.dataset.workoutRetry !== undefined) { if (!saveQueue.retryFailed()) retrySave?.(); return; }
  });

  root.querySelector<HTMLFormElement>('[data-workout-session-form]')?.addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form); const name = String(data.get('name') ?? '').trim(); const date = String(data.get('date') ?? ''); if (!name || !validLocalDate(date)) return;
    const id = form.dataset.workoutSessionForm ?? ''; const existing = sessionById(id);
    if (existing) { const next = { ...existing, name, date, localTime: String(data.get('localTime') ?? ''), estimatedMinutes: Math.max(0, Number(data.get('estimatedMinutes') ?? 0)), location: String(data.get('location') ?? '').trim(), note: String(data.get('note') ?? '').trim() }; void persistSession(next, options, () => { panel = null; setSelectedDate(date); }); }
    else { saveState = 'saving'; options.rerender(); void api.createWorkoutSession({ name, date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta', status: 'planned', estimatedMinutes: 0, pausedSeconds: 0, location: '', note: '', movements: [] }).then((created) => { sessions = [created, ...sessions]; setSelectedDate(date); panel = 'movement'; panelSessionId = created.id; movementDraft = emptyMovementDraft(); saveState = 'saved'; saveCache(); options.onStatus(true, ''); options.rerender(); }).catch((error) => { saveState = 'failed'; saveError = error instanceof Error ? error.message : 'Sesi belum dapat dibuat.'; options.onStatus(false, saveError); options.rerender(); }); }
  });
  root.querySelector<HTMLFormElement>('[data-workout-movement-form]')?.addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; captureMovementDraft(form); if (!movementDraft.name.trim()) return; const validationError = movementDraftError(movementDraft); if (validationError) { movementFormError = validationError; options.rerender(); requestAnimationFrame(() => { const field = document.querySelector<HTMLInputElement>(`[data-workout-movement-form] [name="${CSS.escape(validationError.field)}"]`); field?.setAttribute('aria-invalid', 'true'); field?.setAttribute('aria-describedby', 'movement-form-error'); field?.focus(); }); return; } movementFormError = null; const session = sessionById(panelSessionId); if (!session) return; const existing = session.movements.find((entry) => entry.id === editingMovementId); const movement = movementFromDraft(movementDraft, existing); let movements = existing ? session.movements.map((entry) => entry.id === existing.id ? movement : entry) : [...session.movements, movement]; movements = movements.map((entry, index) => ({ ...entry, position: index + 1 })); void persistSession({ ...session, movements }, options, () => { panel = null; editingMovementId = ''; movementDraft = emptyMovementDraft(); movementFormError = null; });
  });
  root.querySelector<HTMLButtonElement>('[data-workout-save-summary-note]')?.addEventListener('click', (event) => {
    const session = sessionById((event.currentTarget as HTMLButtonElement).dataset.workoutSaveSummaryNote ?? ''); const note = root.querySelector<HTMLTextAreaElement>('[data-workout-summary-note]')?.value.trim(); if (session && note !== undefined) void persistSession({ ...session, note }, options);
  });
}
