import {
  api,
  type DoingEnergyFocus,
  type DoingEntryResponse,
  type DoingInput,
  type DoingPriority,
  type DoingStatus,
} from './api';

type BindOptions = {
  rerender: () => void;
  onStatus: (online: boolean, error: string) => void;
};

type StatusFilter = 'all' | DoingStatus;
type PriorityFilter = 'all' | DoingPriority;
type DoingMutationKind = 'create' | 'edit' | 'toggle' | 'delete';
type DoingFormSnapshot = {
  values: Record<string, string>;
  checked: Record<string, boolean>;
};

const doingStorageKey = 'hermes-monitor-doing-v1';
const currentDate = new Date();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = dateKey(currentDate);
const categories = ['Work', 'Learning', 'Personal', 'Exercise', 'General'];
const statuses: DoingStatus[] = ['todo', 'doing', 'blocked', 'done'];
const priorities: DoingPriority[] = ['high', 'medium', 'low'];
const energyLevels: DoingEnergyFocus[] = ['deep', 'medium', 'light'];
const statusLabels: Record<DoingStatus, string> = { todo: 'Todo', doing: 'Doing', blocked: 'Blocked', done: 'Done' };
const priorityLabels: Record<DoingPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const energyLabels: Record<DoingEnergyFocus, string> = { deep: 'Deep focus', medium: 'Medium focus', light: 'Light focus' };
const mutationStatusLabels: Record<DoingMutationKind, string> = {
  create: 'Membuat task…',
  edit: 'Menyimpan perubahan task…',
  toggle: 'Memperbarui status task…',
  delete: 'Menghapus task…',
};
const priorityRank: Record<DoingPriority, number> = { high: 0, medium: 1, low: 2 };
const completedTaskState = { status: 'done', completed: true, progress: 100 } as const;

let selectedDate = todayKey;
let visibleMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let editingId: string | null = null;
let pendingDeleteId: string | null = null;
let deletePosition = { top: 0, left: 0 };
let listScrollTop = 0;
let statusFilter: StatusFilter = 'all';
let priorityFilter: PriorityFilter = 'all';
let filterQuery = '';
let composerOpen = false;
let createDraft: DoingInput | null = null;
let editDraft: DoingInput | null = null;
let createFormSnapshot: DoingFormSnapshot | null = null;
let editFormSnapshot: DoingFormSnapshot | null = null;
let actionPending = false;
let activeMutation: DoingMutationKind | null = null;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const expandedIds = new Set<string>();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
const icon = (name: string) => `<span class="ph ph-${name}" aria-hidden="true"></span>`;

function normalizeEntry(raw: Partial<DoingEntryResponse>): DoingEntryResponse {
  const status = statuses.includes(raw.status as DoingStatus) ? raw.status as DoingStatus : raw.completed ? 'done' : 'todo';
  const priority = priorities.includes(raw.priority as DoingPriority) ? raw.priority as DoingPriority : 'medium';
  const energyFocus = energyLevels.includes(raw.energyFocus as DoingEnergyFocus) ? raw.energyFocus as DoingEnergyFocus : 'medium';
  return {
    id: raw.id ?? '',
    ownerUserId: raw.ownerUserId,
    date: raw.date ?? todayKey,
    title: raw.title ?? 'Untitled task',
    status,
    priority,
    timeBlockStart: raw.timeBlockStart ?? '',
    timeBlockEnd: raw.timeBlockEnd ?? '',
    estimatedMinutes: raw.estimatedMinutes ?? 0,
    actualMinutes: raw.actualMinutes ?? 0,
    category: raw.category ?? 'General',
    project: raw.project ?? '',
    goalOutcome: raw.goalOutcome ?? '',
    progress: status === 'done' ? 100 : raw.progress ?? 0,
    energyFocus,
    dependency: raw.dependency ?? '',
    blockedBy: raw.blockedBy ?? '',
    note: raw.note ?? 'Task ditambahkan.',
    carryOver: raw.carryOver ?? false,
    completed: status === 'done',
    completedAt: raw.completedAt,
    createdAt: raw.createdAt ?? '',
  };
}

let entriesByDate: Record<string, DoingEntryResponse[]> = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(doingStorageKey) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, Partial<DoingEntryResponse>[]>).map(([date, entries]) => [date, Array.isArray(entries) ? entries.map(normalizeEntry) : []]));
  } catch {
    return {};
  }
})();

function saveEntries() {
  localStorage.setItem(doingStorageKey, JSON.stringify(entriesByDate));
}

