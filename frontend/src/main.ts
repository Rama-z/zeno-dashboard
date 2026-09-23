import '@fontsource-variable/outfit/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import '@phosphor-icons/web/regular';
import './landing.css';
import { sessionLog as initialLogs, sourceFile, generatedAt } from './generated-log';
import { api, ApiError, type ActivityEvent, type ApiLog, type AuthUser, type SettingsResponse } from './api';
import { changeLogUpdates, type ChangeLogUpdate } from './change-log';
import { bindLifestyleEvents, currentWorkoutDate, isLifestylePage, lifestyleOverviewSnapshot, renderLifestylePage, scheduleWorkout, syncLifestyleData, syncLifestyleRoute } from './lifestyle';
import { bindDoingEvents, doingOverviewEntries, renderDoingPage, syncDoingData } from './doing-complete';
import { authPath, authViewFromPath, bindAuthEvents, bindProfileEvents, renderAuthScreen, renderProfilePage, type AuthScreenState, type AuthView, type FontProfileOption } from './auth';
import { bindLandingEvents, renderLandingPage } from './landing';
import { bindLearningMaterialsEvents, ensureLearningMaterialData, renderLearningMaterials as learningMaterials } from './learning-materials';
import { bindWorkoutMaterialEvents, renderWorkoutMaterials } from './workout-materials';
import { isLearningMaterialRoute, isLearningRoute, isWorkoutMaterialsRoute, pageForRoute, pagePaths, resolveAppRoute, type AppRoute, type Page } from './app-route';
import { activeOrbitLocation, chooseOrbitTriggerDock, clampOrbitTriggerPosition, orbitDialogSize, orbitSegmentGeometry, paginateOrbitItems, placeOrbitDialog, visibleOrbitNavigation, type OrbitDestination, type OrbitDialogPlacement, type OrbitNavigationItem, type OrbitPoint, type OrbitRole } from './orbit-navigation';
import { splitActivityActorGroups } from './activity-grouping';
import { calculateOverviewSummary } from './overview-summary';
import { workoutOverviewSessions } from './workout-trail';

type Filter = 'all' | 'success' | 'info';
type ChangeLogPeriod = 'all' | 'today' | 'yesterday' | 'week' | 'older';
type ChangeLogSort = 'newest' | 'oldest';
type ActivityPeriod = 'all' | 'today' | 'week' | 'month';
type LearningEntry = { id: string; title: string; note: string; category: string; completed: boolean };
const app = document.querySelector<HTMLDivElement>('#app')!;
let appStylesPromise: Promise<unknown> | null = null;
function ensureAppStyles() {
  return appStylesPromise ??= import('./app-styles');
}
let filter: Filter = 'all';
let route: AppRoute = resolveAppRoute(window.location.pathname);
let page: Page = pageForRoute(route);
if (isLifestylePage(page)) syncLifestyleRoute(page);
let query = '';
let expanded = new Set<number>();
let changeLogPeriod: ChangeLogPeriod = 'all';
let changeLogSort: ChangeLogSort = 'newest';
let changeLogEntries: ChangeLogUpdate[] = [...changeLogUpdates];
let logs: ApiLog[] = initialLogs.map((entry, index) => ({ id: index + 1, ...entry }));
let runtimeSourceFile = sourceFile;
let runtimeGeneratedAt = generatedAt;
let activityEvents: ActivityEvent[] = [];
let activityQuery = '';
let activityActor = 'all';
let activityPeriod: ActivityPeriod = 'all';
let activityVisibleGroups = 6;
let collapsedActivityGroups = new Set<string>();
let expandedActivityEvents = new Set<string>();
let backendSettings: SettingsResponse = { workspaceName: 'Default workspace', sourceFile };
let backendOnline = false;
let backendError = '';
type OverviewDataState = 'loading' | 'ready' | 'partial' | 'error';
let overviewDataState: OverviewDataState = 'loading';
type OverviewSource = 'doing' | 'learning' | 'lifestyle' | 'activity' | 'session';
const overviewFailedSources = new Set<OverviewSource>();
const overviewMotionStorageKey = 'zeno-overview-motion-v1';
let overviewMotionEnabled = localStorage.getItem(overviewMotionStorageKey) !== 'off';
let disposeOverviewMotion: (() => void) | undefined;
let currentUser: AuthUser | null = null;
let authChecked = false;
let authView: AuthView = authViewFromPath(window.location.pathname);
let authState: AuthScreenState = { busy: false, message: '', error: '', verificationStatus: 'idle' };
let dashboardEntryPending = true;
let profileBusy = false;
let profileMessage = '';
let profileError = '';
type Theme = 'dark' | 'light';
let theme: Theme = (localStorage.getItem('hermes-monitor-theme') as Theme) === 'light' ? 'light' : 'dark';
type FontProfile = 'compact' | 'standard' | 'expanded';
const fontProfileLabels: Record<FontProfile, string> = { compact: 'Compact', standard: 'Standard', expanded: 'Expanded' };
const fontProfileDescriptions: Record<FontProfile, string> = { compact: 'Lebih padat', standard: 'Seimbang', expanded: 'Lebih lega' };
const fontProfileStorageKey = 'hermes-monitor-font-profile';
function isFontProfile(value: string | null): value is FontProfile {
  return value === 'compact' || value === 'standard' || value === 'expanded';
}
function fontProfileOptions(): FontProfileOption[] {
  return (Object.keys(fontProfileLabels) as FontProfile[]).map((value) => ({
    value,
    label: fontProfileLabels[value],
    description: fontProfileDescriptions[value],
    selected: fontProfile === value,
  }));
}
let fontProfile: FontProfile = isFontProfile(localStorage.getItem(fontProfileStorageKey)) ? localStorage.getItem(fontProfileStorageKey) as FontProfile : 'compact';
let orbitOpen = false;
let orbitGroupId: string | null = null;
let orbitPage = 0;
let orbitClosing = false;
let orbitLayerTransitioning = false;
let orbitTriggerPosition: OrbitPoint | null = null;
let orbitDialogPosition: OrbitDialogPlacement | null = null;
let orbitSuppressNextClick = false;
let orbitCloseTimer: number | null = null;
let orbitTransitionToken = 0;
const learningStorageKey = 'hermes-monitor-learning-v1';
const today = new Date();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = dateKey(today);
let selectedLearningDate = todayKey;
let learningMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let editingLearningId: string | null = null;
let pendingDeleteLearningId: string | null = null;
let deletePopoverPosition = { top: 0, left: 0 };
let learningListScrollTop = 0;
function restoreLearningListScroll() {
  const apply = () => {
    const list = document.querySelector<HTMLElement>('.learning-list');
    if (list) list.scrollTop = learningListScrollTop;
  };
  apply();
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
  window.setTimeout(apply, 80);
}
let learningEntries: Record<string, LearningEntry[]> = (() => {
  try { return JSON.parse(localStorage.getItem(learningStorageKey) ?? '{}') as Record<string, LearningEntry[]>; } catch { return {}; }
})();


function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.fontProfile = fontProfile;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F5F4ED' : '#202820');
}

const iconNames: Record<string, string> = {
  grid: 'squares-four', activity: 'pulse', settings: 'sliders-horizontal', profile: 'user-circle', users: 'users-three', search: 'magnifying-glass', arrow: 'arrow-up-right', check: 'check', info: 'info', chevron: 'caret-down', file: 'notebook', doing: 'check-square', calendar: 'calendar-dots', workout: 'barbell', journal: 'note-pencil', spending: 'wallet', sun: 'sun', moon: 'moon', pause: 'pause', play: 'play', collapse: 'caret-left', expand: 'caret-right', edit: 'pencil-simple', trash: 'trash', compass: 'compass-rose', close: 'x', back: 'arrow-left', next: 'arrow-right',
};
const icon = (name: string) => `<span class="ph ph-${iconNames[name] ?? 'circle'}" aria-hidden="true"></span>`;

function learningCalendar() {
  const year = learningMonth.getFullYear();
  const month = learningMonth.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: leading + days }, (_, index) => index < leading ? null : index - leading + 1);
}
function renderLearningEntry(entry: LearningEntry) {
  if (editingLearningId === entry.id) {
    return `<form class="learning-entry learning-edit-form" data-learning-edit-form="${escapeHtml(entry.id)}"><div class="learning-edit-fields"><input name="title" value="${escapeHtml(entry.title)}" aria-label="Lesson title" required /><input name="note" value="${escapeHtml(entry.note)}" aria-label="Lesson note" /><select name="category" aria-label="Lesson category">${['General', 'Hermes', 'Frontend', 'DevOps', 'Research'].map((category) => `<option ${category === entry.category ? 'selected' : ''}>${category}</option>`).join('')}</select></div><div class="learning-actions"><button class="learning-action save" type="submit">Save</button><button class="learning-action" type="button" data-learning-cancel>Cancel</button></div></form>`;
  }
  return `<article class="learning-entry ${entry.completed ? 'completed' : ''}"><button class="learning-check" data-learning-toggle="${escapeHtml(entry.id)}" aria-label="${entry.completed ? 'Mark as not completed' : 'Mark as completed'}" aria-pressed="${entry.completed}">${entry.completed ? icon('check') : ''}</button><div class="learning-entry-copy"><span class="learning-category">${escapeHtml(entry.category)}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.note)}</p></div><div class="learning-actions"><button class="learning-action icon-only" data-learning-edit="${escapeHtml(entry.id)}" title="Edit lesson" aria-label="Edit lesson">${icon('edit')}</button><button class="learning-action icon-only danger" data-learning-delete="${escapeHtml(entry.id)}" title="Delete lesson" aria-label="Delete lesson">${icon('trash')}</button></div></article>`;
}
function renderLearningPage() {
  const selectedEntries = learningEntries[selectedLearningDate] ?? [];
  const monthName = learningMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const selectedLabel = new Date(`${selectedLearningDate}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `
          <div class="page-heading"><div><p class="eyebrow">LEARNING JOURNAL</p><h1>What I learned</h1><p class="subheading">Catat dan pantau pembelajaran harian dalam kalender lintas tahun.</p></div><div class="learning-heading-actions"><button type="button" class="feature-button primary" data-learning-materials>Learning Material List</button><div class="connection"><span class="pulse"></span><span>${Object.values(learningEntries).reduce((total, entries) => total + entries.length, 0)} lessons logged</span></div></div></div>
          <div class="learning-layout"><section class="calendar-panel"><div class="calendar-header"><button class="calendar-nav" data-calendar-prev aria-label="Previous month">‹</button><div><p class="eyebrow">LEARNING CALENDAR</p><h2>${monthName}</h2></div><button class="calendar-nav" data-calendar-next aria-label="Next month">›</button></div><div class="calendar-weekdays"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div><div class="calendar-grid">${learningCalendar().map((day) => { if (!day) return '<span class="calendar-day empty-day"></span>'; const key = dateKey(new Date(learningMonth.getFullYear(), learningMonth.getMonth(), day)); const entries = learningEntries[key] ?? []; const count = entries.length; const unfinishedCount = entries.filter((entry) => !entry.completed).length; const allCompleted = count > 0 && unfinishedCount === 0; const isToday = key === todayKey; return `<button class="calendar-day ${key === selectedLearningDate ? 'selected' : ''} ${isToday ? 'today' : ''} ${count ? 'has-lessons' : ''} ${allCompleted ? 'all-completed' : ''}" data-day="${key}" title="${allCompleted ? 'All lessons completed' : count ? `${unfinishedCount} unfinished lessons` : 'No lessons'}"><span>${day}</span>${count ? `<i aria-label="${allCompleted ? 'All completed' : `${unfinishedCount} unfinished lessons`}">${allCompleted ? icon('check') : unfinishedCount}</i>` : ''}</button>`; }).join('')}</div><div class="calendar-legend"><span><i class="legend-progress">3</i> In progress</span><span><i class="legend-complete">${icon('check')}</i> All completed</span></div><button class="today-button" data-today>Jump to today</button></section><section class="learning-detail"><div class="detail-heading"><div><p class="eyebrow">SELECTED DAY</p><h2>${selectedLabel}</h2></div><span class="date-badge">${selectedEntries.length} ${selectedEntries.length === 1 ? 'lesson' : 'lessons'}</span></div><div class="learning-list">${selectedEntries.length ? selectedEntries.map(renderLearningEntry).join('') : '<div class="learning-empty">Belum ada catatan untuk tanggal ini.<br><span>Tambahkan materi pertama di form di bawah.</span></div>'}</div><form class="learning-form" id="learning-form"><input name="title" placeholder="Apa yang dipelajari?" aria-label="What was learned" required /><input name="note" placeholder="Catatan singkat (opsional)" aria-label="Learning note" /><select name="category" aria-label="Learning category"><option>General</option><option>Hermes</option><option>Frontend</option><option>DevOps</option><option>Research</option></select><button type="submit">Add lesson <span>↗</span></button></form></section></div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
}
function renderMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^\- (.*)$/gm, '<li>$1</li>')
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}
function visibleLogs() {
  return logs.map((log, index) => ({ log, index })).filter(({ log }) =>
    (filter === 'all' || log.status === filter) &&
    `${log.title} ${log.question} ${log.answer}`.toLowerCase().includes(query.toLowerCase())
  );
}

