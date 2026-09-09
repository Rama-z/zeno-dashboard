import '@fontsource-variable/outfit/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import './landing.css';
import { sessionLog as initialLogs, sourceFile, generatedAt } from './generated-log';
import { api, ApiError, type ActivityEvent, type ApiLog, type AuthUser, type SettingsResponse } from './api';
import { changeLogUpdates, type ChangeLogUpdate } from './change-log';
import { bindLifestyleEvents, currentWorkoutDate, isLifestylePage, renderLifestylePage, scheduleWorkout, syncLifestyleData, syncLifestyleRoute } from './lifestyle';
import { bindDoingEvents, renderDoingPage, syncDoingData } from './doing';
import { authPath, authViewFromPath, bindAuthEvents, bindProfileEvents, renderAuthScreen, renderProfilePage, type AuthScreenState, type AuthView, type FontProfileOption } from './auth';
import { bindLandingEvents, renderLandingPage } from './landing';
import { bindLearningMaterialsEvents, ensureLearningMaterialData, renderLearningMaterials as learningMaterials } from './learning-materials';
import { bindWorkoutMaterialEvents, renderWorkoutMaterials } from './workout-materials';
import { isLearningMaterialRoute, isLearningRoute, isWorkoutMaterialsRoute, pageForRoute, pagePaths, resolveAppRoute, type AppRoute, type Page } from './app-route';
import { activeOrbitLocation, chooseOrbitTriggerDock, orbitSegmentGeometry, paginateOrbitItems, visibleOrbitNavigation, type OrbitDestination, type OrbitNavigationItem, type OrbitRole } from './orbit-navigation';

type Filter = 'all' | 'success' | 'info';
type ChangeLogPeriod = 'all' | 'today' | 'yesterday' | 'week' | 'older';
type ChangeLogSort = 'newest' | 'oldest';
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
let backendSettings: SettingsResponse = { workspaceName: 'Default workspace', sourceFile };
let backendOnline = false;
let backendError = '';
let currentUser: AuthUser | null = null;
let authChecked = false;
let authView: AuthView = authViewFromPath(window.location.pathname);
let authState: AuthScreenState = { busy: false, message: '', error: '', verificationStatus: 'idle' };
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F6F9FC' : '#07091A');
}

