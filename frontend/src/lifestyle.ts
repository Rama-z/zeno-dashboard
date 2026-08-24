import {
  api,
  type JournalEntryResponse,
  type SpendingEntryResponse,
  type WorkoutEntryResponse,
} from './api';

export type LifestylePage = 'workout' | 'journaling' | 'spending';
type JournalTab = 'archive' | 'write';
type SpendingRange = 'day' | 'week' | 'month' | 'year';
type BindOptions = {
  rerender: () => void;
  onStatus: (online: boolean, error: string) => void;
};

type JournalDraft = {
  date: string;
  title: string;
  content: string;
  mood: string;
  tags: string;
};

const workoutStorageKey = 'hermes-monitor-workouts-v1';
const journalStorageKey = 'hermes-monitor-journals-v1';
const spendingStorageKey = 'hermes-monitor-spending-v1';
const journalDraftStorageKey = 'hermes-monitor-journal-draft-v1';
const currentDate = new Date();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = dateKey(currentDate);

function loadArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function loadJournalDraft(): JournalDraft {
  const fallback: JournalDraft = { date: todayKey, title: '', content: '', mood: 'Focused', tags: '' };
  try {
    const value = JSON.parse(localStorage.getItem(journalDraftStorageKey) ?? '{}') as Partial<JournalDraft>;
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(value.date ?? '') ? value.date! : fallback.date,
      title: typeof value.title === 'string' ? value.title : '',
      content: typeof value.content === 'string' ? value.content : '',
      mood: typeof value.mood === 'string' && value.mood ? value.mood : fallback.mood,
      tags: typeof value.tags === 'string' ? value.tags : '',
    };
  } catch {
    return fallback;
  }
}

let workouts = loadArray<WorkoutEntryResponse>(workoutStorageKey);
let journals = loadArray<JournalEntryResponse>(journalStorageKey);
let spending = loadArray<SpendingEntryResponse>(spendingStorageKey);

let selectedWorkoutDate = todayKey;
let workoutMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let editingWorkoutId: string | null = null;
let pendingWorkoutDeleteId: string | null = null;

function journalTabFromLocation(): JournalTab {
  return new URLSearchParams(window.location.search).get('view') === 'write' ? 'write' : 'archive';
}

let journalTab: JournalTab = journalTabFromLocation();
let journalDraft = loadJournalDraft();
let journalSearch = '';
let journalFilterDate = '';
let journalPreviewVisible = true;
let journalFocusMode = false;
let expandedJournalIds = new Set<string>();
let pendingJournalDeleteId: string | null = null;

let spendingAnchorDate = todayKey;
let spendingRange: SpendingRange = 'month';
let spendingSearch = '';
let pendingSpendingDeleteId: string | null = null;

const scrollPositions: Record<LifestylePage, number> = { workout: 0, journaling: 0, spending: 0 };

export function isLifestylePage(value: string): value is LifestylePage {
  return value === 'workout' || value === 'journaling' || value === 'spending';
}

export function syncLifestyleRoute(page: LifestylePage) {
  if (page === 'journaling') journalTab = journalTabFromLocation();
}

export async function syncLifestyleData() {
  const [workoutResponse, journalResponse, spendingResponse] = await Promise.all([
    api.workouts(),
    api.journals(),
    api.spending(),
  ]);
  workouts = workoutResponse.entries;
  journals = journalResponse.entries;
  spending = spendingResponse.entries;
  localStorage.setItem(workoutStorageKey, JSON.stringify(workouts));
  localStorage.setItem(journalStorageKey, JSON.stringify(journals));
  localStorage.setItem(spendingStorageKey, JSON.stringify(spending));
}

export function lifestyleRecordCount(page: LifestylePage) {
  if (page === 'workout') return workouts.length;
  if (page === 'journaling') return journals.length;
  return spending.length;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function longDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: leading + days }, (_, index) => index < leading ? null : index - leading + 1);
}

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function saveWorkouts() {
  localStorage.setItem(workoutStorageKey, JSON.stringify(workouts));
}

function saveJournals() {
  localStorage.setItem(journalStorageKey, JSON.stringify(journals));
}

function saveSpending() {
  localStorage.setItem(spendingStorageKey, JSON.stringify(spending));
}

async function runAction(action: () => Promise<void>, options: BindOptions) {
  try {
    await action();
    options.onStatus(true, '');
  } catch (error) {
    options.onStatus(false, error instanceof Error ? error.message : 'Backend tidak tersedia');
  }
  options.rerender();
}

function captureScroll(page: LifestylePage, selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) scrollPositions[page] = element.scrollTop;
}

function restoreScroll(page: LifestylePage, selector: string) {
  const apply = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.scrollTop = scrollPositions[page];
  };
  apply();
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
  window.setTimeout(apply, 80);
}