function groupEntries(entries: DoingEntryResponse[]) {
  return entries.reduce<Record<string, DoingEntryResponse[]>>((grouped, raw) => {
    const entry = normalizeEntry(raw);
    (grouped[entry.date] ??= []).push(entry);
    return grouped;
  }, {});
}

function toInput(entry: DoingEntryResponse): DoingInput {
  return {
    date: entry.date,
    title: entry.title,
    status: entry.status,
    priority: entry.priority,
    timeBlockStart: entry.timeBlockStart,
    timeBlockEnd: entry.timeBlockEnd,
    estimatedMinutes: entry.estimatedMinutes,
    actualMinutes: entry.actualMinutes,
    category: entry.category,
    project: entry.project,
    goalOutcome: entry.goalOutcome,
    progress: entry.progress,
    energyFocus: entry.energyFocus,
    dependency: entry.dependency,
    blockedBy: entry.blockedBy,
    note: entry.note,
    carryOver: entry.carryOver,
    completed: entry.status === 'done',
  };
}

export async function syncDoingData() {
  const remoteEntries = (await api.doing()).entries;
  entriesByDate = groupEntries(remoteEntries);
  saveEntries();
}

function monthCells() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: leading + days }, (_, index) => index < leading ? null : index - leading + 1);
}

function optionList<T extends string>(values: T[], labels: Record<T, string>, selected: T) {
  return values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${labels[value]}</option>`).join('');
}

function durationLabel(minutes: number) {
  if (!minutes) return 'Belum diatur';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return [hours ? `${hours}j` : '', remaining ? `${remaining}m` : ''].filter(Boolean).join(' ');
}

function completedLabel(completedAt?: string) {
  if (!completedAt) return 'Belum selesai';
  return new Date(completedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderField(label: string, control: string, helper = '', errorName = '') {
  return `<label class="doing-field"><span>${label}</span>${control}${helper ? `<small>${helper}</small>` : ''}${errorName ? `<small class="doing-field-error" data-doing-field-error="${errorName}" aria-live="polite" hidden></small>` : ''}</label>`;
}

function renderEditor(entry?: DoingEntryResponse) {
  const disabledWhilePending = actionPending ? ' disabled' : '';
  const emptyDraft: DoingInput = {
    date: selectedDate,
    title: '',
    status: 'todo',
    priority: 'medium',
    timeBlockStart: '',
    timeBlockEnd: '',
    estimatedMinutes: 0,
    actualMinutes: 0,
    category: 'Work',
    project: '',
    goalOutcome: '',
    progress: 0,
    energyFocus: 'medium',
    dependency: '',
    blockedBy: '',
    note: '',
    carryOver: false,
    completed: false,
  };
  const draft: DoingInput = entry ? editDraft ?? toInput(entry) : createDraft ?? emptyDraft;
  const snapshot = entry ? editFormSnapshot : createFormSnapshot;
  const value = (name: string, fallback: string | number) => escapeHtml(snapshot?.values[name] ?? String(fallback));
  const textareaValue = (name: string, fallback: string) => {
    const raw = snapshot?.values[name] ?? fallback;
    return `${raw.startsWith('\n') ? '\n' : ''}${escapeHtml(raw)}`;
  };
  const selected = <T extends string>(name: string, fallback: T) => (snapshot?.values[name] as T | undefined) ?? fallback;
  const checked = (name: string, fallback: boolean) => snapshot?.checked[name] ?? fallback;
  const formIdentity = entry ? `data-doing-edit-form="${escapeHtml(entry.id)}"` : 'id="doing-form"';
  return `<form class="doing-editor" ${formIdentity} aria-busy="${actionPending}">
    <div class="doing-editor-heading"><div><h3>${entry ? 'Edit task' : 'Task baru'}</h3><p>Lengkapi bagian yang membantu keputusan. Field kosong tetap aman.</p></div><button type="button" class="doing-icon-button" data-doing-editor-cancel${disabledWhilePending} aria-label="Tutup editor">${icon('x')}</button></div>
    <div class="doing-editor-grid">
      <fieldset class="doing-field-group doing-field-group-main"${disabledWhilePending}><legend>Identitas</legend>
        ${renderField('Task', `<input name="title" value="${value('title', draft.title)}" placeholder="Contoh: Implement login with Google" required data-doing-max-code-points="160" data-doing-field-label="Task" />`, '', 'title')}
        <div class="doing-field-pair">
          ${renderField('Category / Context', `<input name="category" value="${value('category', draft.category)}" list="doing-category-options" required data-doing-max-code-points="60" data-doing-field-label="Category / Context" /><datalist id="doing-category-options">${categories.map((category) => `<option value="${category}"></option>`).join('')}</datalist>`, 'Pilih saran atau tulis kategori sendiri.', 'category')}
          ${renderField('Project', `<input name="project" value="${value('project', draft.project)}" placeholder="Zeno Dashboard" data-doing-max-code-points="160" data-doing-field-label="Project" />`, '', 'project')}
        </div>
        ${renderField('Goal / Outcome', `<textarea name="goalOutcome" placeholder="Kondisi yang dianggap selesai" data-doing-max-code-points="500" data-doing-field-label="Goal / Outcome">${textareaValue('goalOutcome', draft.goalOutcome)}</textarea>`, '', 'goalOutcome')}
      </fieldset>
      <fieldset class="doing-field-group"${disabledWhilePending}><legend>Rencana</legend>
        <div class="doing-field-triple">
          ${renderField('Status', `<select name="status">${optionList(statuses, statusLabels, selected('status', draft.status))}</select>`)}
          ${renderField('Priority', `<select name="priority">${optionList(priorities, priorityLabels, selected('priority', draft.priority))}</select>`)}
          ${renderField('Energy / Focus', `<select name="energyFocus">${optionList(energyLevels, energyLabels, selected('energyFocus', draft.energyFocus))}</select>`)}
        </div>
        <div class="doing-field-pair">
          ${renderField('Time Block Start', `<input type="time" name="timeBlockStart" value="${value('timeBlockStart', draft.timeBlockStart)}" />`)}
          ${renderField('Time Block End', `<input type="time" name="timeBlockEnd" value="${value('timeBlockEnd', draft.timeBlockEnd)}" />`, 'Isi keduanya atau kosongkan keduanya.')}
        </div>
        <div class="doing-field-triple">
          ${renderField('Estimated Time', `<input type="number" name="estimatedMinutes" value="${value('estimatedMinutes', draft.estimatedMinutes)}" min="0" max="2147483647" step="1" inputmode="numeric" />`, 'Menit')}
          ${renderField('Actual Time', `<input type="number" name="actualMinutes" value="${value('actualMinutes', draft.actualMinutes)}" min="0" max="2147483647" step="1" inputmode="numeric" />`, 'Menit')}
          ${renderField('Progress', `<input type="number" name="progress" value="${value('progress', draft.progress)}" min="0" max="100" step="1" inputmode="numeric" />`, '0 sampai 100%')}
        </div>
      </fieldset>
      <fieldset class="doing-field-group"${disabledWhilePending}><legend>Konteks kerja</legend>
        <div class="doing-field-pair">
          ${renderField('Dependency', `<textarea name="dependency" placeholder="Apa yang harus tersedia dahulu?" data-doing-max-code-points="500" data-doing-field-label="Dependency">${textareaValue('dependency', draft.dependency)}</textarea>`, '', 'dependency')}
          ${renderField('Blocked By', `<textarea name="blockedBy" placeholder="Apa yang menghentikan task?" data-doing-max-code-points="500" data-doing-field-label="Blocked By">${textareaValue('blockedBy', draft.blockedBy)}</textarea>`, '', 'blockedBy')}
        </div>
        ${renderField('Notes', `<textarea name="note" placeholder="Catatan kecil selama pengerjaan" data-doing-max-code-points="2000" data-doing-field-label="Notes">${textareaValue('note', draft.note)}</textarea>`, '', 'note')}
        <label class="doing-carry"><input type="checkbox" name="carryOver" ${checked('carryOver', draft.carryOver) ? 'checked' : ''} /><span><strong>Carry Over</strong><small>Task ini berasal dari hari sebelumnya.</small></span></label>
      </fieldset>
    </div>
    <div class="doing-editor-actions"><button type="button" class="doing-secondary-button" data-doing-editor-cancel${disabledWhilePending}>Batal</button><button type="submit" class="doing-primary-button"${disabledWhilePending}>${entry ? 'Simpan task' : 'Buat task'} ${icon('arrow-right')}</button></div>
  </form>`;
}

function renderMeta(iconName: string, label: string, value: string) {
  return `<div class="doing-meta-item">${icon(iconName)}<span><small>${label}</small><strong>${escapeHtml(value)}</strong></span></div>`;
}

function renderEntry(entry: DoingEntryResponse) {
  if (editingId === entry.id) return renderEditor(entry);
  const disabledWhilePending = actionPending ? ' disabled' : '';
  const expanded = expandedIds.has(entry.id);
  const timeBlock = entry.timeBlockStart && entry.timeBlockEnd ? `${entry.timeBlockStart}-${entry.timeBlockEnd}` : 'Fleksibel';
  const project = entry.project || 'Tanpa project';
  const detailId = `doing-details-${entry.id}`;
  return `<article class="doing-task-row status-${entry.status} ${entry.completed ? 'completed' : ''}">
    <div class="doing-task-main">
      <button class="doing-complete-button" data-doing-toggle="${escapeHtml(entry.id)}"${disabledWhilePending} aria-label="${entry.completed ? 'Buka kembali task' : 'Tandai task selesai'}" aria-pressed="${entry.completed}">${entry.completed ? icon('check') : icon('circle')}</button>
      <div class="doing-task-copy">
        <div class="doing-task-kicker"><span class="doing-status-pill status-${entry.status}">${statusLabels[entry.status]}</span><span class="doing-priority priority-${entry.priority}">${priorityLabels[entry.priority]}</span>${entry.carryOver ? '<span class="doing-carry-badge">Carry over</span>' : ''}</div>
        <h3>${escapeHtml(entry.title)}</h3>
        <p>${escapeHtml(project)}<span aria-hidden="true"> / </span>${escapeHtml(entry.category)}</p>
      </div>
      <div class="doing-task-time"><span>${icon('clock')} ${escapeHtml(timeBlock)}</span><small>${durationLabel(entry.actualMinutes)} / ${durationLabel(entry.estimatedMinutes)}</small></div>
      <div class="doing-task-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${entry.progress}" aria-label="Progress ${entry.progress}%"><strong>${entry.progress}%</strong><span><i style="width:${entry.progress}%"></i></span></div>
      <div class="doing-task-actions">
        <button class="doing-icon-button" data-doing-expand="${escapeHtml(entry.id)}" aria-expanded="${expanded}" aria-controls="${detailId}" title="${expanded ? 'Tutup detail' : 'Lihat detail'}" aria-label="${expanded ? 'Tutup detail task' : 'Lihat detail task'}">${icon(expanded ? 'caret-up' : 'caret-down')}</button>
        <button class="doing-icon-button" data-doing-edit="${escapeHtml(entry.id)}"${disabledWhilePending} title="Edit task" aria-label="Edit task">${icon('pencil-simple')}</button>
        <button class="doing-icon-button danger" data-doing-delete="${escapeHtml(entry.id)}"${disabledWhilePending} title="Hapus task" aria-label="Hapus task">${icon('trash')}</button>
      </div>
    </div>
    <div class="doing-task-details" id="${detailId}" ${expanded ? '' : 'hidden'}>
      <div class="doing-detail-grid">
        ${renderMeta('target', 'Goal / Outcome', entry.goalOutcome || 'Belum ditentukan')}
        ${renderMeta('brain', 'Energy / Focus', energyLabels[entry.energyFocus])}
        ${renderMeta('git-branch', 'Dependency', entry.dependency || 'Tidak ada')}
        ${renderMeta('warning', 'Blocked By', entry.blockedBy || 'Tidak ada')}
        ${renderMeta('note', 'Notes', entry.note || 'Tidak ada catatan')}
        ${renderMeta('check-circle', 'Completed At', completedLabel(entry.completedAt))}
      </div>
      ${entry.status === 'blocked' && entry.blockedBy ? `<div class="doing-blocked-callout">${icon('warning-diamond')}<span><strong>Task terblokir</strong>${escapeHtml(entry.blockedBy)}</span></div>` : ''}
    </div>
  </article>`;
}

function renderDeletePopover() {
  const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === pendingDeleteId);
  if (!entry) return '';
  const disabledWhilePending = actionPending ? ' disabled' : '';
  return `<button class="delete-popover-backdrop" data-doing-delete-cancel${disabledWhilePending} aria-label="Batalkan hapus" aria-hidden="true" tabindex="-1"></button><div class="delete-popover" role="dialog" aria-modal="true" aria-labelledby="doing-delete-title" aria-describedby="doing-delete-description" aria-busy="${actionPending}" data-doing-delete-dialog style="top:${deletePosition.top}px;left:${deletePosition.left}px"><strong id="doing-delete-title">Hapus task?</strong><span id="doing-delete-description">${escapeHtml(entry.title)}</span><div><button class="delete-confirm" data-doing-delete-confirm${disabledWhilePending}>Hapus</button><button data-doing-delete-cancel${disabledWhilePending}>Batal</button></div></div>`;
}

function filteredEntries(entries: DoingEntryResponse[]) {
  const query = filterQuery.trim().toLocaleLowerCase('id-ID');
  return entries
    .filter((entry) => statusFilter === 'all' || entry.status === statusFilter)
    .filter((entry) => priorityFilter === 'all' || entry.priority === priorityFilter)
    .filter((entry) => !query || [entry.title, entry.project, entry.category, entry.goalOutcome, entry.note].some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt.localeCompare(b.createdAt));
}

export function renderDoingPage() {
  const disabledWhilePending = actionPending ? ' disabled' : '';
  const selectedEntries = entriesByDate[selectedDate] ?? [];
  const visibleEntries = filteredEntries(selectedEntries);
  const allEntries = Object.values(entriesByDate).flat();
  const activeCount = allEntries.filter((entry) => entry.status === 'doing').length;
  const blockedCount = allEntries.filter((entry) => entry.status === 'blocked').length;
  const unfinishedEntries = allEntries.filter((entry) => entry.status !== 'done').length;
  const focusMinutes = allEntries.filter((entry) => entry.date === selectedDate).reduce((total, entry) => total + entry.estimatedMinutes, 0);
  const monthLabel = visibleMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="page-heading doing-page-heading"><div><p class="eyebrow">TASK CONTROL</p><h1>Doing workspace</h1><p class="subheading">Atur prioritas, waktu, konteks, dan hasil kerja dari satu tempat.</p></div><div class="connection"><span class="pulse"></span><span>${unfinishedEntries} belum selesai</span></div></div>
    <div class="doing-summary" aria-label="Ringkasan task">
      <div><span>Aktif</span><strong>${activeCount}</strong></div>
      <div><span>Terblokir</span><strong>${blockedCount}</strong></div>
      <div><span>Rencana hari ini</span><strong>${durationLabel(focusMinutes)}</strong></div>
      <div><span>Total task</span><strong>${allEntries.length}</strong></div>
    </div>
    <div class="doing-workspace">
      <aside class="doing-planner-rail calendar-panel"><div class="calendar-header"><button class="calendar-nav" data-doing-month-prev aria-label="Bulan sebelumnya">${icon('caret-left')}</button><div><p class="eyebrow">KALENDER</p><h2>${escapeHtml(monthLabel)}</h2></div><button class="calendar-nav" data-doing-month-next aria-label="Bulan berikutnya">${icon('caret-right')}</button></div><p class="doing-calendar-scroll-hint" id="doing-calendar-scroll-hint">Geser kalender ke samping</p><div class="doing-calendar-scroll" role="region" tabindex="0" aria-label="Kalender task" aria-describedby="doing-calendar-scroll-hint"><div class="calendar-weekdays"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div><div class="calendar-grid">${monthCells().map((day) => {
        if (!day) return '<span class="calendar-day empty-day"></span>';
        const key = dateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
        const entries = entriesByDate[key] ?? [];
        const unfinishedCount = entries.filter((entry) => entry.status !== 'done').length;
        const allCompleted = entries.length > 0 && unfinishedCount === 0;
        return `<button class="calendar-day ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''} ${entries.length ? 'has-lessons' : ''} ${allCompleted ? 'all-completed' : ''}" data-doing-day="${key}" title="${allCompleted ? 'Semua task selesai' : entries.length ? `${unfinishedCount} task belum selesai` : 'Tidak ada task'}"><span>${day}</span>${entries.length ? `<i aria-label="${allCompleted ? 'Semua selesai' : `${unfinishedCount} task belum selesai`}">${allCompleted ? '✓' : unfinishedCount}</i>` : ''}</button>`;
      }).join('')}</div></div><div class="calendar-legend"><span><i class="legend-progress">3</i> Belum selesai</span><span><i class="legend-complete">✓</i> Selesai</span></div><button class="today-button" data-doing-today>${icon('crosshair')} Hari ini</button></aside>
      <section class="doing-board" aria-busy="${actionPending}">
        <div class="doing-board-heading"><div><p>${escapeHtml(selectedLabel)}</p><h2>${selectedEntries.length} task terjadwal</h2></div><button class="doing-primary-button" data-doing-new${disabledWhilePending}>${icon('plus')} Task baru</button></div>
        <span class="doing-mutation-status" role="status" aria-live="polite" aria-atomic="true">${activeMutation ? mutationStatusLabels[activeMutation] : ''}</span>
        <div class="doing-command-bar">
          <label><span class="sr-only">Cari task</span>${icon('magnifying-glass')}<input type="search" value="${escapeHtml(filterQuery)}" placeholder="Cari task atau project" data-doing-query /></label>
          <select data-doing-status-filter aria-label="Filter status"><option value="all">Semua status</option>${optionList(statuses, statusLabels, statusFilter === 'all' ? 'todo' : statusFilter).replace(statusFilter === 'all' ? 'value="todo" selected' : '__never__', statusFilter === 'all' ? 'value="todo"' : '__never__')}</select>
          <select data-doing-priority-filter aria-label="Filter priority"><option value="all">Semua priority</option>${optionList(priorities, priorityLabels, priorityFilter === 'all' ? 'high' : priorityFilter).replace(priorityFilter === 'all' ? 'value="high" selected' : '__never__', priorityFilter === 'all' ? 'value="high"' : '__never__')}</select>
          <span>${visibleEntries.length} tampil</span>
        </div>
        ${composerOpen ? renderEditor() : ''}
        <div class="doing-list">${visibleEntries.length ? visibleEntries.map(renderEntry).join('') : `<div class="doing-empty">${icon('tray')}<strong>Tidak ada task yang cocok</strong><span>Ubah filter atau buat task untuk tanggal ini.</span><button class="doing-secondary-button" data-doing-new${disabledWhilePending}>Buat task</button></div>`}</div>
      </section>
    </div>${renderDeletePopover()}`;
}