const iconNames: Record<string, string> = {
  grid: 'squares-four', activity: 'pulse', settings: 'sliders-horizontal', profile: 'user-circle', search: 'magnifying-glass', arrow: 'arrow-up-right', check: 'check', info: 'info', chevron: 'caret-down', file: 'notebook', doing: 'check-square', calendar: 'calendar-dots', workout: 'barbell', journal: 'note-pencil', spending: 'wallet', sun: 'sun', moon: 'moon', collapse: 'caret-left', expand: 'caret-right', edit: 'pencil-simple', trash: 'trash', compass: 'compass-rose', close: 'x', back: 'arrow-left', next: 'arrow-right',
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

function renderSessionEntriesContent(visible: { log: ApiLog; index: number }[], successCount: number) {
  return `
          <div class="metrics"><div class="metric-card featured accent" data-metric="verified"><span>Verified outcomes</span><strong>${successCount}<em>/${logs.length}</em></strong><small>${icon('check')} Positive signals in the active source</small></div><div class="metric-card compact" data-metric="entries"><span>Total entries</span><strong>${logs.length}</strong><small>Source-backed sections</small></div><div class="metric-card compact" data-metric="coverage"><span>Coverage</span><strong>100<em>%</em></strong><small>Updated ${new Date(runtimeGeneratedAt).toLocaleDateString('id-ID')}</small></div></div>
          <div class="section-toolbar"><div><h2>Session log</h2><span class="result-count">${visible.length} of ${logs.length} entries visible</span></div><div class="toolbar-controls"><label class="search" aria-label="Search session entries"><span>${icon('search')}</span><input id="search" placeholder="Search entries" value="${escapeHtml(query)}" /></label><div class="filters" aria-label="Filter session entries"><button class="filter ${filter === 'all' ? 'selected' : ''}" data-filter="all" aria-pressed="${filter === 'all'}">All</button><button class="filter ${filter === 'success' ? 'selected' : ''}" data-filter="success" aria-pressed="${filter === 'success'}">Verified</button><button class="filter ${filter === 'info' ? 'selected' : ''}" data-filter="info" aria-pressed="${filter === 'info'}">Info</button></div></div></div>
          <div class="log-list">${visible.length ? visible.map(({ log, index }) => `
            <article class="log-entry ${expanded.has(index) ? 'open' : ''}"><button class="entry-header" data-expand="${index}"><span class="entry-number">${String(index + 1).padStart(2, '0')}</span><span class="entry-main"><span class="entry-title">${escapeHtml(log.title.replace(/^\d+\.\s*/, ''))}</span><span class="entry-excerpt">${escapeHtml(log.excerpt)}</span></span><span class="entry-status ${log.status}"><i>${log.status === 'success' ? icon('check') : icon('info')}</i>${log.status === 'success' ? 'Verified' : 'Reference'}</span><span class="entry-chevron">${icon('chevron')}</span></button>${expanded.has(index) ? `<div class="entry-detail"><div class="question"><span>QUESTION</span><p>${renderMarkdown(log.question)}</p></div><div class="answer"><span>ANSWER</span><div class="answer-body"><p>${renderMarkdown(log.answer)}</p></div></div></div>` : ''}</article>
          `).join('') : '<div class="empty">No entries match your search.</div>'}</div>
          <footer class="footnote">Reading from <code>${escapeHtml(runtimeSourceFile)}</code><span>•</span> Served by Zeno API</footer>`;
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
  currentUser = null; authChecked = true; profileBusy = false;
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
  try {
    const [, overview, activity, settings, learning, changeLogs] = await Promise.all([
      api.health(), api.overview(), api.activity(), api.settings(), api.learning(), api.changeLogs(), syncLifestyleData(), syncDoingData(),
    ]);
    logs = overview.entries.map((entry) => ({ ...entry }));
    runtimeSourceFile = overview.sourceFile;
    runtimeGeneratedAt = overview.generatedAt;
    activityEvents = activity.events;
    backendSettings = settings;
    if (changeLogs.entries.length) changeLogEntries = changeLogs.entries;
    let remoteEntries = learning.entries;
    if (!remoteEntries.length) {
      const localEntries = Object.entries(learningEntries).flatMap(([date, entries]) => entries.filter((entry) => !entry.id.startsWith('seed-')).map((entry) => ({ date, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed })));
      if (localEntries.length) {
        await Promise.all(localEntries.map((entry) => api.createLearning(entry)));
        remoteEntries = (await api.learning()).entries;
      }
    }
    if (remoteEntries.length) {
      learningEntries = remoteEntries.reduce<Record<string, LearningEntry[]>>((grouped, entry) => {
        (grouped[entry.date] ??= []).push({ id: entry.id, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed });
        return grouped;
      }, {});
      localStorage.setItem(learningStorageKey, JSON.stringify(learningEntries));
    }
    backendOnline = true;
    backendError = '';
  } catch (error) {
    backendOnline = false;
    backendError = error instanceof Error ? error.message : 'Backend tidak tersedia';
  }
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

function renderPublicLanding() {
  document.title = 'Zeno | Personal workspace';
  app.innerHTML = renderLandingPage(theme);
  bindLandingEvents({
    onThemeToggle: () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('hermes-monitor-theme', theme);
      applyTheme();
      render();
    },
  });
}

function orbitRole(): OrbitRole {
  return currentUser?.role === 'admin' ? 'admin' : 'user';
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
  const disc = document.querySelector<HTMLElement>('.orbit-disc');
  if (!reduce && disc) {
    await disc.animate([{opacity:1},{opacity:0}], {duration:100,easing:'cubic-bezier(.22,.7,.2,1)'}).finished.catch(() => {});
  }
  if (token !== orbitTransitionToken || !orbitOpen || orbitClosing) return;
  orbitGroupId = group;
  orbitPage = page;
  render();
  const dialog = document.querySelector<HTMLElement>('.orbit-dialog');
  if (dialog) dialog.style.animation = 'none';
  if (!reduce) document.querySelector<HTMLElement>('.orbit-disc')?.animate([{opacity:0},{opacity:1}], {duration:100,easing:'cubic-bezier(.22,.7,.2,1)'});
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
  return `<button type="button" class="orbit-trigger" data-orbit-close aria-label="${escapeHtml(orbitOpen ? 'Close Zeno navigation' : `Open Zeno navigation: ${active.label}`)}" aria-expanded="${orbitOpen}" aria-controls="orbit-command-dialog"><span class="orbit-trigger-icon">${icon(orbitOpen ? 'close' : 'compass')}</span><span class="orbit-trigger-label">${escapeHtml(active.label)}</span><span class="orbit-trigger-key">${orbitOpen ? 'Close' : 'Menu'}</span></button>${orbitOpen ? `<div class="orbit-overlay ${orbitClosing ? 'is-closing' : ''}"><button type="button" class="orbit-backdrop" data-orbit-backdrop tabindex="-1" aria-label="Close Zeno navigation"></button><section class="orbit-dialog" id="orbit-command-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(group ? `${group.label} destinations` : 'Zeno navigation')}"><div class="orbit-disc" data-layer="${group ? 'children' : 'root'}" style="--orbit-close-center-delay:${closeCenterDelay}ms">${segments}<div class="orbit-center">${center}</div>${paginationControls}</div></section></div>` : ''}`;
}

function bindOrbitCommand() {
  document.querySelector<HTMLElement>('.zeno-dashboard')?.toggleAttribute('inert', orbitOpen);
  document.querySelector<HTMLElement>('.skip-link')?.toggleAttribute('inert', orbitOpen);
  if (orbitClosing) document.querySelector<HTMLElement>('.orbit-disc')?.setAttribute('inert', '');
  if (orbitOpen && !orbitClosing) focusOrbitLayer();
  document.querySelector<HTMLButtonElement>('.orbit-trigger')?.addEventListener('click', () => {
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
  const controls = [...document.querySelectorAll<HTMLElement>('.doing-editor :is(button[type="submit"],[data-doing-editor-cancel])')];
  const triggerRect = trigger.getBoundingClientRect();
  const avoidRects = controls.map((control) => control.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  trigger.dataset.orbitDock = chooseOrbitTriggerDock(
    { width: window.innerWidth, height: window.innerHeight },
    { width: triggerRect.width, height: triggerRect.height },
    avoidRects,
  );
}
function scheduleOrbitTriggerDock() {
  if (orbitDockFrame !== null) cancelAnimationFrame(orbitDockFrame);
  orbitDockFrame = requestAnimationFrame(updateOrbitTriggerDock);
}
window.addEventListener('scroll', scheduleOrbitTriggerDock, true);
window.addEventListener('resize', scheduleOrbitTriggerDock);

function render() {
  if (!authChecked) {
    if (isPublicLandingPath(window.location.pathname)) {
      renderPublicLanding();
      return;
    }
    document.title = 'Loading · Zeno';
    app.innerHTML = '<main class="auth-shell"><section class="auth-brand-panel"><div class="auth-brand-lockup"><img src="/zeno-logo.png" alt="Zeno" /><div><strong>Zeno</strong><span>PERSONAL WORKSPACE</span></div></div></section><section class="auth-form-panel"><div class="auth-card auth-verify-card"><div class="auth-spinner" aria-label="Loading"></div><p>Memeriksa session…</p></div></section></main>';
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
  const activityActorCount = new Set(activityEvents.map((event) => event.actorEmail)).size;
  const pageLabel = ({ overview: 'Overview', activity: 'Activity', settings: 'Settings', profile: 'Profile', changelog: 'Change Log', doing: 'Doing', learning: 'Learning', workout: 'Workout', journaling: 'Journaling', spending: 'Spending' } as Record<Page, string>)[page];
  const pendingDeleteEntry = (learningEntries[selectedLearningDate] ?? []).find((entry) => entry.id === pendingDeleteLearningId);
  document.title = `${pageLabel} · Zeno`;
  if (isLearningMaterialRoute(route)) ensureLearningMaterialData(route, render);
  const pageContent = route.kind !== 'page' ? (isLearningRoute(route) ? learningMaterials(route) : isWorkoutMaterialsRoute(route) ? renderWorkoutMaterials(route) : renderRouteNotFound(window.location.pathname)) : page === 'overview' ? `
          <div class="page-heading"><div><p class="eyebrow">SESSION OBSERVABILITY</p><h1>Zeno session log</h1><p class="subheading">Pantau ringkasan percakapan dan konfigurasi agent dalam satu tempat.</p></div><div class="connection"><span class="pulse"></span><span>Source connected</span></div></div>
          ${renderSessionEntriesContent(visible, successCount)}` : page === 'changelog' ? `
          <div class="page-heading"><div><p class="eyebrow">CHANGE HISTORY</p><h1>Change log</h1><p class="subheading">Lacak riwayat update berdasarkan hari, tanggal, dan permintaan.</p></div><div class="connection"><span class="pulse"></span><span>${changeLogEntries.length} updates · ${backendOnline ? 'PostgreSQL' : 'local fallback'}</span></div></div>
          ${renderChangeLogUpdates()}` : page === 'activity' ? `
          <div class="page-heading"><div><p class="eyebrow">USER ACTIVITY</p><h1>Workspace activity</h1><p class="subheading">Audit trail setiap perubahan dashboard berdasarkan actor, action, dan entity.</p></div><div class="connection"><span class="pulse"></span><span>${currentUser.role === 'admin' ? 'All users' : 'My activity'}</span></div></div>
          <div class="activity-summary"><div class="metric-card accent"><span>Audit events</span><strong>${activityEvents.length}</strong><small><span class="mini-dot"></span> PostgreSQL activity log</small></div><div class="metric-card"><span>Actors visible</span><strong>${activityActorCount}</strong><small>${currentUser.role === 'admin' ? 'Workspace-wide access' : 'Filtered to your user'}</small></div><div class="metric-card"><span>Your role</span><strong>${escapeHtml(currentUser.role)}</strong><small>${escapeHtml(currentUser.email)}</small></div></div>
          <div class="activity-audit-list">${activityEvents.length ? activityEvents.map((event) => `<article class="activity-audit-card activity-action-${escapeHtml(event.action)}"><div class="activity-actor-avatar">${escapeHtml(event.actorName.slice(0, 1).toUpperCase())}</div><div class="activity-audit-copy"><h3>${escapeHtml(event.actorName)} · ${escapeHtml(event.action)} ${escapeHtml(event.entityType)}</h3><p>${escapeHtml(event.description)}</p><div class="activity-audit-meta"><span>${escapeHtml(event.actorEmail)}</span><span>${escapeHtml(event.actorRole)}</span>${event.entityId ? `<span>${escapeHtml(event.entityId.slice(0, 8))}</span>` : ''}</div></div><time datetime="${escapeHtml(event.createdAt)}">${new Date(event.createdAt).toLocaleString('id-ID')}</time></article>`).join('') : '<div class="feature-empty large"><strong>Belum ada aktivitas</strong><span>Perubahan dashboard dan event akun akan muncul di sini.</span></div>'}</div>` : page === 'doing' ? `
          ${renderDoingPage()}` : page === 'learning' ? `
          ${renderLearningPage()}` : isLifestylePage(page) ? `
          ${renderLifestylePage(page)}` : page === 'profile' ? `
          ${renderProfilePage(currentUser, profileBusy, profileMessage, profileError, fontProfileOptions())}` : `
          <div class="page-heading"><div><p class="eyebrow">WORKSPACE CONFIGURATION</p><h1>Settings</h1><p class="subheading">Kelola preferensi yang tersimpan di backend PostgreSQL.</p></div><div class="connection"><span class="status-dot"></span><span>${backendOnline ? 'Backend connected' : 'Backend unavailable'}</span></div></div>
          <div class="settings-grid"><form class="settings-card" id="settings-form"><div class="settings-card-heading"><span class="settings-icon">${icon('settings')}</span><div><h2>Workspace</h2><p>Identitas dan sumber data dari API.</p></div></div><label class="setting-row"><span><strong>Workspace name</strong><small>Disimpan melalui PUT /api/settings</small></span><input name="workspaceName" value="${escapeHtml(backendSettings.workspaceName)}" aria-label="Workspace name" required /></label><label class="setting-row"><span><strong>Source file</strong><small>File Markdown yang dipantau backend</small></span><input value="${escapeHtml(backendSettings.sourceFile)}" aria-label="Source file" readonly /></label><button class="settings-save" type="submit">Save to backend</button></form><div class="settings-card"><div class="settings-card-heading"><span class="settings-icon">${icon('moon')}</span><div><h2>Appearance</h2><p>Preferensi tampilan dashboard.</p></div></div><div class="setting-row"><span><strong>Color mode</strong><small>Gunakan tombol di topbar untuk mengganti tema.</small></span><span class="setting-badge">${theme === 'dark' ? 'Dark mode' : 'Light mode'}</span></div><div class="setting-row"><span><strong>Navigation mode</strong><small>Navigasi overlay tidak mengurangi lebar konten.</small></span><span class="setting-badge">Orbit Command</span></div><div class="setting-row font-profile-row"><span><strong>Font profile</strong><small>Atur ukuran dan jarak teks dashboard.</small></span><fieldset class="font-profile-options" role="radiogroup" aria-label="Font profile"><legend class="sr-only">Font profile</legend>${(Object.keys(fontProfileLabels) as FontProfile[]).map((profile) => `<label class="font-profile-option"><input type="radio" name="fontProfile" value="${profile}" data-font-profile aria-label="${fontProfileLabels[profile]}" ${fontProfile === profile ? 'checked' : ''} /><span>${fontProfileLabels[profile]}</span><small>${fontProfileDescriptions[profile]}</small></label>`).join('')}</fieldset></div></div></div>`;
  app.innerHTML = `
    <a class="skip-link" href="#dashboard-content">Skip to dashboard content</a>
    <div class="shell zeno-dashboard">
      <main class="main">
        <header class="topbar"><div class="crumb"><span>Workspace</span><b>/</b><strong>${pageLabel}</strong></div><div class="top-actions"><span class="api-status ${backendOnline ? 'connected' : 'offline'}" title="${escapeHtml(backendError || 'Zeno API connected')}"><i></i>${backendOnline ? 'API' : 'Offline'}</span><button class="icon-button" type="button" data-global-search title="Search session log" aria-label="Search session log">${icon('search')}</button><button class="theme-toggle" type="button" id="theme-toggle" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode"><span class="theme-icon">${theme === 'dark' ? icon('sun') : icon('moon')}</span><span>${theme === 'dark' ? 'Light' : 'Dark'}</span></button><button class="avatar" type="button" data-page="profile" title="${escapeHtml(currentUser.displayName)}" aria-label="Open profile">${escapeHtml(currentUser.displayName.slice(0, 1).toUpperCase())}</button></div></header>
        <section class="content" id="dashboard-content" tabindex="-1">
          ${pageContent}
        </section>
      </main>
    </div>${pendingDeleteEntry ? `<button class="delete-popover-backdrop" data-learning-delete-cancel aria-label="Cancel delete"></button><div class="delete-popover" role="dialog" aria-label="Confirm delete" style="top:${deletePopoverPosition.top}px;left:${deletePopoverPosition.left}px"><strong>Delete lesson?</strong><span>${escapeHtml(pendingDeleteEntry.title)}</span><div><button class="delete-confirm" data-learning-delete-confirm>Delete</button><button data-learning-delete-cancel>Cancel</button></div></div>` : ''}${renderOrbitCommand()}`;
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
    onStatus: (online, error) => { backendOnline = online; backendError = error; },
  });
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
      const input = document.querySelector<HTMLInputElement>('#search');
      input?.focus();
      input?.select();
    });
  });
  document.querySelector<HTMLInputElement>('#search')?.addEventListener('input', (event) => { query = (event.target as HTMLInputElement).value; render(); document.querySelector<HTMLInputElement>('#search')?.focus(); });
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.addEventListener('click', () => { filter = button.dataset.filter as Filter; render(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.expand); expanded.has(index) ? expanded.delete(index) : expanded.add(index); render(); }));
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
