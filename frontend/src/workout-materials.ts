import type { WorkoutEntryResponse, WorkoutInput } from './api';
import type { AppRoute } from './app-route';
import { isValidLocalDate } from './lifestyle';
import { getWorkoutMaterial, getWorkoutMaterialCategory, workoutMaterialCategories, workoutMaterialManifest, type WorkoutMaterial } from './workout-content';

type WorkoutMaterialRoute = Extract<AppRoute, { kind: 'workout-material-categories' | 'workout-material-list' | 'workout-material-detail' | 'not-found' }>;
type RenderOptions = { onNavigate: (path: string) => void; rerender: () => void };
type BindOptions = RenderOptions & {
  scheduleWorkout: (input: WorkoutInput) => Promise<WorkoutEntryResponse>;
  onStatus: (online: boolean, error: string) => void;
};
type ScheduleDraft = { date: string; sets: number; reps: number; durationMinutes: number; note: string };

let schedulingMaterialId: string | null = null;
let scheduleDraft: ScheduleDraft | null = null;
let scheduleError = '';
let scheduleBusy = false;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
}

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function selectedDate() {
  const value = new URLSearchParams(window.location.search).get('date') ?? '';
  return isValidLocalDate(value) ? value : localToday();
}

function withDate(path: string, date = selectedDate()) {
  return `${path}?date=${encodeURIComponent(date)}`;
}

function routeButton(path: string, label: string, className = 'workout-material-back') {
  return `<button type="button" class="${className}" data-workout-material-path="${escapeHtml(path.includes('?') ? path : withDate(path))}">${escapeHtml(label)}</button>`;
}

function breadcrumb(parts: { label: string; path?: string }[]) {
  return `<nav class="workout-material-breadcrumb" aria-label="Workout material breadcrumb">${parts.map((part, index) => `${index ? '<span aria-hidden="true">/</span>' : ''}${part.path ? `<button type="button" data-workout-material-path="${escapeHtml(part.path.includes('?') ? part.path : withDate(part.path))}">${escapeHtml(part.label)}</button>` : `<strong>${escapeHtml(part.label)}</strong>`}`).join('')}</nav>`;
}

function heading(eyebrow: string, title: string, subheading: string) {
  return `<div class="page-heading workout-material-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="subheading">${escapeHtml(subheading)}</p></div><div class="connection"><span class="status-dot"></span><span>STATIC CATALOG</span></div></div>`;
}

function equipmentSummary(material: WorkoutMaterial) {
  return material.equipment.length ? material.equipment.join(' · ') : 'No equipment required';
}