function captureScroll() {
  const list = document.querySelector<HTMLElement>('.doing-list');
  if (list) listScrollTop = list.scrollTop;
}

function snapshotDoingForm(form: HTMLFormElement): DoingFormSnapshot {
  const values: Record<string, string> = {};
  const checked: Record<string, boolean> = {};
  Array.from(form.elements).forEach((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name) return;
    if (control instanceof HTMLInputElement && control.type === 'checkbox') checked[control.name] = control.checked;
    else values[control.name] = control.value;
  });
  return { values, checked };
}

function captureLiveDoingDrafts() {
  const createForm = document.querySelector<HTMLFormElement>('#doing-form');
  if (createForm) createFormSnapshot = snapshotDoingForm(createForm);
  const editForm = document.querySelector<HTMLFormElement>('[data-doing-edit-form]');
  if (editForm) editFormSnapshot = snapshotDoingForm(editForm);
}

function rerenderPreservingDraft(options: BindOptions) {
  captureLiveDoingDrafts();
  options.rerender();
}

function focusTaskAction(action: 'edit' | 'delete' | 'expand' | 'toggle', id: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-doing-${action}="${CSS.escape(id)}"]`);
  if (!button) return false;
  button.focus();
  return true;
}

function focusStableDoingControl() {
  document.querySelector<HTMLButtonElement>('[data-doing-new]')?.focus();
}

function closeDeleteDialog(options: BindOptions) {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  rerenderPreservingDraft(options);
  if (id) requestAnimationFrame(() => focusTaskAction('delete', id));
}

function restoreScroll() {
  const apply = () => {
    const list = document.querySelector<HTMLElement>('.doing-list');
    if (list) list.scrollTop = listScrollTop;
  };
  apply();
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
  window.setTimeout(apply, 80);
}

async function runAction(kind: DoingMutationKind, action: () => Promise<void>, options: BindOptions) {
  if (actionPending) return false;
  actionPending = true;
  activeMutation = kind;
  rerenderPreservingDraft(options);
  try {
    await action();
    options.onStatus(true, '');
    return true;
  } catch (error) {
    options.onStatus(false, error instanceof Error ? error.message : 'Backend tidak tersedia');
    return false;
  } finally {
    actionPending = false;
    activeMutation = null;
    rerenderPreservingDraft(options);
  }
}

async function persistEntry(id: string, input: DoingInput, options: BindOptions, focusAction: 'edit' | 'toggle' = 'edit') {
  const wasEditing = editingId === id;
  if (wasEditing) editDraft = input;
  const succeeded = await runAction(focusAction === 'toggle' ? 'toggle' : 'edit', async () => {
    const updated = normalizeEntry(await api.updateDoing(id, input));
    entriesByDate[updated.date] = (entriesByDate[updated.date] ?? []).map((candidate) => candidate.id === updated.id ? updated : candidate);
    if (wasEditing) {
      editingId = null;
      editDraft = null;
      editFormSnapshot = null;
    }
    saveEntries();
  }, options);
  requestAnimationFrame(() => {
    if (succeeded && wasEditing) focusTaskAction('edit', id) || focusStableDoingControl();
    else if (succeeded || !wasEditing) focusTaskAction(focusAction, id) || focusStableDoingControl();
    else document.querySelector<HTMLInputElement>(`[data-doing-edit-form="${CSS.escape(id)}"] input[name="title"]`)?.focus();
  });
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function validateDoingTextControl(formElement: HTMLFormElement, control: HTMLInputElement | HTMLTextAreaElement) {
  const limit = Number(control.dataset.doingMaxCodePoints);
  if (!Number.isFinite(limit)) return true;
  const count = codePointLength(control.value.trim());
  const label = control.dataset.doingFieldLabel ?? control.name;
  const message = count > limit ? `${label} maksimal ${limit} karakter Unicode; saat ini ${count}.` : '';
  control.setCustomValidity(message);
  const error = formElement.querySelector<HTMLElement>(`[data-doing-field-error="${CSS.escape(control.name)}"]`);
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
  return !message;
}

function validateDoingTextLimits(formElement: HTMLFormElement) {
  let valid = true;
  formElement.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-doing-max-code-points]').forEach((control) => {
    if (!validateDoingTextControl(formElement, control)) valid = false;
  });
  return valid;
}

function parseDoingForm(formElement: HTMLFormElement, date: string): DoingInput | null {
  const form = new FormData(formElement);
  const title = String(form.get('title') ?? '').trim();
  const timeBlockStart = String(form.get('timeBlockStart') ?? '');
  const timeBlockEnd = String(form.get('timeBlockEnd') ?? '');
  const endInput = formElement.elements.namedItem('timeBlockEnd') as HTMLInputElement;
  endInput.setCustomValidity('');
  if ((timeBlockStart && !timeBlockEnd) || (!timeBlockStart && timeBlockEnd)) endInput.setCustomValidity('Isi waktu mulai dan selesai secara berpasangan.');
  if (timeBlockStart && timeBlockEnd && timeBlockStart >= timeBlockEnd) endInput.setCustomValidity('Waktu selesai harus setelah waktu mulai.');
  const textLimitsValid = validateDoingTextLimits(formElement);
  if (!title || !textLimitsValid || !formElement.reportValidity()) return null;
  const status = String(form.get('status')) as DoingStatus;
  const progress = Math.min(100, Math.max(0, Number(form.get('progress')) || 0));
  return {
    date,
    title,
    status,
    priority: String(form.get('priority')) as DoingPriority,
    timeBlockStart,
    timeBlockEnd,
    estimatedMinutes: Math.max(0, Number(form.get('estimatedMinutes')) || 0),
    actualMinutes: Math.max(0, Number(form.get('actualMinutes')) || 0),
    category: String(form.get('category') ?? 'General'),
    project: String(form.get('project') ?? '').trim(),
    goalOutcome: String(form.get('goalOutcome') ?? '').trim(),
    progress: status === 'done' ? 100 : progress,
    energyFocus: String(form.get('energyFocus')) as DoingEnergyFocus,
    dependency: String(form.get('dependency') ?? '').trim(),
    blockedBy: String(form.get('blockedBy') ?? '').trim(),
    note: String(form.get('note') ?? '').trim() || 'Task ditambahkan.',
    carryOver: form.get('carryOver') === 'on',
    completed: status === 'done',
  };
}

export function bindDoingEvents(options: BindOptions) {
  document.querySelector<HTMLButtonElement>('[data-doing-month-prev]')?.addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-doing-month-prev]')?.focus());
  });
  document.querySelector<HTMLButtonElement>('[data-doing-month-next]')?.addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-doing-month-next]')?.focus());
  });
  document.querySelector<HTMLButtonElement>('[data-doing-today]')?.addEventListener('click', () => {
    visibleMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    selectedDate = todayKey;
    listScrollTop = 0;
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-doing-today]')?.focus());
  });
  document.querySelectorAll<HTMLButtonElement>('[data-doing-day]').forEach((button) => button.addEventListener('click', () => {
    const date = button.dataset.doingDay!;
    selectedDate = date;
    listScrollTop = 0;
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-doing-day="${CSS.escape(date)}"]`)?.focus());
  }));
  document.querySelector<HTMLSelectElement>('[data-doing-status-filter]')?.addEventListener('change', (event) => {
    statusFilter = (event.target as HTMLSelectElement).value as StatusFilter;
    listScrollTop = 0;
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('[data-doing-status-filter]')?.focus());
  });
  document.querySelector<HTMLSelectElement>('[data-doing-priority-filter]')?.addEventListener('change', (event) => {
    priorityFilter = (event.target as HTMLSelectElement).value as PriorityFilter;
    listScrollTop = 0;
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('[data-doing-priority-filter]')?.focus());
  });
  document.querySelector<HTMLInputElement>('[data-doing-query]')?.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    filterQuery = input.value;
    const cursor = input.selectionStart ?? filterQuery.length;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      listScrollTop = 0;
      rerenderPreservingDraft(options);
      requestAnimationFrame(() => {
        const nextInput = document.querySelector<HTMLInputElement>('[data-doing-query]');
        nextInput?.focus();
        nextInput?.setSelectionRange(cursor, cursor);
      });
    }, 120);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-doing-new]').forEach((button) => button.addEventListener('click', () => {
    const opening = !composerOpen;
    composerOpen = opening;
    editingId = null;
    createDraft = null;
    editDraft = null;
    createFormSnapshot = null;
    editFormSnapshot = null;
    listScrollTop = 0;
    options.rerender();
    requestAnimationFrame(() => opening
      ? document.querySelector<HTMLInputElement>('#doing-form input[name="title"]')?.focus()
      : document.querySelector<HTMLButtonElement>('[data-doing-new]')?.focus());
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-expand]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const id = button.dataset.doingExpand!;
    expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => focusTaskAction('expand', id));
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-edit]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const id = button.dataset.doingEdit!;
    editingId = id;
    composerOpen = false;
    editDraft = null;
    createDraft = null;
    editFormSnapshot = null;
    createFormSnapshot = null;
    options.rerender();
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-doing-edit-form="${CSS.escape(id)}"] input[name="title"]`)?.focus());
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-editor-cancel]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const id = editingId;
    const wasComposerOpen = composerOpen;
    editingId = null;
    composerOpen = false;
    editDraft = null;
    createDraft = null;
    editFormSnapshot = null;
    createFormSnapshot = null;
    options.rerender();
    requestAnimationFrame(() => id ? focusTaskAction('edit', id) : wasComposerOpen ? document.querySelector<HTMLButtonElement>('[data-doing-new]')?.focus() : undefined);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-toggle]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === button.dataset.doingToggle);
    if (!entry) return;
    const completing = entry.status !== 'done';
    const nextState = completing ? completedTaskState : { status: 'doing' as const, completed: false, progress: Math.min(entry.progress, 99) };
    captureLiveDoingDrafts();
    void persistEntry(entry.id, { ...toInput(entry), ...nextState }, options, 'toggle');
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-delete]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const rect = button.getBoundingClientRect();
    pendingDeleteId = button.dataset.doingDelete!;
    deletePosition = { top: rect.top - 8, left: rect.right };
    rerenderPreservingDraft(options);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-doing-delete-confirm]')?.focus());
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-delete-cancel]').forEach((button) => button.addEventListener('click', () => closeDeleteDialog(options)));
  document.querySelector<HTMLElement>('[data-doing-delete-dialog]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDeleteDialog(options);
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.querySelector<HTMLButtonElement>('[data-doing-delete-confirm]')?.addEventListener('click', () => {
    const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === pendingDeleteId);
    if (!entry) return;
    void runAction('delete', async () => {
      await api.deleteDoing(entry.id, entry.date);
      entriesByDate[entry.date] = (entriesByDate[entry.date] ?? []).filter((candidate) => candidate.id !== entry.id);
      expandedIds.delete(entry.id);
      pendingDeleteId = null;
      saveEntries();
    }, options).then(() => requestAnimationFrame(() => {
      if (pendingDeleteId) document.querySelector<HTMLButtonElement>('[data-doing-delete-confirm]')?.focus();
      else document.querySelector<HTMLButtonElement>('[data-doing-new]')?.focus();
    }));
  });
  document.querySelector<HTMLFormElement>('[data-doing-edit-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    captureScroll();
    const formElement = event.currentTarget as HTMLFormElement;
    editFormSnapshot = snapshotDoingForm(formElement);
    const current = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === formElement.dataset.doingEditForm);
    if (!current) return;
    const input = parseDoingForm(formElement, current.date);
    if (input) void persistEntry(current.id, input, options);
  });
  document.querySelector<HTMLFormElement>('#doing-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    createFormSnapshot = snapshotDoingForm(formElement);
    const input = parseDoingForm(formElement, selectedDate);
    if (!input) return;
    createDraft = input;
    void runAction('create', async () => {
      const created = normalizeEntry(await api.createDoing(input));
      entriesByDate[created.date] = [...(entriesByDate[created.date] ?? []), created];
      composerOpen = false;
      createDraft = null;
      createFormSnapshot = null;
      saveEntries();
    }, options).then((succeeded) => requestAnimationFrame(() => {
      if (succeeded) document.querySelector<HTMLButtonElement>('[data-doing-new]')?.focus();
      else document.querySelector<HTMLInputElement>('#doing-form input[name="title"]')?.focus();
    }));
  });
  document.querySelectorAll<HTMLFormElement>('#doing-form, [data-doing-edit-form]').forEach((form) => {
    const capture = () => {
      if (form.id === 'doing-form') createFormSnapshot = snapshotDoingForm(form);
      else editFormSnapshot = snapshotDoingForm(form);
    };
    form.addEventListener('input', capture);
    form.addEventListener('input', (event) => {
      const control = event.target;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) validateDoingTextControl(form, control);
    });
    form.addEventListener('change', capture);
  });
  restoreScroll();
}