function workoutEntryMarkup(entry: WorkoutEntryResponse) {
  if (editingWorkoutId === entry.id) {
    return `<form class="workout-entry workout-edit-form" data-workout-edit-form="${escapeHtml(entry.id)}">
      <div class="workout-edit-main">
        <input name="exercise" value="${escapeHtml(entry.exercise)}" aria-label="Exercise" required maxlength="160" />
        <select name="category" aria-label="Workout category">${['Strength', 'Cardio', 'Mobility', 'Sport', 'Recovery', 'General'].map((category) => `<option ${entry.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select>
        <input name="note" value="${escapeHtml(entry.note)}" aria-label="Workout note" maxlength="2000" />
      </div>
      <div class="workout-edit-numbers"><label>Set<input type="number" name="sets" min="0" max="999" value="${entry.sets}" /></label><label>Reps<input type="number" name="reps" min="0" max="9999" value="${entry.reps}" /></label><label>Menit<input type="number" name="durationMinutes" min="0" max="1440" value="${entry.durationMinutes}" /></label></div>
      <div class="feature-actions"><button class="feature-button primary" type="submit">Simpan</button><button class="feature-button" type="button" data-workout-edit-cancel>Batal</button></div>
    </form>`;
  }
  const details = [entry.sets ? `${entry.sets} set` : '', entry.reps ? `${entry.reps} reps` : '', entry.durationMinutes ? `${entry.durationMinutes} menit` : ''].filter(Boolean).join(' · ');
  return `<article class="workout-entry ${entry.completed ? 'completed' : ''}">
    <button class="workout-check" data-workout-toggle="${escapeHtml(entry.id)}" aria-label="${entry.completed ? 'Tandai belum selesai' : 'Tandai selesai'}" aria-pressed="${entry.completed}">${entry.completed ? '✓' : ''}</button>
    <div class="workout-copy"><div class="feature-meta"><span>${escapeHtml(entry.category)}</span>${details ? `<i>${escapeHtml(details)}</i>` : ''}</div><h3>${escapeHtml(entry.exercise)}</h3>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}</div>
    <div class="feature-actions icon-actions"><button class="feature-icon-button" data-workout-edit="${escapeHtml(entry.id)}" title="Edit workout" aria-label="Edit workout">✎</button><button class="feature-icon-button danger" data-workout-delete="${escapeHtml(entry.id)}" title="Hapus workout" aria-label="Hapus workout">⌫</button></div>
    ${pendingWorkoutDeleteId === entry.id ? `<div class="inline-confirm"><span>Hapus workout ini?</span><div><button class="danger" data-workout-delete-confirm="${escapeHtml(entry.id)}">Hapus</button><button data-workout-delete-cancel>Batal</button></div></div>` : ''}
  </article>`;
}

function renderWorkout() {
  const selectedEntries = workouts.filter((entry) => entry.date === selectedWorkoutDate);
  const monthLabel = workoutMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const completeCount = selectedEntries.filter((entry) => entry.completed).length;
  return `<div class="page-heading"><div><p class="eyebrow">MOVEMENT LOG</p><h1>Workout</h1><p class="subheading">Rencanakan latihan, pantau progres, dan tandai sesi yang selesai per tanggal.</p></div><div class="connection"><span class="pulse"></span><span>${workouts.length} sesi tercatat</span></div></div>
    <div class="workout-metrics"><div class="mini-stat"><span>Sesi hari terpilih</span><strong>${selectedEntries.length}</strong></div><div class="mini-stat"><span>Selesai</span><strong>${completeCount}/${selectedEntries.length}</strong></div><div class="mini-stat"><span>Durasi</span><strong>${selectedEntries.reduce((total, entry) => total + entry.durationMinutes, 0)}<small> mnt</small></strong></div></div>
    <div class="lifestyle-calendar-layout">
      <section class="lifestyle-panel lifestyle-calendar"><div class="calendar-header"><button class="calendar-nav" data-workout-month-prev aria-label="Bulan sebelumnya">‹</button><div><p class="eyebrow">WORKOUT CALENDAR</p><h2>${escapeHtml(monthLabel)}</h2></div><button class="calendar-nav" data-workout-month-next aria-label="Bulan berikutnya">›</button></div><div class="calendar-weekdays"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div><div class="calendar-grid">${monthCells(workoutMonth).map((day) => {
        if (!day) return '<span class="calendar-day empty-day"></span>';
        const key = dateKey(new Date(workoutMonth.getFullYear(), workoutMonth.getMonth(), day));
        const entries = workouts.filter((entry) => entry.date === key);
        const unfinishedCount = entries.filter((entry) => !entry.completed).length;
        const allComplete = entries.length > 0 && unfinishedCount === 0;
        return `<button class="calendar-day ${key === selectedWorkoutDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''} ${entries.length ? 'has-lessons' : ''} ${allComplete ? 'all-completed' : ''}" data-workout-day="${key}" aria-label="${day}, ${allComplete ? 'semua workout selesai' : `${unfinishedCount} workout belum selesai`}"><span>${day}</span>${entries.length ? `<i aria-label="${allComplete ? 'Semua selesai' : `${unfinishedCount} workout belum selesai`}">${allComplete ? '✓' : unfinishedCount}</i>` : ''}</button>`;
      }).join('')}</div><button class="today-button" data-workout-today>Kembali ke hari ini</button></section>
      <section class="lifestyle-panel workout-detail"><div class="detail-heading"><div><p class="eyebrow">SELECTED DAY</p><h2>${escapeHtml(longDate(selectedWorkoutDate))}</h2></div><span class="date-badge">${selectedEntries.length} sesi</span></div><div class="workout-list">${selectedEntries.length ? selectedEntries.map(workoutEntryMarkup).join('') : '<div class="feature-empty"><strong>Belum ada workout</strong><span>Tambahkan latihan pertama untuk tanggal ini.</span></div>'}</div>
      <form id="workout-form" class="workout-form"><div class="form-section-title"><span>+</span><div><strong>Tambah workout</strong><small>Detail latihan untuk hari terpilih</small></div></div><div class="workout-form-grid"><input name="exercise" placeholder="Nama latihan" required maxlength="160" /><select name="category" aria-label="Kategori"><option>Strength</option><option>Cardio</option><option>Mobility</option><option>Sport</option><option>Recovery</option><option>General</option></select><label><span>Set</span><input type="number" name="sets" value="3" min="0" max="999" /></label><label><span>Reps</span><input type="number" name="reps" value="10" min="0" max="9999" /></label><label><span>Menit</span><input type="number" name="durationMinutes" value="30" min="0" max="1440" /></label><input class="workout-note-input" name="note" placeholder="Catatan opsional" maxlength="2000" /><button class="feature-button primary" type="submit">Tambah sesi</button></div></form></section>
    </div>`;
}

function inlineMarkdown(value: string) {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

export function renderJournalMarkdown(source: string) {
  const lines = escapeHtml(source).split('\n');
  const output: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let inCode = false;
  const closeList = () => { if (list) { output.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      output.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      output.push(`${line}\n`);
      continue;
    }
    const unordered = line.match(/^\s*-\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      const nextList: 'ul' | 'ol' = unordered ? 'ul' : 'ol';
      if (list !== nextList) { closeList(); output.push(`<${nextList}>`); list = nextList; }
      const item = (unordered?.[1] ?? ordered?.[1] ?? '').replace(/^\[([ xX])\]\s*/, (_match, checked: string) => `<span class="md-check ${checked.toLowerCase() === 'x' ? 'checked' : ''}">${checked.toLowerCase() === 'x' ? '✓' : ''}</span>`);
      output.push(`<li>${inlineMarkdown(item)}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    if (line.startsWith('### ')) output.push(`<h4>${inlineMarkdown(line.slice(4))}</h4>`);
    else if (line.startsWith('## ')) output.push(`<h3>${inlineMarkdown(line.slice(3))}</h3>`);
    else if (line.startsWith('# ')) output.push(`<h2>${inlineMarkdown(line.slice(2))}</h2>`);
    else if (line.startsWith('&gt; ')) output.push(`<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`);
    else output.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  if (inCode) output.push('</code></pre>');
  return output.join('');
}

function journalCard(entry: JournalEntryResponse) {
  const expanded = expandedJournalIds.has(entry.id);
  const tags = entry.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return `<article class="journal-card ${expanded ? 'expanded' : ''}"><div class="journal-card-head"><div><span class="mood-pill">${escapeHtml(entry.mood || 'Neutral')}</span><h3>${escapeHtml(entry.title)}</h3></div><div class="feature-actions icon-actions"><button class="feature-icon-button" data-journal-expand="${escapeHtml(entry.id)}" aria-label="${expanded ? 'Ringkas jurnal' : 'Buka jurnal'}" title="${expanded ? 'Ringkas' : 'Baca lengkap'}">${expanded ? '−' : '↗'}</button><button class="feature-icon-button danger" data-journal-delete="${escapeHtml(entry.id)}" aria-label="Hapus jurnal" title="Hapus jurnal">⌫</button></div></div>${tags.length ? `<div class="journal-tags">${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}<div class="journal-rendered markdown-body ${expanded ? '' : 'clamped'}">${renderJournalMarkdown(entry.content)}</div><div class="journal-card-foot"><span>${entry.content.trim().split(/\s+/).filter(Boolean).length} kata</span><time datetime="${escapeHtml(entry.updatedAt)}">${escapeHtml(shortDate(entry.date))}</time></div>${pendingJournalDeleteId === entry.id ? `<div class="inline-confirm"><span>Hapus catatan ini secara permanen?</span><div><button class="danger" data-journal-delete-confirm="${escapeHtml(entry.id)}">Hapus</button><button data-journal-delete-cancel>Batal</button></div></div>` : ''}</article>`;
}

function renderJournalArchive() {
  const normalizedSearch = journalSearch.trim().toLowerCase();
  const visible = journals.filter((entry) => (!journalFilterDate || entry.date === journalFilterDate) && (!normalizedSearch || `${entry.title} ${entry.content} ${entry.tags} ${entry.mood}`.toLowerCase().includes(normalizedSearch)));
  const grouped = visible.reduce<Map<string, JournalEntryResponse[]>>((result, entry) => {
    result.set(entry.date, [...(result.get(entry.date) ?? []), entry]);
    return result;
  }, new Map());
  const groups = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));
  return `<div class="journal-archive-toolbar"><label class="feature-search"><span>⌕</span><input id="journal-search" placeholder="Cari judul, isi, mood, atau tag…" value="${escapeHtml(journalSearch)}" /></label><label class="date-filter"><span>Tanggal</span><input id="journal-filter-date" type="date" value="${escapeHtml(journalFilterDate)}" /></label>${journalFilterDate ? '<button class="feature-button" data-journal-clear-date>Semua tanggal</button>' : ''}</div><div class="journal-archive">${groups.length ? groups.map(([date, entries]) => `<section class="journal-day-group"><div class="journal-date-rail"><time datetime="${date}">${escapeHtml(longDate(date))}</time><span>${entries.length} catatan</span></div><div class="journal-day-cards">${entries.map(journalCard).join('')}</div></section>`).join('') : '<div class="feature-empty large"><strong>Belum ada catatan yang cocok</strong><span>Gunakan Ruang Tulis untuk membuat jurnal pertama.</span><button class="feature-button primary" data-journal-tab="write">Mulai menulis</button></div>'}</div>`;
}

function renderJournalWriter() {
  const wordCount = journalDraft.content.trim() ? journalDraft.content.trim().split(/\s+/).length : 0;
  return `<form id="journal-form" class="journal-writing ${journalFocusMode ? 'focus-mode' : ''}"><div class="writer-topbar"><div><p class="eyebrow">DISTRACTION-FREE EDITOR</p><strong>Ruang Tulis</strong></div><div class="writer-controls"><button type="button" class="feature-button ${journalPreviewVisible ? 'active' : ''}" data-journal-preview>${journalPreviewVisible ? 'Sembunyikan preview' : 'Tampilkan preview'}</button><button type="button" class="feature-button" data-journal-focus>${journalFocusMode ? 'Keluar fokus' : 'Mode fokus'}</button></div></div><div class="writer-metadata"><label><span>Tanggal</span><input name="date" type="date" value="${escapeHtml(journalDraft.date)}" required /></label><label><span>Mood</span><select name="mood"><option ${journalDraft.mood === 'Focused' ? 'selected' : ''}>Focused</option><option ${journalDraft.mood === 'Calm' ? 'selected' : ''}>Calm</option><option ${journalDraft.mood === 'Grateful' ? 'selected' : ''}>Grateful</option><option ${journalDraft.mood === 'Energized' ? 'selected' : ''}>Energized</option><option ${journalDraft.mood === 'Tired' ? 'selected' : ''}>Tired</option><option ${journalDraft.mood === 'Neutral' ? 'selected' : ''}>Neutral</option></select></label><label class="writer-title"><span>Judul</span><input name="title" value="${escapeHtml(journalDraft.title)}" placeholder="Apa yang ingin kamu ingat?" required maxlength="160" /></label><label class="writer-tags"><span>Tags</span><input name="tags" value="${escapeHtml(journalDraft.tags)}" placeholder="work, personal, reflection" maxlength="500" /></label></div><div class="markdown-toolbar" role="toolbar" aria-label="Markdown formatting"><button type="button" data-md-action="heading" title="Heading">H2</button><button type="button" data-md-action="bold" title="Bold (Ctrl+B)"><strong>B</strong></button><button type="button" data-md-action="italic" title="Italic (Ctrl+I)"><em>I</em></button><button type="button" data-md-action="strike" title="Strikethrough"><s>S</s></button><span></span><button type="button" data-md-action="quote" title="Quote">❝</button><button type="button" data-md-action="bullet" title="Bullet list">• List</button><button type="button" data-md-action="numbered" title="Numbered list">1. List</button><button type="button" data-md-action="checklist" title="Checklist">☐</button><span></span><button type="button" data-md-action="code" title="Code">&lt;/&gt;</button><button type="button" data-md-action="link" title="Link (Ctrl+K)">↗ Link</button></div><div class="writer-surface ${journalPreviewVisible ? 'with-preview' : ''}"><textarea id="journal-content" name="content" maxlength="50000" required spellcheck="true" placeholder="Mulai menulis… Gunakan Markdown, shortcut keyboard, checklist, quote, link, dan code block.">${escapeHtml(journalDraft.content)}</textarea>${journalPreviewVisible ? `<aside id="journal-preview" class="journal-live-preview markdown-body">${journalDraft.content ? renderJournalMarkdown(journalDraft.content) : '<div class="preview-placeholder">Preview akan muncul di sini saat kamu menulis.</div>'}</aside>` : ''}</div><div class="writer-status"><span id="journal-draft-status"><i></i> Draft tersimpan otomatis</span><span><b id="journal-word-count">${wordCount}</b> kata · <b id="journal-character-count">${journalDraft.content.length}</b> karakter</span><span>Ctrl/⌘ + S untuk menyimpan</span></div><div class="writer-submit"><button type="button" class="feature-button" data-journal-clear-draft>Bersihkan draft</button><button class="feature-button primary" type="submit">Simpan ke jurnal</button></div></form>`;
}

function renderJournaling() {
  return `<div class="page-heading"><div><p class="eyebrow">PERSONAL JOURNAL</p><h1>Journaling</h1><p class="subheading">Tulis dengan fokus, simpan otomatis, lalu temukan kembali catatan berdasarkan tanggal.</p></div><div class="connection"><span class="pulse"></span><span>${journals.length} catatan tersimpan</span></div></div><div class="lifestyle-tabs" role="tablist" aria-label="Journaling views"><button role="tab" aria-selected="${journalTab === 'archive'}" class="${journalTab === 'archive' ? 'active' : ''}" data-journal-tab="archive"><span>▤</span><div><strong>Arsip</strong><small>Baca per tanggal</small></div></button><button role="tab" aria-selected="${journalTab === 'write'}" class="${journalTab === 'write' ? 'active' : ''}" data-journal-tab="write"><span>✎</span><div><strong>Ruang Tulis</strong><small>Editor advanced</small></div></button></div>${journalTab === 'archive' ? renderJournalArchive() : renderJournalWriter()}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function sameRange(value: string, anchorValue: string, range: SpendingRange) {
  const date = parseLocalDate(value);
  const anchor = parseLocalDate(anchorValue);
  if (range === 'day') return value === anchorValue;
  if (range === 'month') return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
  if (range === 'year') return date.getFullYear() === anchor.getFullYear();
  const weekStart = startOfWeek(anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return date >= weekStart && date < weekEnd;
}

export function spendingTotals(entries: Pick<SpendingEntryResponse, 'date' | 'amount'>[], anchorDate: string) {
  return (['day', 'week', 'month', 'year'] as SpendingRange[]).reduce<Record<SpendingRange, number>>((result, range) => {
    result[range] = entries.filter((entry) => sameRange(entry.date, anchorDate, range)).reduce((total, entry) => total + entry.amount, 0);
    return result;
  }, { day: 0, week: 0, month: 0, year: 0 });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function spendingEntryMarkup(entry: SpendingEntryResponse) {
  return `<article class="spending-entry"><div class="spending-category-icon">${escapeHtml(entry.category.slice(0, 1).toUpperCase() || '•')}</div><div class="spending-copy"><div class="feature-meta"><span>${escapeHtml(entry.category)}</span><i>${escapeHtml(entry.paymentMethod)}</i></div><h3>${escapeHtml(entry.description)}</h3>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}</div><strong class="spending-amount">${escapeHtml(formatCurrency(entry.amount))}</strong><button class="feature-icon-button danger" data-spending-delete="${escapeHtml(entry.id)}" title="Hapus pengeluaran" aria-label="Hapus pengeluaran">⌫</button>${pendingSpendingDeleteId === entry.id ? `<div class="inline-confirm"><span>Hapus pengeluaran ini?</span><div><button class="danger" data-spending-delete-confirm="${escapeHtml(entry.id)}">Hapus</button><button data-spending-delete-cancel>Batal</button></div></div>` : ''}</article>`;
}

function renderSpending() {
  const totals = spendingTotals(spending, spendingAnchorDate);
  const rangeLabels: Record<SpendingRange, { label: string; hint: string }> = { day: { label: 'Hari', hint: 'Tanggal terpilih' }, week: { label: 'Minggu', hint: 'Senin–Minggu' }, month: { label: 'Bulan', hint: 'Bulan berjalan' }, year: { label: 'Tahun', hint: 'Tahun berjalan' } };
  const normalizedSearch = spendingSearch.trim().toLowerCase();
  const visible = spending.filter((entry) => sameRange(entry.date, spendingAnchorDate, spendingRange) && (!normalizedSearch || `${entry.description} ${entry.category} ${entry.paymentMethod} ${entry.note}`.toLowerCase().includes(normalizedSearch)));
  const grouped = visible.reduce<Map<string, SpendingEntryResponse[]>>((result, entry) => { result.set(entry.date, [...(result.get(entry.date) ?? []), entry]); return result; }, new Map());
  const groups = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));
  return `<div class="page-heading"><div><p class="eyebrow">EXPENSE TRACKER</p><h1>Spending</h1><p class="subheading">Catat pengeluaran dan lihat total harian, mingguan, bulanan, hingga tahunan.</p></div><div class="connection"><span class="pulse"></span><span>${spending.length} transaksi</span></div></div><div class="spending-anchor"><div><p class="eyebrow">PERIODE ACUAN</p><h2>${escapeHtml(shortDate(spendingAnchorDate))}</h2></div><input id="spending-anchor-date" type="date" value="${escapeHtml(spendingAnchorDate)}" aria-label="Tanggal acuan total" /></div><div class="spending-summary">${(['day', 'week', 'month', 'year'] as SpendingRange[]).map((range) => `<button class="spending-summary-card ${spendingRange === range ? 'active' : ''}" data-spending-range="${range}"><span>${rangeLabels[range].label}</span><strong>${escapeHtml(formatCurrency(totals[range]))}</strong><small>${rangeLabels[range].hint}</small></button>`).join('')}</div><div class="spending-layout"><form id="spending-form" class="lifestyle-panel spending-form"><div class="form-section-title"><span>+</span><div><strong>Catat pengeluaran</strong><small>Tersimpan ke PostgreSQL</small></div></div><label><span>Tanggal</span><input type="date" name="date" value="${escapeHtml(spendingAnchorDate)}" required /></label><label><span>Deskripsi</span><input name="description" placeholder="Contoh: Makan siang" required maxlength="160" /></label><div class="form-pair"><label><span>Jumlah (Rp)</span><input type="number" name="amount" min="1" step="1" placeholder="50000" required /></label><label><span>Kategori</span><select name="category"><option>Food</option><option>Transport</option><option>Bills</option><option>Shopping</option><option>Health</option><option>Education</option><option>Entertainment</option><option>Other</option></select></label></div><label><span>Metode bayar</span><select name="paymentMethod"><option>Cash</option><option>Debit</option><option>Credit</option><option>E-Wallet</option><option>Transfer</option><option>Other</option></select></label><label><span>Catatan</span><textarea name="note" rows="3" placeholder="Opsional" maxlength="2000"></textarea></label><button class="feature-button primary" type="submit">Simpan pengeluaran</button></form><section class="lifestyle-panel spending-ledger"><div class="ledger-toolbar"><div><p class="eyebrow">EXPENSE LIST</p><h2>${rangeLabels[spendingRange].label} terpilih</h2></div><label class="feature-search"><span>⌕</span><input id="spending-search" placeholder="Cari pengeluaran…" value="${escapeHtml(spendingSearch)}" /></label></div><div class="spending-list">${groups.length ? groups.map(([date, entries]) => `<section class="spending-day"><div class="spending-day-head"><time datetime="${date}">${escapeHtml(longDate(date))}</time><strong>${escapeHtml(formatCurrency(entries.reduce((total, entry) => total + entry.amount, 0)))}</strong></div>${entries.map(spendingEntryMarkup).join('')}</section>`).join('') : '<div class="feature-empty"><strong>Belum ada pengeluaran</strong><span>Tambahkan transaksi atau pilih periode lain.</span></div>'}</div></section></div>`;
}

export function renderLifestylePage(page: LifestylePage) {
  if (page === 'workout') return renderWorkout();
  if (page === 'journaling') return renderJournaling();
  return renderSpending();
}

function workoutPayloadFromForm(form: FormData, completed = false) {
  return {
    date: selectedWorkoutDate,
    exercise: String(form.get('exercise') ?? '').trim(),
    category: String(form.get('category') ?? 'General'),
    sets: numberValue(form.get('sets')),
    reps: numberValue(form.get('reps')),
    durationMinutes: numberValue(form.get('durationMinutes')),
    note: String(form.get('note') ?? '').trim(),
    completed,
  };
}

function bindWorkout(options: BindOptions) {
  document.querySelector<HTMLButtonElement>('[data-workout-month-prev]')?.addEventListener('click', () => { workoutMonth = new Date(workoutMonth.getFullYear(), workoutMonth.getMonth() - 1, 1); options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-workout-month-next]')?.addEventListener('click', () => { workoutMonth = new Date(workoutMonth.getFullYear(), workoutMonth.getMonth() + 1, 1); options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-workout-today]')?.addEventListener('click', () => { selectedWorkoutDate = todayKey; workoutMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); scrollPositions.workout = 0; options.rerender(); });
  document.querySelectorAll<HTMLButtonElement>('[data-workout-day]').forEach((button) => button.addEventListener('click', () => { selectedWorkoutDate = button.dataset.workoutDay!; editingWorkoutId = null; scrollPositions.workout = 0; options.rerender(); }));
  document.querySelector<HTMLFormElement>('#workout-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = workoutPayloadFromForm(new FormData(event.currentTarget as HTMLFormElement));
    if (!payload.exercise) return;
    void runAction(async () => { const created = await api.createWorkout(payload); workouts = [created, ...workouts]; saveWorkouts(); }, options);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-workout-toggle]').forEach((button) => button.addEventListener('click', () => {
    captureScroll('workout', '.workout-list');
    const entry = workouts.find((candidate) => candidate.id === button.dataset.workoutToggle);
    if (!entry) return;
    const payload = { date: entry.date, exercise: entry.exercise, category: entry.category, sets: entry.sets, reps: entry.reps, durationMinutes: entry.durationMinutes, note: entry.note, completed: !entry.completed };
    void runAction(async () => { const updated = await api.updateWorkout(entry.id, payload); workouts = workouts.map((candidate) => candidate.id === updated.id ? updated : candidate); saveWorkouts(); }, options);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-workout-edit]').forEach((button) => button.addEventListener('click', () => { captureScroll('workout', '.workout-list'); editingWorkoutId = button.dataset.workoutEdit!; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-workout-edit-cancel]')?.addEventListener('click', () => { captureScroll('workout', '.workout-list'); editingWorkoutId = null; options.rerender(); });
  document.querySelector<HTMLFormElement>('[data-workout-edit-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const entry = workouts.find((candidate) => candidate.id === formElement.dataset.workoutEditForm);
    if (!entry) return;
    const payload = workoutPayloadFromForm(new FormData(formElement), entry.completed);
    if (!payload.exercise) return;
    captureScroll('workout', '.workout-list');
    void runAction(async () => { const updated = await api.updateWorkout(entry.id, payload); workouts = workouts.map((candidate) => candidate.id === updated.id ? updated : candidate); editingWorkoutId = null; saveWorkouts(); }, options);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-workout-delete]').forEach((button) => button.addEventListener('click', () => { captureScroll('workout', '.workout-list'); pendingWorkoutDeleteId = button.dataset.workoutDelete!; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-workout-delete-cancel]')?.addEventListener('click', () => { captureScroll('workout', '.workout-list'); pendingWorkoutDeleteId = null; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-workout-delete-confirm]')?.addEventListener('click', (event) => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.workoutDeleteConfirm!;
    const entry = workouts.find((candidate) => candidate.id === id);
    if (!entry) return;
    captureScroll('workout', '.workout-list');
    void runAction(async () => { await api.deleteWorkout(entry.id, entry.date); workouts = workouts.filter((candidate) => candidate.id !== entry.id); pendingWorkoutDeleteId = null; saveWorkouts(); }, options);
  });
  restoreScroll('workout', '.workout-list');
}

function updateDraftFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  journalDraft = {
    date: String(data.get('date') ?? todayKey),
    title: String(data.get('title') ?? ''),
    content: String(data.get('content') ?? ''),
    mood: String(data.get('mood') ?? 'Neutral'),
    tags: String(data.get('tags') ?? ''),
  };
  localStorage.setItem(journalDraftStorageKey, JSON.stringify(journalDraft));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string, selectionStart: number, selectionEnd = selectionStart) {
  textarea.value = value;
  textarea.focus();
  textarea.setSelectionRange(selectionStart, selectionEnd);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyMarkdown(action: string, textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const wrap = (before: string, after = before, placeholder = 'teks') => {
    const body = selected || placeholder;
    setTextareaValue(textarea, `${value.slice(0, start)}${before}${body}${after}${value.slice(end)}`, start + before.length, start + before.length + body.length);
  };
  const prefixLines = (prefix: string | ((index: number) => string)) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const next = block.split('\n').map((line, index) => `${typeof prefix === 'function' ? prefix(index) : prefix}${line}`).join('\n');
    setTextareaValue(textarea, `${value.slice(0, lineStart)}${next}${value.slice(lineEnd)}`, lineStart, lineStart + next.length);
  };
  if (action === 'bold') wrap('**');
  else if (action === 'italic') wrap('*');
  else if (action === 'strike') wrap('~~');
  else if (action === 'code') selected.includes('\n') ? wrap('```\n', '\n```', 'kode') : wrap('`', '`', 'kode');
  else if (action === 'link') wrap('[', '](https://)', selected || 'label');
  else if (action === 'heading') prefixLines('## ');
  else if (action === 'quote') prefixLines('> ');
  else if (action === 'bullet') prefixLines('- ');
  else if (action === 'numbered') prefixLines((index) => `${index + 1}. `);
  else if (action === 'checklist') prefixLines('- [ ] ');
}