function recommendationMarkup(material: WorkoutMaterial) {
  const recommendation = material.recommendation;
  const numeric = [
    recommendation.sets !== undefined ? `${recommendation.sets} set` : '',
    recommendation.reps !== undefined ? `${recommendation.reps} reps` : '',
    recommendation.durationMinutes !== undefined ? `${recommendation.durationMinutes} min` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="workout-material-prescription"><strong>${escapeHtml(recommendation.text)}</strong>${numeric ? `<span>${escapeHtml(numeric)}</span>` : ''}</div>`;
}

function materialChips(material: WorkoutMaterial) {
  return `<div class="workout-material-chips"><span>${escapeHtml(material.primaryTarget)}</span>${material.difficulty ? `<span>${escapeHtml(material.difficulty)}</span>` : ''}<span>${escapeHtml(equipmentSummary(material))}</span></div>`;
}

function renderCategoryList() {
  const category = workoutMaterialCategories[0];
  return `<div class="workout-materials">${heading('WORKOUT MATERIALS', 'Workout Material List', 'Pilih katalog referensi yang bisa ditambahkan ke Workout pada tanggal pilihanmu.')}${breadcrumb([{ label: 'Workout', path: '/workout' }, { label: 'Materials' }])}<div class="workout-material-category-grid"><button type="button" class="workout-material-category-card" data-workout-material-path="${escapeHtml(withDate(`/workout/materials/${category.id}`))}"><div class="workout-material-card-top"><div><span class="material-kicker">CATEGORY 01</span><h2>${escapeHtml(category.title)}</h2><p>${escapeHtml(category.description)}</p></div><span class="material-arrow" aria-hidden="true">↗</span></div><div class="workout-material-card-meta"><span>${category.materials.length} movements</span><span>Reusable reference</span></div></button></div></div>`;
}

function renderMovementCard(material: WorkoutMaterial) {
  return `<article class="workout-material-card"><div class="workout-material-card-top"><div><div class="workout-material-kicker-row"><span class="material-kicker">MOBILITY</span>${material.difficulty ? `<span class="workout-material-difficulty">${escapeHtml(material.difficulty)}</span>` : ''}</div><h2>${escapeHtml(material.name)}</h2><p>${escapeHtml(material.shortDescription)}</p></div><span class="material-arrow" aria-hidden="true">↗</span></div>${materialChips(material)}${recommendationMarkup(material)}<div class="workout-material-card-actions">${routeButton(`/workout/materials/${material.category}/${material.id}`, 'View movement', 'feature-button primary')}</div></article>`;
}

function renderMovementList(categoryId: string) {
  const category = getWorkoutMaterialCategory(categoryId);
  if (!category) return renderNotFound(`/workout/materials/${categoryId}`);
  return `<div class="workout-materials">${heading('MOBILITY CATALOG', category.title, 'Pilih gerakan referensi, lalu tinjau rencana sebelum menambahkannya ke Workout.')}${breadcrumb([{ label: 'Workout', path: '/workout' }, { label: 'Materials', path: '/workout/materials' }, { label: category.title }])}<div class="workout-material-list-heading"><div><span class="material-kicker">${category.materials.length} VALIDATED MOVEMENTS</span><p>Konten statis versi ${escapeHtml(category.materials[0]?.contentVersion ? String(category.materials[0].contentVersion) : '1')} · perubahan katalog tidak mengubah entry yang sudah dijadwalkan.</p></div></div><div class="workout-material-list">${category.materials.map(renderMovementCard).join('')}</div></div>`;
}

function summaryItem(label: string, value: string) {
  return `<div class="workout-material-summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function scheduleDefault(material: WorkoutMaterial): ScheduleDraft {
  return {
    date: selectedDate(),
    sets: material.recommendation.sets ?? 0,
    reps: material.recommendation.reps ?? 0,
    durationMinutes: material.recommendation.durationMinutes ?? 0,
    note: '',
  };
}

function renderSchedulePanel(material: WorkoutMaterial) {
  const draft = scheduleDraft ?? scheduleDefault(material);
  const disabled = scheduleBusy ? ' disabled' : '';
  return `<section class="workout-material-schedule" aria-labelledby="workout-material-schedule-title"><div class="workout-material-schedule-heading"><div><p class="eyebrow">SCHEDULE REFERENCE</p><h2 id="workout-material-schedule-title">Add to Workout</h2><p>${escapeHtml(material.name)} akan dibuat sebagai entry terpisah tanpa mengubah katalog.</p></div><button type="button" class="feature-icon-button" data-workout-material-cancel aria-label="Cancel scheduling" title="Cancel">×</button></div>${scheduleError ? `<div class="workout-material-error" role="alert">${escapeHtml(scheduleError)}</div>` : ''}<form data-workout-material-schedule="${escapeHtml(material.id)}"><div class="workout-material-schedule-grid"><label><span>Date</span><input type="date" name="date" value="${escapeHtml(draft.date)}" required${disabled} /></label><label><span>Sets</span><input type="number" name="sets" min="0" max="999" value="${draft.sets}"${disabled} /></label><label><span>Reps</span><input type="number" name="reps" min="0" max="9999" value="${draft.reps}"${disabled} /></label><label><span>Minutes</span><input type="number" name="durationMinutes" min="0" max="1440" value="${draft.durationMinutes}"${disabled} /></label><label class="workout-material-note"><span>Scheduled note</span><textarea name="note" rows="3" maxlength="2000" placeholder="Catatan untuk entry ini, opsional"${disabled}>${escapeHtml(draft.note)}</textarea></label></div><div class="workout-material-schedule-summary"><span>Mobility · ${escapeHtml(material.name)}</span><strong>${escapeHtml(material.recommendation.text)}</strong></div><div class="feature-actions"><button class="feature-button primary" type="submit"${disabled}>${scheduleBusy ? 'Saving…' : 'Add to Workout'}</button><button class="feature-button" type="button" data-workout-material-cancel${disabled}>Cancel</button></div></form></section>`;
}

function renderDetail(categoryId: string, movementId: string) {
  const material = getWorkoutMaterial(categoryId, movementId);
  if (!material) return renderNotFound(`/workout/materials/${categoryId}/${movementId}`);
  const isScheduling = schedulingMaterialId === material.id;
  return `<div class="workout-materials workout-material-detail-page">${breadcrumb([{ label: 'Workout', path: '/workout' }, { label: 'Materials', path: '/workout/materials' }, { label: material.category, path: `/workout/materials/${material.category}` }, { label: material.name }])}<section class="workout-material-hero"><div><div class="workout-material-kicker-row"><span class="material-kicker">MOBILITY MOVEMENT</span>${material.difficulty ? `<span class="workout-material-difficulty">${escapeHtml(material.difficulty)}</span>` : ''}</div><h1>${escapeHtml(material.name)}</h1><p>${escapeHtml(material.shortDescription)}</p><div class="workout-material-hero-target"><span>Primary target</span><strong>${escapeHtml(material.primaryTarget)}</strong></div></div><div class="workout-material-hero-mark" aria-hidden="true">↗</div></section><section class="workout-material-reference-grid" aria-label="Movement summary">${summaryItem('Equipment', equipmentSummary(material))}${summaryItem('Body areas', material.bodyAreas.join(' · '))}${summaryItem('Recommendation', material.recommendation.text)}${summaryItem('Category', 'Mobility')}</section><div class="workout-material-detail-grid"><div><section class="workout-material-section" aria-labelledby="workout-material-steps"><div class="workout-material-section-heading"><p class="eyebrow">METHOD</p><h2 id="workout-material-steps">How to perform</h2></div><ol class="workout-material-steps">${material.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section><section class="workout-material-section" aria-labelledby="workout-material-cues"><div class="workout-material-section-heading"><p class="eyebrow">CONTROL</p><h2 id="workout-material-cues">Technique cues</h2></div><ul class="workout-material-list-points">${material.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join('')}</ul></section>${material.safetyNotes?.length ? `<section class="workout-material-section safety" aria-labelledby="workout-material-safety"><div class="workout-material-section-heading"><p class="eyebrow">AWARENESS</p><h2 id="workout-material-safety">Safety / important notes</h2></div><ul class="workout-material-list-points">${material.safetyNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></section>` : ''}</div><aside class="workout-material-action-column"><div class="workout-material-action-card">${isScheduling ? renderSchedulePanel(material) : `<p class="eyebrow">READY WHEN YOU ARE</p><h2>Make it part of your plan</h2><p>Gunakan referensi ini berulang kali. Setiap penambahan membuat Workout entry baru pada tanggal pilihan.</p>${recommendationMarkup(material)}<button type="button" class="feature-button primary" data-workout-material-add="${escapeHtml(material.id)}">Add to Workout</button>`}</div></aside></div></div>`;
}

function renderNotFound(path: string) {
  return `<div class="workout-materials">${heading('WORKOUT MATERIALS', 'Material tidak ditemukan', 'Route ini tidak cocok dengan katalog Workout yang tersedia.')}${breadcrumb([{ label: 'Workout', path: '/workout' }, { label: 'Materials', path: '/workout/materials' }, { label: 'Not found' }])}<article class="workout-material-not-found" role="alert"><span class="material-kicker">404 · WORKOUT CATALOG</span><h1>Route tidak tersedia</h1><p>Alamat <code>${escapeHtml(path)}</code> belum memiliki material. Katalog tetap aman dan entry Workout yang sudah ada tidak berubah.</p><div>${routeButton('/workout/materials', 'Kembali ke Workout Material List')} ${routeButton('/workout/materials/mobility', 'Buka Mobility')} ${routeButton('/workout', 'Buka Workout')}</div></article></div>`;
}

export function renderWorkoutMaterials(route: WorkoutMaterialRoute) {
  if (route.kind === 'not-found') return renderNotFound(route.path);
  if (route.kind === 'workout-material-categories') return renderCategoryList();
  if (route.kind === 'workout-material-list') return renderMovementList(route.categoryId);
  return renderDetail(route.categoryId, route.movementId);
}

function nonNegativeInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function resetScheduleState() {
  schedulingMaterialId = null;
  scheduleDraft = null;
  scheduleError = '';
  scheduleBusy = false;
}

export function bindWorkoutMaterialEvents(options: BindOptions) {
  document.querySelectorAll<HTMLButtonElement>('[data-workout-material-path]').forEach((button) => button.addEventListener('click', () => options.onNavigate(button.dataset.workoutMaterialPath ?? withDate('/workout/materials'))));
  document.querySelectorAll<HTMLButtonElement>('[data-workout-material-add]').forEach((button) => button.addEventListener('click', () => {
    const material = getWorkoutMaterial('mobility', button.dataset.workoutMaterialAdd ?? '');
    if (!material) return;
    schedulingMaterialId = material.id;
    scheduleDraft = scheduleDefault(material);
    scheduleError = '';
    options.rerender();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-workout-material-cancel]').forEach((button) => button.addEventListener('click', () => {
    if (scheduleBusy) return;
    resetScheduleState();
    options.rerender();
  }));
  document.querySelectorAll<HTMLFormElement>('[data-workout-material-schedule]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (scheduleBusy) return;
    const material = getWorkoutMaterial('mobility', form.dataset.workoutMaterialSchedule ?? '');
    if (!material) return;
    const data = new FormData(form);
    const draft: ScheduleDraft = {
      date: String(data.get('date') ?? '').trim(),
      sets: nonNegativeInteger(data.get('sets')),
      reps: nonNegativeInteger(data.get('reps')),
      durationMinutes: nonNegativeInteger(data.get('durationMinutes')),
      note: String(data.get('note') ?? '').trim(),
    };
    scheduleDraft = draft;
    if (!isValidLocalDate(draft.date)) {
      scheduleError = 'Pilih tanggal yang valid dalam format lokal YYYY-MM-DD.';
      options.rerender();
      return;
    }
    scheduleBusy = true;
    scheduleError = '';
    options.rerender();
    void (async () => {
      try {
        await options.scheduleWorkout({ date: draft.date, materialId: material.id, exercise: material.name, category: 'Mobility', sets: draft.sets, reps: draft.reps, durationMinutes: draft.durationMinutes, note: draft.note, completed: false });
        options.onStatus(true, '');
        resetScheduleState();
        options.onNavigate(`/workout?date=${encodeURIComponent(draft.date)}`);
      } catch (error) {
        scheduleBusy = false;
        scheduleError = error instanceof Error ? error.message : 'Workout belum dapat disimpan.';
        options.onStatus(false, scheduleError);
        options.rerender();
      }
    })();
  }));
}