function periodForUpdate(occurredAt: string, reference = new Date()): Exclude<ChangeLogPeriod, 'all'> {
  const updateDate = new Date(occurredAt);
  const todayStart = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  if (updateDate >= todayStart) return 'today';
  if (updateDate >= yesterdayStart) return 'yesterday';
  if (updateDate >= weekStart) return 'week';
  return 'older';
}

function renderSessionEntriesContent(visible: { log: ApiLog; index: number }[], successCount: number, sourceLabel = 'Served by Zeno API') {
  return `
          <div class="metrics"><div class="metric-card featured accent" data-metric="verified"><span>Verified outcomes</span><strong>${successCount}<em>/${logs.length}</em></strong><small>${icon('check')} Positive signals in the active source</small></div><div class="metric-card compact" data-metric="entries"><span>Total entries</span><strong>${logs.length}</strong><small>Source-backed sections</small></div><div class="metric-card compact" data-metric="coverage"><span>Coverage</span><strong>100<em>%</em></strong><small>Updated ${new Date(runtimeGeneratedAt).toLocaleDateString('id-ID')}</small></div></div>
          <div class="section-toolbar"><div><h2>Session log</h2><span class="result-count">${visible.length} of ${logs.length} entries visible</span></div><div class="toolbar-controls"><label class="search" aria-label="Search session entries"><span>${icon('search')}</span><input id="search" placeholder="Search entries" value="${escapeHtml(query)}" /></label><div class="filters" aria-label="Filter session entries"><button class="filter ${filter === 'all' ? 'selected' : ''}" data-filter="all" aria-pressed="${filter === 'all'}">All</button><button class="filter ${filter === 'success' ? 'selected' : ''}" data-filter="success" aria-pressed="${filter === 'success'}">Verified</button><button class="filter ${filter === 'info' ? 'selected' : ''}" data-filter="info" aria-pressed="${filter === 'info'}">Info</button></div></div></div>
          <div class="log-list">${visible.length ? visible.map(({ log, index }) => `
            <article class="log-entry ${expanded.has(index) ? 'open' : ''}"><button class="entry-header" data-expand="${index}"><span class="entry-number">${String(index + 1).padStart(2, '0')}</span><span class="entry-main"><span class="entry-title">${escapeHtml(log.title.replace(/^\d+\.\s*/, ''))}</span><span class="entry-excerpt">${escapeHtml(log.excerpt)}</span></span><span class="entry-status ${log.status}"><i>${log.status === 'success' ? icon('check') : icon('info')}</i>${log.status === 'success' ? 'Verified' : 'Reference'}</span><span class="entry-chevron">${icon('chevron')}</span></button>${expanded.has(index) ? `<div class="entry-detail"><div class="question"><span>QUESTION</span><p>${renderMarkdown(log.question)}</p></div><div class="answer"><span>ANSWER</span><div class="answer-body"><p>${renderMarkdown(log.answer)}</p></div></div></div>` : ''}</article>
          `).join('') : '<div class="empty">No entries match your search.</div>'}</div>
          <footer class="footnote">Reading from <code>${escapeHtml(runtimeSourceFile)}</code><span>•</span> ${escapeHtml(sourceLabel)}</footer>`;
}

function renderChangeLogUpdates() {
  const periodLabels: Record<Exclude<ChangeLogPeriod, 'all'>, string> = { today: 'Hari ini', yesterday: 'Kemarin', week: 'Minggu ini', older: 'Lebih lama' };
  const counts = changeLogEntries.reduce<Record<Exclude<ChangeLogPeriod, 'all'>, number>>((result, entry) => {
    result[periodForUpdate(entry.occurredAt)] += 1;
    return result;
  }, { today: 0, yesterday: 0, week: 0, older: 0 });
  const updates = changeLogEntries
    .filter((entry) => changeLogPeriod === 'all' || periodForUpdate(entry.occurredAt) === changeLogPeriod)
    .sort((a, b) => (new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()) * (changeLogSort === 'newest' ? -1 : 1));
  const grouped = updates.reduce<Map<string, ChangeLogUpdate[]>>((result, entry) => {
    const key = dateKey(new Date(entry.occurredAt));
    result.set(key, [...(result.get(key) ?? []), entry]);
    return result;
  }, new Map());
  const filterButtons = ([['all', 'Semua', changeLogEntries.length], ['today', 'Hari ini', counts.today], ['yesterday', 'Kemarin', counts.yesterday], ['week', 'Minggu ini', counts.week], ['older', 'Lebih lama', counts.older]] as [ChangeLogPeriod, string, number][])
    .map(([value, label, count]) => `<button class="period-filter ${changeLogPeriod === value ? 'selected' : ''}" data-change-period="${value}">${label}<span>${count}</span></button>`).join('');
  return `
          <div class="change-log-toolbar"><div><p class="eyebrow">TIME RANGE</p><div class="period-filters">${filterButtons}</div></div><label class="change-log-sort"><span>Urutkan</span><select id="change-log-sort" aria-label="Urutkan log update"><option value="newest" ${changeLogSort === 'newest' ? 'selected' : ''}>Terbaru</option><option value="oldest" ${changeLogSort === 'oldest' ? 'selected' : ''}>Terlama</option></select></label></div>
          <div class="update-timeline">${grouped.size ? [...grouped.entries()].map(([date, entries]) => {
            const representative = entries[0];
            const period = periodForUpdate(representative.occurredAt);
            const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            return `<section class="update-day"><div class="update-date"><span>${escapeHtml(dateLabel)}</span><i>${periodLabels[period]}</i></div><div class="update-day-list">${entries.map((entry) => `<article class="update-card"><span class="update-marker"></span><div class="update-copy"><div class="update-meta"><span>${escapeHtml(entry.category)}</span><time datetime="${escapeHtml(entry.occurredAt)}">${new Date(entry.occurredAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time></div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p></div></article>`).join('')}</div></section>`;
          }).join('') : '<div class="empty update-empty">Belum ada log update pada rentang waktu ini.</div>'}</div>`;
}

function activityPeriodMatches(createdAt: string, period: ActivityPeriod, reference = new Date()) {
  if (period === 'all') return true;
  const created = new Date(createdAt);
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (period === 'week') start.setDate(start.getDate() - 6);
  if (period === 'month') start.setDate(start.getDate() - 29);
  return created >= start;
}

function activityActionLabel(event: ActivityEvent) {
  const entity = ({
    doing: 'Task', journal: 'Jurnal', learning: 'Catatan belajar', workout: 'Workout', spending: 'Pengeluaran',
    profile: 'Profil', user: 'Pengguna', session: 'Sesi', settings: 'Pengaturan', change_log: 'Change log',
  } as Record<string, string>)[event.entityType.toLowerCase()] ?? event.entityType.replace(/[_-]+/g, ' ');
  const action = ({
    create: 'dibuat', update: 'diperbarui', delete: 'dihapus', complete: 'diselesaikan', completed: 'diselesaikan',
    login: 'dimulai', logout: 'diakhiri', verify: 'diverifikasi', register: 'didaftarkan', append_revision: 'direvisi',
  } as Record<string, string>)[event.action.toLowerCase()] ?? event.action.replace(/[_-]+/g, ' ');
  return `${entity.charAt(0).toUpperCase()}${entity.slice(1)} ${action}`;
}

function activityEventIcon(event: ActivityEvent) {
  const entity = event.entityType.toLowerCase();
  if (event.action.toLowerCase() === 'delete') return icon('trash');
  if (entity.includes('journal')) return icon('journal');
  if (entity.includes('doing') || entity.includes('task')) return icon('doing');
  if (entity.includes('workout')) return icon('workout');
  if (entity.includes('spending')) return icon('spending');
  if (entity.includes('profile') || entity.includes('user') || entity.includes('session')) return icon('profile');
  return icon('file');
}

function activityTime(value: string, includeSeconds = false) {
  return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', ...(includeSeconds ? { second: '2-digit' } : {}), hour12: false }).replace(/\./g, ':');
}