function bindJournal(options: BindOptions) {
  document.querySelectorAll<HTMLButtonElement>('[data-journal-tab]').forEach((button) => button.addEventListener('click', () => {
    const nextTab = button.dataset.journalTab as JournalTab;
    if (nextTab !== journalTab) history.pushState({ page: 'journaling', view: nextTab }, '', nextTab === 'write' ? '/journaling?view=write' : '/journaling');
    journalTab = nextTab;
    options.rerender();
  }));
  document.querySelector<HTMLInputElement>('#journal-search')?.addEventListener('input', (event) => { journalSearch = (event.target as HTMLInputElement).value; options.rerender(); requestAnimationFrame(() => { const input = document.querySelector<HTMLInputElement>('#journal-search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); });
  document.querySelector<HTMLInputElement>('#journal-filter-date')?.addEventListener('change', (event) => { journalFilterDate = (event.target as HTMLInputElement).value; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-journal-clear-date]')?.addEventListener('click', () => { journalFilterDate = ''; options.rerender(); });
  document.querySelectorAll<HTMLButtonElement>('[data-journal-expand]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.journalExpand!; expandedJournalIds.has(id) ? expandedJournalIds.delete(id) : expandedJournalIds.add(id); options.rerender(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-journal-delete]').forEach((button) => button.addEventListener('click', () => { pendingJournalDeleteId = button.dataset.journalDelete!; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-journal-delete-cancel]')?.addEventListener('click', () => { pendingJournalDeleteId = null; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-journal-delete-confirm]')?.addEventListener('click', (event) => { const id = (event.currentTarget as HTMLButtonElement).dataset.journalDeleteConfirm!; void runAction(async () => { await api.deleteJournal(id); journals = journals.filter((entry) => entry.id !== id); pendingJournalDeleteId = null; saveJournals(); }, options); });
  const form = document.querySelector<HTMLFormElement>('#journal-form');
  const textarea = document.querySelector<HTMLTextAreaElement>('#journal-content');
  if (!form || !textarea) return;
  const updateLiveState = () => {
    updateDraftFromForm(form);
    const words = journalDraft.content.trim() ? journalDraft.content.trim().split(/\s+/).length : 0;
    const wordElement = document.querySelector<HTMLElement>('#journal-word-count');
    const characterElement = document.querySelector<HTMLElement>('#journal-character-count');
    const preview = document.querySelector<HTMLElement>('#journal-preview');
    const status = document.querySelector<HTMLElement>('#journal-draft-status');
    if (wordElement) wordElement.textContent = String(words);
    if (characterElement) characterElement.textContent = String(journalDraft.content.length);
    if (preview) preview.innerHTML = journalDraft.content ? renderJournalMarkdown(journalDraft.content) : '<div class="preview-placeholder">Preview akan muncul di sini saat kamu menulis.</div>';
    if (status) status.innerHTML = `<i></i> Draft tersimpan ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach((element) => element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', updateLiveState));
  document.querySelectorAll<HTMLButtonElement>('[data-md-action]').forEach((button) => button.addEventListener('click', () => applyMarkdown(button.dataset.mdAction!, textarea)));
  textarea.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); form.requestSubmit(); }
    else if (modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); applyMarkdown('bold', textarea); }
    else if (modifier && event.key.toLowerCase() === 'i') { event.preventDefault(); applyMarkdown('italic', textarea); }
    else if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); applyMarkdown('link', textarea); }
    else if (modifier && event.shiftKey && event.key === '7') { event.preventDefault(); applyMarkdown('numbered', textarea); }
    else if (modifier && event.shiftKey && event.key === '8') { event.preventDefault(); applyMarkdown('bullet', textarea); }
  });
  document.querySelector<HTMLButtonElement>('[data-journal-preview]')?.addEventListener('click', () => { updateDraftFromForm(form); journalPreviewVisible = !journalPreviewVisible; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-journal-focus]')?.addEventListener('click', () => { updateDraftFromForm(form); journalFocusMode = !journalFocusMode; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-journal-clear-draft]')?.addEventListener('click', () => { journalDraft = { date: todayKey, title: '', content: '', mood: 'Focused', tags: '' }; localStorage.setItem(journalDraftStorageKey, JSON.stringify(journalDraft)); options.rerender(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    updateDraftFromForm(form);
    const payload = { ...journalDraft, title: journalDraft.title.trim(), content: journalDraft.content.trim(), tags: journalDraft.tags.trim() };
    if (!payload.title || !payload.content) return;
    void runAction(async () => {
      const created = await api.createJournal(payload);
      journals = [created, ...journals];
      saveJournals();
      journalDraft = { date: todayKey, title: '', content: '', mood: 'Focused', tags: '' };
      localStorage.setItem(journalDraftStorageKey, JSON.stringify(journalDraft));
      journalTab = 'archive';
      history.replaceState({ page: 'journaling', view: 'archive' }, '', '/journaling');
      journalFocusMode = false;
    }, options);
  });
}

function bindSpending(options: BindOptions) {
  document.querySelectorAll<HTMLButtonElement>('[data-spending-range]').forEach((button) => button.addEventListener('click', () => { spendingRange = button.dataset.spendingRange as SpendingRange; scrollPositions.spending = 0; options.rerender(); }));
  document.querySelector<HTMLInputElement>('#spending-anchor-date')?.addEventListener('change', (event) => { spendingAnchorDate = (event.target as HTMLInputElement).value || todayKey; scrollPositions.spending = 0; options.rerender(); });
  document.querySelector<HTMLInputElement>('#spending-search')?.addEventListener('input', (event) => { spendingSearch = (event.target as HTMLInputElement).value; options.rerender(); requestAnimationFrame(() => { const input = document.querySelector<HTMLInputElement>('#spending-search'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); });
  document.querySelector<HTMLFormElement>('#spending-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const amount = Math.round(Number(data.get('amount') ?? 0));
    const payload = { date: String(data.get('date') ?? spendingAnchorDate), description: String(data.get('description') ?? '').trim(), category: String(data.get('category') ?? 'Other'), amount, paymentMethod: String(data.get('paymentMethod') ?? 'Other'), note: String(data.get('note') ?? '').trim() };
    if (!payload.description || !Number.isFinite(amount) || amount <= 0) return;
    void runAction(async () => { const created = await api.createSpending(payload); spending = [created, ...spending]; spendingAnchorDate = created.date; saveSpending(); }, options);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-spending-delete]').forEach((button) => button.addEventListener('click', () => { captureScroll('spending', '.spending-list'); pendingSpendingDeleteId = button.dataset.spendingDelete!; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-spending-delete-cancel]')?.addEventListener('click', () => { captureScroll('spending', '.spending-list'); pendingSpendingDeleteId = null; options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-spending-delete-confirm]')?.addEventListener('click', (event) => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.spendingDeleteConfirm!;
    captureScroll('spending', '.spending-list');
    void runAction(async () => { await api.deleteSpending(id); spending = spending.filter((entry) => entry.id !== id); pendingSpendingDeleteId = null; saveSpending(); }, options);
  });
  restoreScroll('spending', '.spending-list');
}

export function bindLifestyleEvents(page: LifestylePage, options: BindOptions) {
  if (page === 'workout') bindWorkout(options);
  else if (page === 'journaling') bindJournal(options);
  else bindSpending(options);
}