function renderActivityTrail(user: AuthUser) {
  const actors = [...new Map(activityEvents.map((event) => [event.actorEmail, event.actorName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'id-ID'));
  const normalizedQuery = activityQuery.trim().toLocaleLowerCase('id-ID');
  const filtered = [...activityEvents]
    .filter((event) => activityActor === 'all' || event.actorEmail === activityActor)
    .filter((event) => activityPeriodMatches(event.createdAt, activityPeriod))
    .filter((event) => !normalizedQuery || `${event.actorName} ${event.actorEmail} ${event.action} ${event.entityType} ${event.description} ${event.entityId ?? ''}`.toLocaleLowerCase('id-ID').includes(normalizedQuery))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const actorGroups = splitActivityActorGroups(filtered);
  const visibleGroups = actorGroups.slice(0, activityVisibleGroups);
  const days = visibleGroups.reduce<Map<string, typeof actorGroups>>((result, group) => {
    result.set(group.date, [...(result.get(group.date) ?? []), group]);
    return result;
  }, new Map());
  const roleLabel = user.role === 'admin' ? 'Admin' : 'User';
  const periodLabels: Record<ActivityPeriod, string> = { all: 'Semua waktu', today: 'Hari ini', week: '7 hari terakhir', month: '30 hari terakhir' };
  const actorOptions = actors.map(([email, name]) => `<option value="${escapeHtml(email)}" ${activityActor === email ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  return `
          <div class="activity-page-heading">
            <div><p class="eyebrow">A / ACTIVITY TRAIL</p><div class="activity-title-line"><h1>Workspace activity</h1><span>${activityEvents.length} events&nbsp; · &nbsp;${actors.length} actors&nbsp; · &nbsp;${roleLabel}</span></div><p class="subheading">Aktivitas berurutan, dikelompokkan per pengguna.</p></div>
            <div class="activity-heading-pill">${icon('activity')}<span>Activity (Audit trail)</span></div>
          </div>
          <div class="activity-trail-toolbar" aria-label="Filter aktivitas">
            <label class="activity-search">${icon('search')}<input data-activity-query aria-label="Cari aktivitas" placeholder="Cari aktivitas..." value="${escapeHtml(activityQuery)}" /></label>
            <label class="activity-select">${icon('users')}<select data-activity-actor aria-label="Filter pengguna"><option value="all">${user.role === 'admin' ? 'Semua pengguna' : 'Aktivitas saya'}</option>${actorOptions}</select>${icon('chevron')}</label>
            <label class="activity-select">${icon('calendar')}<select data-activity-period aria-label="Filter waktu">${(Object.keys(periodLabels) as ActivityPeriod[]).map((period) => `<option value="${period}" ${activityPeriod === period ? 'selected' : ''}>${periodLabels[period]}</option>`).join('')}</select>${icon('chevron')}</label>
          </div>
          <div class="activity-timeline">${days.size ? [...days.entries()].map(([date, groups]) => {
            const day = new Date(`${date}T12:00:00`);
            const isToday = date === dateKey(new Date());
            const dayLabel = day.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            return `<section class="activity-day"><header class="activity-day-heading"><span class="activity-day-icon">${icon('calendar')}</span><h2>${isToday ? 'Hari ini' : day.toLocaleDateString('id-ID', { weekday: 'long' })}<b> · ${escapeHtml(dayLabel)}</b></h2><span></span></header><div class="activity-day-groups">${groups.map((group) => {
              const groupCollapsed = collapsedActivityGroups.has(group.key);
              const newest = group.events[0];
              const oldest = group.events[group.events.length - 1];
              const duration = Math.max(1, Math.round((new Date(newest.createdAt).getTime() - new Date(oldest.createdAt).getTime()) / 60000));
              const timeRange = group.events.length > 1 ? `${activityTime(oldest.createdAt)} – ${activityTime(newest.createdAt)}` : activityTime(newest.createdAt);
              return `<article class="activity-actor-group ${groupCollapsed ? 'is-collapsed' : ''}">
                <div class="activity-group-time"><time>${timeRange}</time><i></i></div>
                <div class="activity-rail-node"><span>${escapeHtml(group.actorName.slice(0, 1).toUpperCase())}</span></div>
                <div class="activity-group-card"><button class="activity-group-header" data-activity-group-toggle="${escapeHtml(group.key)}" aria-expanded="${!groupCollapsed}"><span><strong>${escapeHtml(group.actorName)}</strong><small>${group.events.length} aktivitas${group.events.length > 1 ? ` · ${duration} menit` : ''}</small></span>${icon('chevron')}</button>
                ${groupCollapsed ? '' : `<div class="activity-event-list">${group.events.map((event) => {
                  const eventExpanded = expandedActivityEvents.has(event.id);
                  const tone = event.entityType.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'general';
                  return `<div class="activity-event activity-tone-${tone} ${eventExpanded ? 'is-expanded' : ''}"><button class="activity-event-summary" data-activity-event-toggle="${escapeHtml(event.id)}" aria-expanded="${eventExpanded}"><span class="activity-event-icon">${activityEventIcon(event)}</span><span class="activity-event-copy"><strong>${escapeHtml(activityActionLabel(event))}</strong><small>${escapeHtml(event.description)}</small></span><time datetime="${escapeHtml(event.createdAt)}">${activityTime(event.createdAt, true)}</time><span class="activity-event-toggle">${icon('chevron')}</span></button>${eventExpanded ? `<div class="activity-event-detail"><span><b>Aksi:</b> ${escapeHtml(event.action)}</span><span><b>Entitas:</b> ${escapeHtml(event.entityType)}</span><span><b>Event:</b> ${escapeHtml(event.id.slice(0, 8))}</span><span><b>Actor:</b> ${escapeHtml(event.actorEmail)} · ${escapeHtml(event.actorRole)}</span></div>` : ''}</div>`;
                }).join('')}</div>`}</div>
              </article>`;
            }).join('')}</div></section>`;
          }).join('') : '<div class="activity-empty"><span class="activity-day-icon">'+icon('activity')+'</span><strong>Tidak ada aktivitas</strong><p>Ubah pencarian atau filter untuk melihat event lain.</p></div>'}</div>
          ${actorGroups.length > activityVisibleGroups ? `<button class="activity-load-more" data-activity-load-more><span></span>Lihat aktivitas sebelumnya${icon('chevron')}</button>` : ''}`;
}

function formatOverviewCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function relativeOverviewTime(value: string, reference = new Date()) {
  const difference = Math.max(0, reference.getTime() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Kemarin' : `${days} hari lalu`;
}

function renderOverviewPage(user: AuthUser, visible: { log: ApiLog; index: number }[], successCount: number) {
  const now = new Date();
  const lifestyle = lifestyleOverviewSnapshot();
  const learning = Object.entries(learningEntries).flatMap(([date, entries]) => entries.map((entry) => ({ ...entry, date })));
  const summary = calculateOverviewSummary({ now, doing: doingOverviewEntries(), learning, workouts: workoutOverviewSessions(), journals: lifestyle.journals, spending: lifestyle.spending });
  const ready = overviewDataState === 'ready' || overviewDataState === 'partial';
  const sourceReady = (source: OverviewSource) => ready && !overviewFailedSources.has(source);
  const value = (content: string | number, source: OverviewSource) => sourceReady(source) ? String(content) : overviewDataState === 'loading' ? '…' : '—';
  const helper = (content: string, source: OverviewSource) => sourceReady(source) ? content : overviewDataState === 'loading' ? 'Menyinkronkan data akun' : 'Sumber data belum tersedia';
  const greeting = now.getHours() < 11 ? 'Selamat pagi' : now.getHours() < 15 ? 'Selamat siang' : now.getHours() < 19 ? 'Selamat sore' : 'Selamat malam';
  const personalActivity = [...activityEvents].filter((entry) => entry.userId === user.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
  const recentChanges = [...changeLogEntries].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 3);
  const modules = [
    { page: 'doing', icon: 'doing', label: 'Doing', copy: 'Ubah ide menjadi langkah yang bisa diselesaikan.', metric: value(summary.doing.active, 'doing'), unit: 'task aktif', note: helper(`${summary.doing.blocked} blocked · ${summary.doing.completedToday} selesai hari ini`, 'doing') },
    { page: 'learning', icon: 'calendar', label: 'Learning', copy: 'Catat pelajaran dan lanjutkan material berikutnya.', metric: value(summary.learning.thisWeek, 'learning'), unit: 'catatan minggu ini', note: helper(`${summary.learning.completedThisWeek} sudah selesai`, 'learning') },
    { page: 'workout', icon: 'workout', label: 'Workout', copy: 'Rencanakan sesi dan ikuti setiap gerakan.', metric: value(summary.workout.completedThisWeek, 'lifestyle'), unit: 'sesi selesai', note: helper(`${summary.workout.plannedThisWeek} terencana minggu ini`, 'lifestyle') },
    { page: 'journaling', icon: 'journal', label: 'Journaling', copy: 'Simpan pikiran, cerita, dan perubahan sudut pandang.', metric: value(summary.journaling.thisMonth, 'lifestyle'), unit: 'catatan bulan ini', note: helper(summary.journaling.latest ? `Terakhir ${relativeOverviewTime(summary.journaling.latest.updatedAt, now)}` : 'Belum ada catatan', 'lifestyle') },
    { page: 'spending', icon: 'spending', label: 'Spending', copy: 'Kenali arus pengeluaran tanpa kehilangan konteks.', metric: sourceReady('lifestyle') ? formatOverviewCurrency(summary.spending.thisMonth) : value('', 'lifestyle'), unit: 'bulan ini', note: helper(`${summary.spending.transactions} transaksi`, 'lifestyle') },
  ];
  const focusItems = ready ? [
    ...(sourceReady('doing') ? summary.today.priorityDoing.map((entry) => `<button type="button" class="overview-focus-row" data-overview-route="/doing"><span class="overview-focus-icon">${icon('doing')}</span><span><small>DOING · ${escapeHtml(entry.priority.toUpperCase())}</small><strong>${escapeHtml(entry.title)}</strong><em>${entry.timeBlockStart ? `${escapeHtml(entry.timeBlockStart)} · ` : ''}${entry.estimatedMinutes ? `${entry.estimatedMinutes} menit · ` : ''}${escapeHtml(entry.energyFocus ?? 'focus')}</em></span>${icon('arrow')}</button>`) : []),
    ...(sourceReady('lifestyle') && summary.today.workout ? [`<button type="button" class="overview-focus-row" data-overview-route="/workout?date=${summary.range.today}"><span class="overview-focus-icon">${icon('workout')}</span><span><small>WORKOUT · ${escapeHtml(summary.today.workout.status.toUpperCase())}</small><strong>${escapeHtml(summary.today.workout.name)}</strong><em>${summary.today.workout.localTime ? `${escapeHtml(summary.today.workout.localTime)} · ` : ''}${summary.today.workout.movements.length} gerakan</em></span>${icon('arrow')}</button>`] : []),
    ...(sourceReady('learning') ? summary.today.learning.map((entry) => `<button type="button" class="overview-focus-row" data-overview-route="/learning"><span class="overview-focus-icon">${icon('calendar')}</span><span><small>LEARNING · ${entry.completed ? 'SELESAI' : 'HARI INI'}</small><strong>${escapeHtml(entry.title)}</strong><em>${entry.completed ? 'Catatan sudah ditandai selesai' : 'Lanjutkan catatan pembelajaran'}</em></span>${icon('arrow')}</button>`) : []),
  ].slice(0, 5).join('') : '';

  return `<div class="overview-home ${overviewMotionEnabled ? '' : 'motion-off'}">
    <section class="overview-hero" data-overview-hero>
      <div class="overview-hero-copy"><p class="eyebrow">PERSONAL OVERVIEW</p><h1>${greeting}, ${escapeHtml(user.displayName.split(/\s+/)[0] || user.displayName)}.</h1><p class="subheading">Satu pandangan untuk memilih apa yang layak mendapat perhatianmu hari ini.</p><div class="overview-date-line"><span>${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><i></i><span>${user.role === 'admin' ? 'Personal admin view' : 'Personal workspace'}</span></div></div>
      <div class="overview-kinetic" aria-hidden="true"><span class="overview-orbit orbit-a" data-overview-depth=".35"></span><span class="overview-orbit orbit-b" data-overview-depth="-.28"></span><span class="overview-z" data-overview-depth=".7">Z</span><span class="overview-note note-a" data-overview-depth="1">ONE THING AT A TIME</span><span class="overview-note note-b" data-overview-depth="-.8">YOUR PACE · YOUR SPACE</span></div>
      <button type="button" class="overview-motion-toggle" data-overview-motion aria-pressed="${overviewMotionEnabled}" title="Aktifkan atau nonaktifkan motion dekoratif">${icon(overviewMotionEnabled ? 'pause' : 'next')}<span>Motion ${overviewMotionEnabled ? 'on' : 'off'}</span></button>
    </section>
    ${overviewDataState === 'partial' || overviewDataState === 'error' ? `<div class="overview-data-notice" role="status">${icon('info')}<span><strong>${overviewDataState === 'partial' ? 'Sebagian ringkasan belum tersedia.' : 'Ringkasan belum dapat diperbarui.'}</strong> ${escapeHtml(backendError || `Sumber bermasalah: ${[...overviewFailedSources].join(', ')}.`)} Modul lain tetap dapat digunakan.</span></div>` : ''}
    <section class="overview-glance" aria-label="Ringkasan hari ini"><div><strong>${value(summary.doing.active, 'doing')}</strong><span>task aktif</span></div><div><strong>${value(summary.learning.thisWeek, 'learning')}</strong><span>learning minggu ini</span></div><div><strong>${value(summary.workout.completedThisWeek, 'lifestyle')}</strong><span>workout minggu ini</span></div><div><strong>${sourceReady('lifestyle') ? formatOverviewCurrency(summary.spending.thisMonth) : value('', 'lifestyle')}</strong><span>spending bulan ini</span></div></section>
    <section class="overview-section"><div class="overview-section-heading"><div><p class="eyebrow">WORKSPACE SNAPSHOT</p><h2>Lima ruang, satu ritme.</h2></div><p>Pilih satu ruang untuk melihat detail lengkap.</p></div><div class="overview-module-grid">${modules.map((module) => `<button type="button" class="overview-module-card overview-${module.page}" data-overview-route="${pagePaths[module.page as Page]}"><span class="overview-card-top"><i>${icon(module.icon)}</i>${icon('arrow')}</span><span><strong>${module.label}</strong><small>${module.copy}</small></span><span class="overview-module-metric"><b>${escapeHtml(module.metric)}</b><em>${module.unit}</em></span><span class="overview-module-note">${escapeHtml(module.note)}</span></button>`).join('')}</div></section>
    <div class="overview-split"><section class="overview-section overview-focus"><div class="overview-section-heading"><div><p class="eyebrow">TODAY'S FOCUS</p><h2>Mulai dari yang dekat.</h2></div></div><div class="overview-panel">${overviewDataState === 'loading' ? '<div class="overview-empty">Menyusun fokus hari ini…</div>' : overviewDataState === 'error' || (overviewFailedSources.has('doing') && overviewFailedSources.has('learning') && overviewFailedSources.has('lifestyle')) ? '<div class="overview-empty">Fokus belum dapat dimuat. Buka modul untuk melanjutkan.</div>' : focusItems || '<div class="overview-empty"><strong>Belum ada fokus untuk hari ini.</strong><span>Tambahkan task, learning, atau jadwal workout saat kamu siap.</span></div>'}</div></section>
    <section class="overview-section overview-activity"><div class="overview-section-heading"><div><p class="eyebrow">RECENT ACTIVITY</p><h2>Jejak kecilmu.</h2></div><button type="button" data-overview-route="/activity">Lihat semua ${icon('arrow')}</button></div><div class="overview-panel">${overviewDataState === 'loading' ? '<div class="overview-empty">Memuat aktivitas…</div>' : overviewFailedSources.has('activity') ? '<div class="overview-empty">Aktivitas belum tersedia.</div>' : personalActivity.length ? personalActivity.map((entry) => `<div class="overview-activity-row"><span>${activityEventIcon(entry)}</span><span><strong>${escapeHtml(activityActionLabel(entry))}</strong><small>${escapeHtml(entry.description)}</small></span><time datetime="${escapeHtml(entry.createdAt)}" title="${escapeHtml(new Date(entry.createdAt).toLocaleString('id-ID'))}">${relativeOverviewTime(entry.createdAt, now)}</time></div>`).join('') : '<div class="overview-empty"><strong>Belum ada aktivitas.</strong><span>Aksi pertamamu akan muncul di sini.</span></div>'}</div></section></div>
    <section class="overview-section overview-quick-actions"><div class="overview-section-heading"><div><p class="eyebrow">QUICK ACTIONS</p><h2>Buat ruang untuk satu hal.</h2></div><p>Aksi membuka form asli pada modul terkait.</p></div><div class="overview-action-list"><button data-overview-action="doing">${icon('doing')}<span>Tambah Doing</span></button><button data-overview-action="learning">${icon('calendar')}<span>Tambah Learning</span></button><button data-overview-action="workout">${icon('workout')}<span>Buat Workout</span></button><button data-overview-route="/journaling?view=write">${icon('journal')}<span>Tulis Journal</span></button><button data-overview-action="spending">${icon('spending')}<span>Catat Spending</span></button></div></section>
    <section class="overview-section overview-changes"><div class="overview-section-heading"><div><p class="eyebrow">PRODUCT NOTES</p><h2>Zeno juga bertumbuh.</h2></div><button type="button" data-overview-route="/change-log">Change Log ${icon('arrow')}</button></div><div class="overview-change-grid">${recentChanges.length ? recentChanges.map((entry) => `<article><div><span>${escapeHtml(entry.category)}</span><time datetime="${escapeHtml(entry.occurredAt)}">${new Date(entry.occurredAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</time></div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.description)}</p></article>`).join('') : '<div class="overview-empty">Belum ada catatan perubahan.</div>'}</div></section>
    <details class="overview-session-log" ${query ? 'open' : ''}><summary><span>${icon('file')}<span><small>SESSION OBSERVABILITY</small><strong>Zeno session log</strong></span></span><span>${logs.length} entries ${icon('chevron')}</span></summary><div class="overview-session-content">${renderSessionEntriesContent(visible, successCount, overviewFailedSources.has('session') ? 'Bundled fallback · API unavailable' : 'Served by Zeno API')}</div></details>
  </div>`;
}

function isAuthPath(pathname: string) {
  return pathname === '/login' || pathname === '/register' || pathname === '/verify-email';
}

function isPublicLandingPath(pathname: string) {
  return pathname === '/';
}

function syncRouteFromLocation() {
  route = resolveAppRoute(window.location.pathname);
  page = pageForRoute(route);
  if (isLifestylePage(page)) syncLifestyleRoute(page);
}

function navigateTo(pathname: string) {
  history.pushState({ pathname }, '', pathname);
  syncRouteFromLocation();
  editingLearningId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderRouteNotFound(pathname: string) {
  return `<div class="learning-materials"><div class="page-heading"><div><p class="eyebrow">ZENO ROUTING</p><h1>Page tidak ditemukan</h1><p class="subheading">Alamat ini belum tersedia di workspace Zeno.</p></div></div><article class="learning-material-not-found" role="alert"><span class="material-kicker">404 · ROUTE</span><h1>Route tidak tersedia</h1><p>Alamat <code>${escapeHtml(pathname)}</code> tidak dapat ditemukan.</p><button type="button" class="learning-material-back" data-page="overview">Kembali ke Overview</button></article></div>`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Terjadi kesalahan.';
}

function navigateAuth(view: AuthView) {
  authView = view;
  authState = { busy: false, message: '', error: '', verificationStatus: view === 'verify' ? 'pending' : 'idle' };
  history.pushState({ authView: view }, '', authPath(view));
  render();
  if (view === 'verify') void verifyCurrentEmailToken();
}

function bindCurrentAuthScreen() {
  bindAuthEvents({
    onNavigate: navigateAuth,
    onLogin: (email, password) => { void loginAccount(email, password); },
    onRegister: (displayName, email, password) => { void registerAccount(displayName, email, password); },
  });
}

async function registerAccount(displayName: string, email: string, password: string) {
  authState = { busy: true, message: '', error: '', verificationStatus: 'idle' };
  render();
  try {
    const response = await api.register({ displayName, email, password });
    authState = { busy: false, message: response.message, error: '', verificationStatus: 'idle' };
  } catch (error) {
    authState = { busy: false, message: '', error: errorMessage(error), verificationStatus: 'idle' };
  }
  render();
}

async function loginAccount(email: string, password: string) {
  authState = { busy: true, message: '', error: '', verificationStatus: 'idle' };
  render();
  try {
    currentUser = (await api.login(email, password)).user;
    authChecked = true;
    authState = { busy: false, message: '', error: '', verificationStatus: 'idle' };
    route = { kind: 'page', page: 'overview' };
    page = 'overview';
    history.replaceState({ page }, '', pagePaths.overview);
    render();
    await syncBackend();
  } catch (error) {
    authState = { busy: false, message: '', error: errorMessage(error), verificationStatus: 'idle' };
    render();
  }
}

async function verifyCurrentEmailToken() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  authView = 'verify';
  authState = { busy: true, message: '', error: '', verificationStatus: 'pending' };
  render();
  if (!token) {
    authState = { busy: false, message: '', error: 'Token verifikasi tidak ditemukan.', verificationStatus: 'error' };
    render();
    return;
  }
  try {
    const response = await api.verifyEmail(token);
    authState = { busy: false, message: response.message, error: '', verificationStatus: 'success' };
  } catch (error) {
    authState = { busy: false, message: '', error: errorMessage(error), verificationStatus: 'error' };
  }
  render();
}

async function saveProfile(displayName: string) {
  profileBusy = true; profileMessage = ''; profileError = ''; render();
  try {
    currentUser = (await api.updateProfile(displayName)).user;
    profileMessage = 'Profil berhasil diperbarui.';
  } catch (error) {
    profileError = errorMessage(error);
  }
  profileBusy = false; render();
}

async function logoutAccount() {
  profileBusy = true; render();
  try { await api.logout(); } catch { /* cookie is cleared locally by the next auth gate */ }
  currentUser = null; authChecked = true; profileBusy = false; dashboardEntryPending = true;
  authView = 'login'; authState = { busy: false, message: 'Anda sudah logout.', error: '', verificationStatus: 'idle' };
  history.replaceState({ authView: 'login' }, '', '/login');
  render();
}

async function bootstrapAuth() {
  if (window.location.pathname === '/verify-email') {
    authChecked = true;
    currentUser = null;
    await verifyCurrentEmailToken();
    return;
  }
  try {
    currentUser = (await api.me()).user;
    authChecked = true;
    if (isAuthPath(window.location.pathname)) {
      route = { kind: 'page', page: 'overview' };
      page = 'overview';
      history.replaceState({ page }, '', pagePaths.overview);
    } else {
      syncRouteFromLocation();
    }
    if (page === 'settings' && currentUser.role !== 'admin') {
      route = { kind: 'page', page: 'profile' };
      page = 'profile';
      history.replaceState({ page }, '', pagePaths.profile);
    }
    await ensureAppStyles();
    render();
    await syncBackend();
  } catch (error) {
    const publicLandingAlreadyRendered = isPublicLandingPath(window.location.pathname) && Boolean(app.querySelector('.zeno-landing'));
    if (!(error instanceof ApiError) || error.status !== 401) backendError = errorMessage(error);
    currentUser = null; authChecked = true;
    authView = authViewFromPath(window.location.pathname);
    if (!isAuthPath(window.location.pathname) && !isPublicLandingPath(window.location.pathname)) {
      authView = 'login';
      history.replaceState({ authView }, '', '/login');
    }
    if (publicLandingAlreadyRendered) return;
    await ensureAppStyles();
    render();
  }
}

async function syncBackend() {
  overviewDataState = 'loading';
  overviewFailedSources.clear();
  const errors: string[] = [];
  const [healthResult, sessionResult, activityResult, settingsResult, learningResult, changeLogResult, lifestyleResult, doingResult] = await Promise.allSettled([
    api.health(), api.overview(), api.activity(), api.settings(), api.learning(), api.changeLogs(), syncLifestyleData(), syncDoingData(),
  ]);
  const fail = (source: OverviewSource | null, reason: unknown) => {
    if (source) overviewFailedSources.add(source);
    errors.push(errorMessage(reason));
  };

  backendOnline = healthResult.status === 'fulfilled';
  if (healthResult.status === 'rejected') fail(null, healthResult.reason);
  if (sessionResult.status === 'fulfilled') {
    logs = sessionResult.value.entries.map((entry) => ({ ...entry }));
    runtimeSourceFile = sessionResult.value.sourceFile;
    runtimeGeneratedAt = sessionResult.value.generatedAt;
  } else fail('session', sessionResult.reason);
  if (activityResult.status === 'fulfilled') activityEvents = activityResult.value.events;
  else fail('activity', activityResult.reason);
  if (settingsResult.status === 'fulfilled') backendSettings = settingsResult.value;
  else fail(null, settingsResult.reason);
  if (changeLogResult.status === 'fulfilled') {
    if (changeLogResult.value.entries.length) changeLogEntries = changeLogResult.value.entries;
  } else fail(null, changeLogResult.reason);
  if (lifestyleResult.status === 'rejected') fail('lifestyle', lifestyleResult.reason);
  if (doingResult.status === 'rejected') fail('doing', doingResult.reason);

  if (learningResult.status === 'fulfilled') {
    try {
      let remoteEntries = learningResult.value.entries;
      if (!remoteEntries.length) {
        const localEntries = Object.entries(learningEntries).flatMap(([date, entries]) => entries.filter((entry) => !entry.id.startsWith('seed-')).map((entry) => ({ date, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed })));
        if (localEntries.length) {
          await Promise.all(localEntries.map((entry) => api.createLearning(entry)));
          remoteEntries = (await api.learning()).entries;
        }
      }
      learningEntries = remoteEntries.reduce<Record<string, LearningEntry[]>>((grouped, entry) => {
        (grouped[entry.date] ??= []).push({ id: entry.id, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed });
        return grouped;
      }, {});
      localStorage.setItem(learningStorageKey, JSON.stringify(learningEntries));
    } catch (error) {
      fail('learning', error);
    }
  } else fail('learning', learningResult.reason);

  const personalSources: OverviewSource[] = ['doing', 'learning', 'lifestyle', 'activity'];
  const allPersonalFailed = personalSources.every((source) => overviewFailedSources.has(source));
  overviewDataState = allPersonalFailed ? 'error' : overviewFailedSources.size ? 'partial' : 'ready';
  backendError = [...new Set(errors)].join(' · ');
  render();
}
async function persistLearningEntry(entry: LearningEntry) {
  try {
    const updated = await api.updateLearning(entry.id, { date: selectedLearningDate, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed });
    learningEntries[selectedLearningDate] = (learningEntries[selectedLearningDate] ?? []).map((item) => item.id === entry.id ? { id: updated.id, title: updated.title, note: updated.note, category: updated.category, completed: updated.completed } : item);
    localStorage.setItem(learningStorageKey, JSON.stringify(learningEntries));
    backendOnline = true;
    backendError = '';
    editingLearningId = null;
  } catch (error) {
    backendOnline = false;
    backendError = error instanceof Error ? error.message : 'Backend tidak tersedia';
  }
  render();
}
async function removeLearningEntry(entry: LearningEntry) {
  try {
    await api.deleteLearning(entry.id, selectedLearningDate);
    learningEntries[selectedLearningDate] = (learningEntries[selectedLearningDate] ?? []).filter((item) => item.id !== entry.id);
    localStorage.setItem(learningStorageKey, JSON.stringify(learningEntries));
    pendingDeleteLearningId = null;
    backendOnline = true;
    backendError = '';
  } catch (error) {
    backendOnline = false;
    backendError = error instanceof Error ? error.message : 'Backend tidak tersedia';
  }
  render();
}

let disposeLanding: (() => void) | undefined;

function bindOverviewEvents() {
  const root = document.querySelector<HTMLElement>('.overview-home');
  if (!root) return;
  const disposers: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(element: HTMLElement | Window, event: K, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => {
    element.addEventListener(event, handler, options);
    disposers.push(() => element.removeEventListener(event, handler, options));
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let scrollFrame = 0;
  const motionAllowed = () => overviewMotionEnabled && !reduceMotion.matches;
  const resetTransforms = () => {
    root.querySelectorAll<HTMLElement>('[data-overview-depth], .overview-module-card').forEach((element) => { element.style.transform = ''; });
    const kinetic = root.querySelector<HTMLElement>('.overview-kinetic');
    if (kinetic) kinetic.style.translate = '';
  };
  reduceMotion.addEventListener('change', resetTransforms);
  disposers.push(() => reduceMotion.removeEventListener('change', resetTransforms));

  root.querySelector<HTMLButtonElement>('[data-overview-motion]')?.addEventListener('click', () => {
    overviewMotionEnabled = !overviewMotionEnabled;
    localStorage.setItem(overviewMotionStorageKey, overviewMotionEnabled ? 'on' : 'off');
    resetTransforms();
    render();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-overview-route]').forEach((button) => button.addEventListener('click', () => navigateTo(button.dataset.overviewRoute!)));
  root.querySelectorAll<HTMLButtonElement>('[data-overview-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.overviewAction;
    const destinations: Record<string, { path: string; selector: string; click?: boolean }> = {
      doing: { path: '/doing', selector: '[data-doing-new]', click: true },
      learning: { path: '/learning', selector: '#learning-form input[name="title"]' },
      workout: { path: `/workout?date=${dateKey(new Date())}`, selector: '[data-workout-create-session]', click: true },
      spending: { path: '/spending', selector: '#spending-form input[name="description"]' },
    };
    const destination = action ? destinations[action] : undefined;
    if (!destination) return;
    navigateTo(destination.path);
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(destination.selector);
      if (destination.click) target?.click();
      else target?.focus();
    });
  }));

  const hero = root.querySelector<HTMLElement>('[data-overview-hero]');
  if (hero) listen(hero, 'pointermove', ((event: PointerEvent) => {
    if (!motionAllowed() || !finePointer.matches || event.pointerType === 'touch') return;
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      hero.querySelectorAll<HTMLElement>('[data-overview-depth]').forEach((element) => {
        const depth = Number(element.dataset.overviewDepth ?? 0);
        element.style.transform = `translate3d(${x * depth * 28}px, ${y * depth * 20}px, 0)`;
      });
    });
  }) as EventListener);
  if (hero) listen(hero, 'pointerleave', resetTransforms);
  listen(window, 'scroll', (() => {
    if (!motionAllowed()) return;
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      const kinetic = root.querySelector<HTMLElement>('.overview-kinetic');
      if (kinetic) kinetic.style.translate = `0 ${Math.min(window.scrollY, 480) * .035}px`;
    });
  }) as EventListener, { passive: true });

  root.querySelectorAll<HTMLElement>('.overview-module-card').forEach((card) => {
    listen(card, 'pointermove', ((event: PointerEvent) => {
      if (!motionAllowed() || !finePointer.matches || event.pointerType === 'touch') return;
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      card.style.transform = `perspective(900px) rotateX(${-y * 3.5}deg) rotateY(${x * 3.5}deg) translateY(-4px)`;
    }) as EventListener);
    listen(card, 'pointerleave', () => { card.style.transform = ''; });
  });

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    if (motionAllowed()) entry.target.classList.add('overview-revealed');
    observer.unobserve(entry.target);
  }), { threshold: .08 });
  root.querySelectorAll('.overview-section, .overview-session-log').forEach((element) => observer.observe(element));
  disposers.push(() => observer.disconnect());
  disposeOverviewMotion = () => {
    window.cancelAnimationFrame(frame);
    window.cancelAnimationFrame(scrollFrame);
    disposers.forEach((dispose) => dispose());
    disposeOverviewMotion = undefined;
  };
}

function renderPublicLanding() {
  document.title = 'Zeno | Personal workspace';
  app.innerHTML = renderLandingPage(theme);
  disposeLanding = bindLandingEvents({
    onThemeToggle: () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('hermes-monitor-theme', theme);
      applyTheme();
    },
  });
}

function orbitRole(): OrbitRole {
  return currentUser?.role === 'admin' ? 'admin' : 'user';
}

function orbitViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function applyManualOrbitTriggerPosition(trigger: HTMLButtonElement, requested: OrbitPoint) {
  const bounds = trigger.getBoundingClientRect();
  orbitTriggerPosition = clampOrbitTriggerPosition(requested, { width: bounds.width, height: bounds.height }, orbitViewport());
  trigger.dataset.orbitManual = 'true';
  trigger.style.setProperty('--orbit-trigger-left', `${orbitTriggerPosition.x}px`);
  trigger.style.setProperty('--orbit-trigger-top', `${orbitTriggerPosition.y}px`);
}

function positionOrbitDialogFromTrigger(trigger: HTMLButtonElement) {
  const bounds = trigger.getBoundingClientRect();
  orbitDialogPosition = placeOrbitDialog(bounds, orbitDialogSize(orbitViewport()), orbitViewport());
  const dialog = document.querySelector<HTMLElement>('.orbit-dialog');
  if (!dialog) return;
  dialog.dataset.orbitPositioned = 'true';
  dialog.dataset.orbitSide = orbitDialogPosition.side;
  dialog.style.setProperty('--orbit-dialog-left', `${orbitDialogPosition.left}px`);
  dialog.style.setProperty('--orbit-dialog-top', `${orbitDialogPosition.top}px`);
}

function closeOrbitCommand(restoreFocus = true) {
  if (!orbitOpen || orbitClosing) return;
  orbitTransitionToken++;
  const finish = () => {
    if (orbitCloseTimer !== null) window.clearTimeout(orbitCloseTimer);
    orbitCloseTimer = null;
    orbitClosing = false;
    orbitOpen = false;
    orbitGroupId = null;
    orbitPage = 0;
    orbitDialogPosition = null;
    render();
    if (restoreFocus) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.orbit-trigger')?.focus());
  };
  const overlay = document.querySelector<HTMLElement>('.orbit-overlay');
  if (!overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  orbitClosing = true;
  overlay.classList.add('is-closing');
  document.querySelector<HTMLButtonElement>('.orbit-trigger')?.focus();
  overlay.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = true; });
  document.querySelector<HTMLButtonElement>('.orbit-trigger')?.setAttribute('aria-expanded', 'false');
  orbitCloseTimer = window.setTimeout(finish, 300);
}

async function changeOrbitLayer(group: string | null, page = 0, preferredId?: string) {
  if (!orbitOpen || orbitClosing) return;
  const token = ++orbitTransitionToken;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const outgoingPetals = [...document.querySelectorAll<HTMLElement>('.orbit-segment')];
  if (!reduce && outgoingPetals.length) {
    await Promise.all(outgoingPetals.map((petal) => petal.animate(
      [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.82)'}],
      {duration:70,easing:'cubic-bezier(.4,0,.8,.2)',fill:'both'},
    ).finished.catch(() => {})));
  }
  if (token !== orbitTransitionToken || !orbitOpen || orbitClosing) return;
  orbitGroupId = group;
  orbitPage = page;
  orbitLayerTransitioning = true;
  render();
  orbitLayerTransitioning = false;
  focusOrbitLayer(preferredId);
}

function focusOrbitLayer(preferredId?: string) {
  requestAnimationFrame(() => {
    if (!orbitOpen || orbitClosing) return;
    const preferred = preferredId ? document.querySelector<HTMLButtonElement>(`[data-orbit-segment="${CSS.escape(preferredId)}"]`) : null;
    const active = document.querySelector<HTMLButtonElement>('.orbit-segment.active');
    (preferred ?? active ?? document.querySelector<HTMLButtonElement>('.orbit-segment'))?.focus();
  });
}

function renderOrbitSegment(destination: OrbitNavigationItem | OrbitDestination, index: number, count: number, active: boolean) {
  const geometry = orbitSegmentGeometry(index, count);
  const hasChildren = 'children' in destination && Boolean(destination.children?.length);
  const action = hasChildren ? `data-orbit-group="${escapeHtml(destination.id)}"` : `data-orbit-route="${escapeHtml(destination.route)}"`;
  return `<button type="button" class="orbit-segment ${active ? 'active' : ''}" data-orbit-segment="${escapeHtml(destination.id)}" ${action} aria-label="${escapeHtml(hasChildren ? `Explore ${destination.label}` : `Open ${destination.label}`)}" aria-current="${active ? 'page' : 'false'}" ${hasChildren ? 'aria-haspopup="true"' : ''} style="--orbit-order:${index};--orbit-exit-order:${count - index - 1};--orbit-label-x:${geometry.labelX.toFixed(3)}%;--orbit-label-y:${geometry.labelY.toFixed(3)}%;clip-path:${geometry.clip}"><svg class="orbit-shape" viewBox="0 0 100 100" aria-hidden="true"><path d="${geometry.path}" /></svg><span class="orbit-segment-label"><span class="ph ph-${escapeHtml(destination.icon)}" aria-hidden="true"></span><strong>${escapeHtml(destination.label)}</strong>${hasChildren ? '<span class="orbit-child-indicator ph ph-caret-right" aria-hidden="true"></span>' : ''}</span></button>`;
}

function renderOrbitCommand() {
  const role = orbitRole();
  const navigation = visibleOrbitNavigation(role);
  const active = activeOrbitLocation(window.location.pathname, role);
  const group = orbitGroupId ? navigation.find((item) => item.id === orbitGroupId && item.children?.length) ?? null : null;
  const layerItems: Array<OrbitNavigationItem | OrbitDestination> = group?.children ?? navigation;
  const pagination = paginateOrbitItems(layerItems, orbitPage, 8);
  if (pagination.currentPage !== orbitPage) orbitPage = pagination.currentPage;
  const segments = pagination.items.map((item, index) => renderOrbitSegment(item, index, pagination.items.length, group ? item.id === active.destination.id : item.id === active.item.id)).join('');
  const paginationControls = pagination.pageCount > 1 ? `<div class="orbit-pagination" aria-label="Orbit pages"><button type="button" data-orbit-page="prev" aria-label="Previous Orbit page" ${pagination.currentPage === 0 ? 'disabled' : ''}>${icon('back')}</button><span>${pagination.currentPage + 1}/${pagination.pageCount}</span><button type="button" data-orbit-page="next" aria-label="Next Orbit page" ${pagination.currentPage === pagination.pageCount - 1 ? 'disabled' : ''}>${icon('next')}</button></div>` : '';
  const center = group ? `<button type="button" class="orbit-center-action" data-orbit-back aria-label="Back to main menu">${icon('back')}<span>Back</span></button>` : `<strong class="orbit-wordmark">ZENO</strong>`;
  const closeCenterDelay = 90 + Math.max(0, pagination.items.length - 1) * 14;
  const triggerPosition = orbitTriggerPosition ? `data-orbit-manual="true" style="--orbit-trigger-left:${orbitTriggerPosition.x}px;--orbit-trigger-top:${orbitTriggerPosition.y}px"` : 'data-orbit-manual="false"';
  const dialogPosition = orbitDialogPosition ? `data-orbit-positioned="true" data-orbit-side="${orbitDialogPosition.side}" style="--orbit-dialog-left:${orbitDialogPosition.left}px;--orbit-dialog-top:${orbitDialogPosition.top}px"` : 'data-orbit-positioned="false"';
  return `<button type="button" class="orbit-trigger" data-orbit-close ${triggerPosition} title="${orbitOpen ? 'Close Zeno navigation' : 'Drag to reposition · Click to open · Alt + Arrow to move'}" aria-label="${escapeHtml(orbitOpen ? 'Close Zeno navigation' : `Open Zeno navigation: ${active.label}`)}" aria-expanded="${orbitOpen}" aria-controls="orbit-command-dialog"><span class="orbit-trigger-icon">${icon(orbitOpen ? 'close' : 'compass')}</span><span class="orbit-trigger-label">${escapeHtml(active.label)}</span><span class="orbit-trigger-key">${orbitOpen ? 'Close' : 'Menu'}</span></button>${orbitOpen ? `<div class="orbit-overlay ${orbitClosing ? 'is-closing' : ''} ${orbitLayerTransitioning ? 'is-layer-swap' : ''}"><button type="button" class="orbit-backdrop" data-orbit-backdrop tabindex="-1" aria-label="Close Zeno navigation"></button><section class="orbit-dialog" ${dialogPosition} id="orbit-command-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(group ? `${group.label} destinations` : 'Zeno navigation')}"><div class="orbit-disc" data-layer="${group ? 'children' : 'root'}" style="--orbit-close-center-delay:${closeCenterDelay}ms">${segments}<div class="orbit-center">${center}</div>${paginationControls}</div></section></div>` : ''}`;
}

function bindOrbitTriggerDrag(trigger: HTMLButtonElement) {
  let drag: { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null;
  trigger.addEventListener('pointerdown', (event) => {
    if (orbitOpen || orbitClosing || !event.isPrimary || event.button !== 0) return;
    const bounds = trigger.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bounds.left, originY: bounds.top, moved: false };
    trigger.setPointerCapture(event.pointerId);
  });
  trigger.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    trigger.classList.add('is-dragging');
    applyManualOrbitTriggerPosition(trigger, { x: drag.originX + deltaX, y: drag.originY + deltaY });
  });
  trigger.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      orbitSuppressNextClick = true;
      window.setTimeout(() => { orbitSuppressNextClick = false; }, 0);
    }
    trigger.classList.remove('is-dragging');
    if (trigger.hasPointerCapture(event.pointerId)) trigger.releasePointerCapture(event.pointerId);
    drag = null;
  });
  trigger.addEventListener('pointercancel', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    trigger.classList.remove('is-dragging');
    drag = null;
  });
  trigger.addEventListener('keydown', (event) => {
    if (orbitOpen || !event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const bounds = trigger.getBoundingClientRect();
    const step = event.shiftKey ? 64 : 24;
    applyManualOrbitTriggerPosition(trigger, {
      x: bounds.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      y: bounds.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    });
  });
}

function bindOrbitCommand() {
  document.querySelector<HTMLElement>('.zeno-dashboard')?.toggleAttribute('inert', orbitOpen);
  document.querySelector<HTMLElement>('.skip-link')?.toggleAttribute('inert', orbitOpen);
  if (orbitClosing) document.querySelector<HTMLElement>('.orbit-disc')?.setAttribute('inert', '');
  if (orbitOpen && !orbitClosing) focusOrbitLayer();
  const orbitTrigger = document.querySelector<HTMLButtonElement>('.orbit-trigger');
  if (orbitTrigger) bindOrbitTriggerDrag(orbitTrigger);
  orbitTrigger?.addEventListener('click', () => {
    if (orbitSuppressNextClick) {
      orbitSuppressNextClick = false;
      return;
    }
    if (orbitClosing) {
      if (orbitCloseTimer !== null) window.clearTimeout(orbitCloseTimer);
      orbitCloseTimer = null;
      orbitClosing = false;
      orbitOpen = false;
      orbitTransitionToken++;
    }
    if (orbitOpen) {
      closeOrbitCommand();
      return;
    }
    if (orbitTrigger) positionOrbitDialogFromTrigger(orbitTrigger);
    orbitOpen = true;
    orbitGroupId = null;
    orbitPage = 0;
    render();
    focusOrbitLayer();
  });
  document.querySelectorAll<HTMLElement>('[data-orbit-backdrop]').forEach((control) => control.addEventListener('click', () => closeOrbitCommand()));
  document.querySelector<HTMLButtonElement>('[data-orbit-back]')?.addEventListener('click', () => {
    const previousGroup = orbitGroupId;
    void changeOrbitLayer(null, 0, previousGroup ?? undefined);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-orbit-group]').forEach((button) => button.addEventListener('click', () => {
    void changeOrbitLayer(button.dataset.orbitGroup ?? null);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-orbit-route]').forEach((button) => button.addEventListener('click', () => {
    const destination = button.dataset.orbitRoute;
    if (!destination || orbitClosing) return;
    orbitTransitionToken++;
    orbitOpen = false;
    orbitGroupId = null;
    orbitPage = 0;
    orbitDialogPosition = null;
    if (window.location.pathname !== destination) navigateTo(destination);
    else render();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.orbit-trigger')?.focus());
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-orbit-page]').forEach((button) => button.addEventListener('click', () => {
    void changeOrbitLayer(orbitGroupId, orbitPage + (button.dataset.orbitPage === 'next' ? 1 : -1));
  }));
  const onOrbitKey = (event: KeyboardEvent) => {
    if (!orbitOpen) return;
    const focusable = [...document.querySelectorAll<HTMLButtonElement>('.orbit-dialog button:not([disabled]):not([tabindex="-1"])')];
    const trigger = document.querySelector<HTMLButtonElement>('.orbit-trigger');
    if (trigger) focusable.push(trigger);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOrbitCommand();
      return;
    }
    if (event.key === 'Tab' && focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      const segments = [...document.querySelectorAll<HTMLButtonElement>('.orbit-segment')];
      const index = segments.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || !segments.length) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      segments[(index + direction + segments.length) % segments.length].focus();
    }
  };
  document.querySelector<HTMLElement>('.orbit-dialog')?.addEventListener('keydown', onOrbitKey);
  document.querySelector<HTMLElement>('.orbit-trigger')?.addEventListener('keydown', onOrbitKey);
}

let orbitDockFrame: number | null = null;
function updateOrbitTriggerDock() {
  orbitDockFrame = null;
  const trigger = document.querySelector<HTMLButtonElement>('.orbit-trigger');
  if (!trigger) return;
  if (orbitTriggerPosition) {
    applyManualOrbitTriggerPosition(trigger, orbitTriggerPosition);
    if (orbitOpen) positionOrbitDialogFromTrigger(trigger);
    return;
  }
  const controls = [...document.querySelectorAll<HTMLElement>('.doing-complete :is([data-doing-open],[data-doing-new],[data-doing-edit],[data-doing-delete],[data-doing-back],[data-doing-cancel],[data-doing-submit],[data-doing-delete-confirm],[data-doing-check])')];
  const workoutCriticalControls = [...document.querySelectorAll<HTMLElement>('[data-workout-save-set],[data-workout-retry],.rest-timer.visible,.end-actions button')];
  const journalCriticalControls = [...document.querySelectorAll<HTMLElement>('.feature-empty [data-journal-tab="write"]')];
  controls.push(...workoutCriticalControls, ...journalCriticalControls);
  const triggerRect = trigger.getBoundingClientRect();
  const avoidRects = controls.map((control) => control.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  trigger.dataset.orbitDock = chooseOrbitTriggerDock(
    { width: window.innerWidth, height: window.innerHeight },
    { width: triggerRect.width, height: triggerRect.height },
    avoidRects,
  );
  if (orbitOpen) requestAnimationFrame(() => positionOrbitDialogFromTrigger(trigger));
}
function scheduleOrbitTriggerDock() {
  if (orbitDockFrame !== null) cancelAnimationFrame(orbitDockFrame);
  orbitDockFrame = requestAnimationFrame(updateOrbitTriggerDock);
}
window.addEventListener('scroll', scheduleOrbitTriggerDock, true);
window.addEventListener('resize', scheduleOrbitTriggerDock);

function render() {
  disposeLanding?.();
  disposeLanding = undefined;
  disposeOverviewMotion?.();
  if (!authChecked) {
    if (isPublicLandingPath(window.location.pathname)) {
      renderPublicLanding();
      return;
    }
    document.title = 'Loading · Zeno';
    app.innerHTML = '<main class="auth-shell"><section class="auth-brand-panel"><div class="auth-brand-lockup"><img src="/zeno-logo-96.webp" width="44" height="44" alt="Zeno" /><div><strong>Zeno</strong><span>PERSONAL WORKSPACE</span></div></div></section><section class="auth-form-panel"><div class="auth-card auth-verify-card"><div class="auth-spinner" aria-label="Loading"></div><p>Memeriksa session…</p></div></section></main>';
    return;
  }
  if (!currentUser) {
    if (isPublicLandingPath(window.location.pathname)) {
      renderPublicLanding();
      return;
    }
    document.title = `${authView === 'register' ? 'Register' : authView === 'verify' ? 'Verify Email' : 'Login'} · Zeno`;
    app.innerHTML = renderAuthScreen(authView, authState);
    bindCurrentAuthScreen();
    return;
  }
  const visible = visibleLogs();
  const successCount = logs.filter((item) => item.status === 'success').length;
  const pageLabel = ({ overview: 'Overview', activity: 'Activity', settings: 'Settings', profile: 'Profile', changelog: 'Change Log', doing: 'Doing', learning: 'Learning', workout: 'Workout', journaling: 'Journaling', spending: 'Spending' } as Record<Page, string>)[page];
  const pendingDeleteEntry = (learningEntries[selectedLearningDate] ?? []).find((entry) => entry.id === pendingDeleteLearningId);
  document.title = `${pageLabel} · Zeno`;
  if (isLearningMaterialRoute(route)) ensureLearningMaterialData(route, render);
  const pageContent = route.kind === 'doing-detail' || route.kind === 'doing-editor' ? renderDoingPage(route) : route.kind !== 'page' ? (isLearningRoute(route) ? learningMaterials(route) : isWorkoutMaterialsRoute(route) ? renderWorkoutMaterials(route) : renderRouteNotFound(window.location.pathname)) : page === 'overview' ? renderOverviewPage(currentUser, visible, successCount) : page === 'changelog' ? `
          <div class="page-heading"><div><p class="eyebrow">CHANGE HISTORY</p><h1>Change log</h1><p class="subheading">Lacak riwayat update berdasarkan hari, tanggal, dan permintaan.</p></div><div class="connection"><span class="pulse"></span><span>${changeLogEntries.length} updates · ${backendOnline ? 'PostgreSQL' : 'local fallback'}</span></div></div>
          ${renderChangeLogUpdates()}` : page === 'activity' ? `
          ${renderActivityTrail(currentUser)}` : page === 'doing' ? `
          ${renderDoingPage(route)}` : page === 'learning' ? `
          ${renderLearningPage()}` : isLifestylePage(page) ? `
          ${renderLifestylePage(page)}` : page === 'profile' ? `
          ${renderProfilePage(currentUser, profileBusy, profileMessage, profileError, fontProfileOptions())}` : `
          <div class="page-heading"><div><p class="eyebrow">WORKSPACE CONFIGURATION</p><h1>Settings</h1><p class="subheading">Kelola preferensi yang tersimpan di backend PostgreSQL.</p></div><div class="connection"><span class="status-dot"></span><span>${backendOnline ? 'Backend connected' : 'Backend unavailable'}</span></div></div>
          <div class="settings-grid"><form class="settings-card" id="settings-form"><div class="settings-card-heading"><span class="settings-icon">${icon('settings')}</span><div><h2>Workspace</h2><p>Identitas dan sumber data dari API.</p></div></div><label class="setting-row"><span><strong>Workspace name</strong><small>Disimpan melalui PUT /api/settings</small></span><input name="workspaceName" value="${escapeHtml(backendSettings.workspaceName)}" aria-label="Workspace name" required /></label><label class="setting-row"><span><strong>Source file</strong><small>File Markdown yang dipantau backend</small></span><input value="${escapeHtml(backendSettings.sourceFile)}" aria-label="Source file" readonly /></label><button class="settings-save" type="submit">Save to backend</button></form><div class="settings-card"><div class="settings-card-heading"><span class="settings-icon">${icon('moon')}</span><div><h2>Appearance</h2><p>Preferensi tampilan dashboard.</p></div></div><div class="setting-row"><span><strong>Color mode</strong><small>Gunakan tombol di topbar untuk mengganti tema.</small></span><span class="setting-badge">${theme === 'dark' ? 'Dark mode' : 'Light mode'}</span></div><div class="setting-row"><span><strong>Navigation mode</strong><small>Navigasi overlay tidak mengurangi lebar konten.</small></span><span class="setting-badge">Orbit Command</span></div><div class="setting-row font-profile-row"><span><strong>Font profile</strong><small>Atur ukuran dan jarak teks dashboard.</small></span><fieldset class="font-profile-options" role="radiogroup" aria-label="Font profile"><legend class="sr-only">Font profile</legend>${(Object.keys(fontProfileLabels) as FontProfile[]).map((profile) => `<label class="font-profile-option"><input type="radio" name="fontProfile" value="${profile}" data-font-profile aria-label="${fontProfileLabels[profile]}" ${fontProfile === profile ? 'checked' : ''} /><span>${fontProfileLabels[profile]}</span><small>${fontProfileDescriptions[profile]}</small></label>`).join('')}</fieldset></div></div></div>`;
  app.innerHTML = `
    <a class="skip-link" href="#dashboard-content">Skip to dashboard content</a>
    <div class="shell zeno-dashboard" data-playground-entry="${dashboardEntryPending ? 'enter' : 'steady'}">
      <div class="aurora-ribbon" aria-hidden="true">
        <svg viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path class="aurora-ribbon-cloud aurora-lime" d="M -190,-90 C 250,25 240,208 78,382 C -58,530 36,685 300,770" />
          <path class="aurora-ribbon-cloud aurora-blue" d="M 1715,-120 C 1410,45 1372,208 1510,332 C 1610,425 1435,560 1225,598" />
          <path class="aurora-ribbon-cloud aurora-cyan" d="M -170,930 C 150,742 350,775 430,925 C 488,1030 220,1085 -170,1110" />
          <path class="aurora-ribbon-cloud aurora-lime" d="M 1690,250 C 1452,360 1418,570 1545,704 C 1615,790 1412,925 1150,1045" />
          <path class="aurora-ribbon-core aurora-lime" d="M -190,-90 C 250,25 240,208 78,382 C -58,530 36,685 300,770" />
          <path class="aurora-ribbon-core aurora-blue" d="M 1715,-120 C 1410,45 1372,208 1510,332 C 1610,425 1435,560 1225,598" />
          <path class="aurora-ribbon-core aurora-cyan" d="M -170,930 C 150,742 350,775 430,925 C 488,1030 220,1085 -170,1110" />
          <path class="aurora-ribbon-core aurora-lime" d="M 1690,250 C 1452,360 1418,570 1545,704 C 1615,790 1412,925 1150,1045" />
        </svg>
      </div>
      <main class="main">
        <header class="topbar"><div class="crumb"><span>Workspace</span><b>/</b><strong>${pageLabel}</strong></div><div class="top-actions"><span class="api-status ${backendOnline ? 'connected' : 'offline'}" title="${escapeHtml(backendError || 'Zeno API connected')}"><i></i>${backendOnline ? 'API' : 'Offline'}</span><button class="icon-button" type="button" data-global-search title="Search session log" aria-label="Search session log">${icon('search')}</button><button class="theme-toggle" type="button" id="theme-toggle" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode"><span class="theme-icon">${theme === 'dark' ? icon('sun') : icon('moon')}</span><span>${theme === 'dark' ? 'Light' : 'Dark'}</span></button><button class="avatar" type="button" data-page="profile" title="${escapeHtml(currentUser.displayName)}" aria-label="Open profile">${escapeHtml(currentUser.displayName.slice(0, 1).toUpperCase())}</button></div></header>
        <section class="content" id="dashboard-content" tabindex="-1">
          ${pageContent}
        </section>
      </main>
    </div>${pendingDeleteEntry ? `<button class="delete-popover-backdrop" data-learning-delete-cancel aria-label="Cancel delete"></button><div class="delete-popover" role="dialog" aria-label="Confirm delete" style="top:${deletePopoverPosition.top}px;left:${deletePopoverPosition.left}px"><strong>Delete lesson?</strong><span>${escapeHtml(pendingDeleteEntry.title)}</span><div><button class="delete-confirm" data-learning-delete-confirm>Delete</button><button data-learning-delete-cancel>Cancel</button></div></div>` : ''}${renderOrbitCommand()}`;
  dashboardEntryPending = false;
  if (page === 'overview') bindOverviewEvents();
  bindOrbitCommand();
  updateOrbitTriggerDock();
  scheduleOrbitTriggerDock();
  restoreLearningListScroll();
  if (isLearningRoute(route)) bindLearningMaterialsEvents({ onNavigate: navigateTo, rerender: render });
  if (isWorkoutMaterialsRoute(route)) bindWorkoutMaterialEvents({
    onNavigate: navigateTo,
    rerender: render,
    scheduleWorkout,
    onStatus: (online, error) => { backendOnline = online; backendError = error; },
  });
  if (page === 'profile') bindProfileEvents({
    onSave: (displayName) => { void saveProfile(displayName); },
    onLogout: () => { void logoutAccount(); },
  });
  if (page === 'doing') bindDoingEvents({
    rerender: render,
    navigate: navigateTo,
    onStatus: (online, error) => { backendOnline = online; backendError = error; },
  }, route);
  if (isLifestylePage(page)) bindLifestyleEvents(page, {
    rerender: render,
    onStatus: (online, error) => { backendOnline = online; backendError = error; },
  });
  document.querySelector<HTMLButtonElement>('[data-learning-materials]')?.addEventListener('click', () => navigateTo('/learning/materials'));
  document.querySelector<HTMLButtonElement>('[data-workout-materials]')?.addEventListener('click', () => navigateTo(`/workout/materials?date=${encodeURIComponent(currentWorkoutDate())}`));
  document.querySelector<HTMLButtonElement>('[data-global-search]')?.addEventListener('click', () => {
    if (window.location.pathname !== pagePaths.overview) {
      navigateTo(pagePaths.overview);
    }
    requestAnimationFrame(() => {
      const session = document.querySelector<HTMLDetailsElement>('.overview-session-log');
      if (session) session.open = true;
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>('#search');
        input?.focus();
        input?.select();
        input?.scrollIntoView({ block: 'center' });
      });
    });
  });
  document.querySelector<HTMLInputElement>('#search')?.addEventListener('input', (event) => { query = (event.target as HTMLInputElement).value; render(); document.querySelector<HTMLInputElement>('#search')?.focus(); });
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter as Filter; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.expand); expanded.has(index) ? expanded.delete(index) : expanded.add(index); render(); }));
  document.querySelector<HTMLInputElement>('[data-activity-query]')?.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const selection = input.selectionStart;
    activityQuery = input.value;
    activityVisibleGroups = 6;
    render();
    requestAnimationFrame(() => {
      const next = document.querySelector<HTMLInputElement>('[data-activity-query]');
      next?.focus();
      if (selection !== null) next?.setSelectionRange(selection, selection);
    });
  });
  document.querySelector<HTMLSelectElement>('[data-activity-actor]')?.addEventListener('change', (event) => { activityActor = (event.target as HTMLSelectElement).value; activityVisibleGroups = 6; render(); });
  document.querySelector<HTMLSelectElement>('[data-activity-period]')?.addEventListener('change', (event) => { activityPeriod = (event.target as HTMLSelectElement).value as ActivityPeriod; activityVisibleGroups = 6; render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-activity-group-toggle]').forEach((button) => button.addEventListener('click', () => { const key = button.dataset.activityGroupToggle!; collapsedActivityGroups.has(key) ? collapsedActivityGroups.delete(key) : collapsedActivityGroups.add(key); render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-activity-event-toggle]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.activityEventToggle!; expandedActivityEvents.has(id) ? expandedActivityEvents.delete(id) : expandedActivityEvents.add(id); render(); }));
  document.querySelector<HTMLButtonElement>('[data-activity-load-more]')?.addEventListener('click', () => { activityVisibleGroups += 6; render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => button.addEventListener('click', () => {
    const nextPage = button.dataset.page as Page;
    const destination = pagePaths[nextPage];
    if (window.location.pathname !== destination) navigateTo(destination);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-change-period]').forEach((button) => button.addEventListener('click', () => { changeLogPeriod = button.dataset.changePeriod as ChangeLogPeriod; render(); }));
  document.querySelector<HTMLSelectElement>('#change-log-sort')?.addEventListener('change', (event) => { changeLogSort = (event.target as HTMLSelectElement).value as ChangeLogSort; render(); });
  document.querySelector<HTMLButtonElement>('[data-calendar-prev]')?.addEventListener('click', () => { learningMonth = new Date(learningMonth.getFullYear(), learningMonth.getMonth() - 1, 1); render(); });
  document.querySelector<HTMLButtonElement>('[data-calendar-next]')?.addEventListener('click', () => { learningMonth = new Date(learningMonth.getFullYear(), learningMonth.getMonth() + 1, 1); render(); });
  document.querySelector<HTMLButtonElement>('[data-today]')?.addEventListener('click', () => { learningMonth = new Date(today.getFullYear(), today.getMonth(), 1); selectedLearningDate = todayKey; render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((button) => button.addEventListener('click', () => { selectedLearningDate = button.dataset.day!; learningListScrollTop = 0; editingLearningId = null; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-learning-edit]').forEach((button) => button.addEventListener('click', () => { editingLearningId = button.dataset.learningEdit!; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-learning-cancel]').forEach((button) => button.addEventListener('click', () => { editingLearningId = null; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-learning-toggle]').forEach((button) => button.addEventListener('click', () => { const list = button.closest<HTMLElement>('.learning-list'); if (list) learningListScrollTop = list.scrollTop; button.blur(); const entry = (learningEntries[selectedLearningDate] ?? []).find((item) => item.id === button.dataset.learningToggle); if (entry) void persistLearningEntry({ ...entry, completed: !entry.completed }); }));
  document.querySelectorAll<HTMLButtonElement>('[data-learning-delete]').forEach((button) => button.addEventListener('click', () => { const list = button.closest<HTMLElement>('.learning-list'); if (list) learningListScrollTop = list.scrollTop; const rect = button.getBoundingClientRect(); pendingDeleteLearningId = button.dataset.learningDelete!; deletePopoverPosition = { top: rect.top - 8, left: rect.right }; button.blur(); render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-learning-delete-cancel]').forEach((button) => button.addEventListener('click', () => { pendingDeleteLearningId = null; render(); }));
  document.querySelector<HTMLButtonElement>('[data-learning-delete-confirm]')?.addEventListener('click', () => { const entry = (learningEntries[selectedLearningDate] ?? []).find((item) => item.id === pendingDeleteLearningId); if (entry) void removeLearningEntry(entry); });
  document.querySelectorAll<HTMLFormElement>('[data-learning-edit-form]').forEach((formElement) => formElement.addEventListener('submit', (event) => { event.preventDefault(); const current = (learningEntries[selectedLearningDate] ?? []).find((item) => item.id === formElement.dataset.learningEditForm); if (!current) return; const form = new FormData(formElement); const title = String(form.get('title') ?? '').trim(); if (!title) return; void persistLearningEntry({ ...current, title, note: String(form.get('note') ?? '').trim() || 'Catatan pembelajaran ditambahkan.', category: String(form.get('category') ?? 'General') }); }));
  document.querySelector<HTMLFormElement>('#learning-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement); const title = String(form.get('title') ?? '').trim(); if (!title) return; const payload = { date: selectedLearningDate, title, note: String(form.get('note') ?? '').trim() || 'Catatan pembelajaran ditambahkan.', category: String(form.get('category') ?? 'General') }; try { const created = await api.createLearning(payload); const entry: LearningEntry = { id: created.id, title: created.title, note: created.note, category: created.category, completed: created.completed }; learningEntries[selectedLearningDate] = [...(learningEntries[selectedLearningDate] ?? []), entry]; localStorage.setItem(learningStorageKey, JSON.stringify(learningEntries)); backendOnline = true; backendError = ''; } catch (error) { backendOnline = false; backendError = error instanceof Error ? error.message : 'Backend tidak tersedia'; } render(); });
  document.querySelector<HTMLFormElement>('#settings-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement); const workspaceName = String(form.get('workspaceName') ?? '').trim(); if (!workspaceName) return; try { backendSettings = await api.updateSettings(workspaceName); backendOnline = true; backendError = ''; } catch (error) { backendOnline = false; backendError = error instanceof Error ? error.message : 'Backend tidak tersedia'; } render(); });
  document.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('hermes-monitor-theme', theme); applyTheme(); render(); });
  document.querySelectorAll<HTMLInputElement>('input[data-font-profile]').forEach((input) => input.addEventListener('change', () => {
    if (!isFontProfile(input.value)) return;
    fontProfile = input.value;
    localStorage.setItem(fontProfileStorageKey, fontProfile);
    applyTheme();
    render();
    requestAnimationFrame(() => [...document.querySelectorAll<HTMLInputElement>('input[data-font-profile]')].find((option) => option.value === fontProfile)?.focus());
  }));
}
window.addEventListener('popstate', () => {
  if (!currentUser) {
    if (isPublicLandingPath(window.location.pathname)) {
      render();
      return;
    }
    authView = authViewFromPath(window.location.pathname);
    authState = { busy: false, message: '', error: '', verificationStatus: authView === 'verify' ? 'pending' : 'idle' };
    render();
    if (authView === 'verify') void verifyCurrentEmailToken();
    return;
  }
  if (isAuthPath(window.location.pathname)) {
    route = { kind: 'page', page: 'overview' };
    page = 'overview';
    history.replaceState({ page }, '', pagePaths.overview);
  } else {
    syncRouteFromLocation();
  }
  if (page === 'settings' && currentUser.role !== 'admin') {
    route = { kind: 'page', page: 'profile' };
    page = 'profile';
    history.replaceState({ page }, '', pagePaths.profile);
  }
  orbitOpen = false;
  orbitClosing = false;
  orbitTransitionToken++;
  if (orbitCloseTimer !== null) window.clearTimeout(orbitCloseTimer);
  orbitCloseTimer = null;
  orbitGroupId = null;
  orbitPage = 0;
  editingLearningId = null;
  render();
});
window.addEventListener('zeno:unauthorized', () => {
  if (!currentUser) return;
  currentUser = null;
  authChecked = true;
  dashboardEntryPending = true;
  authView = 'login';
  authState = { busy: false, message: '', error: 'Session berakhir. Silakan login kembali.', verificationStatus: 'idle' };
  history.replaceState({ authView }, '', '/login');
  render();
});

async function start() {
  applyTheme();
  if (!isPublicLandingPath(window.location.pathname)) await ensureAppStyles();
  render();
  void bootstrapAuth();
}

void start();
