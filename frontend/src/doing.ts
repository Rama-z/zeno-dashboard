import { api, type DoingEntryResponse } from './api';

type BindOptions = {
  rerender: () => void;
  onStatus: (online: boolean, error: string) => void;
};

const doingStorageKey = 'hermes-monitor-doing-v1';
const currentDate = new Date();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = dateKey(currentDate);
const categories = ['General', 'Work', 'Personal', 'Urgent', 'Errand'];

let selectedDate = todayKey;
let visibleMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let editingId: string | null = null;
let pendingDeleteId: string | null = null;
let deletePosition = { top: 0, left: 0 };
let listScrollTop = 0;

let entriesByDate: Record<string, DoingEntryResponse[]> = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(doingStorageKey) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, DoingEntryResponse[]> : {};
  } catch {
    return {};
  }
})();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>';

function saveEntries() {
  localStorage.setItem(doingStorageKey, JSON.stringify(entriesByDate));
}

function groupEntries(entries: DoingEntryResponse[]) {
  return entries.reduce<Record<string, DoingEntryResponse[]>>((grouped, entry) => {
    (grouped[entry.date] ??= []).push(entry);
    return grouped;
  }, {});
}

export async function syncDoingData() {
  let remoteEntries = (await api.doing()).entries;
  if (!remoteEntries.length) {
    const localEntries = Object.values(entriesByDate).flat();
    if (localEntries.length) {
      await Promise.all(localEntries.map((entry) => api.createDoing({ date: entry.date, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed })));
      remoteEntries = (await api.doing()).entries;
    }
  }
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

function renderEntry(entry: DoingEntryResponse) {
  if (editingId === entry.id) {
    return `<form class="learning-entry learning-edit-form" data-doing-edit-form="${escapeHtml(entry.id)}"><div class="learning-edit-fields"><input name="title" value="${escapeHtml(entry.title)}" aria-label="Task title" required maxlength="160" /><input name="note" value="${escapeHtml(entry.note)}" aria-label="Task note" maxlength="2000" /><select name="category" aria-label="Task category">${categories.map((category) => `<option ${category === entry.category ? 'selected' : ''}>${category}</option>`).join('')}</select></div><div class="learning-actions"><button class="learning-action save" type="submit">Save</button><button class="learning-action" type="button" data-doing-edit-cancel>Cancel</button></div></form>`;
  }
  return `<article class="learning-entry ${entry.completed ? 'completed' : ''}"><button class="learning-check" data-doing-toggle="${escapeHtml(entry.id)}" aria-label="${entry.completed ? 'Tandai belum selesai' : 'Tandai selesai'}" aria-pressed="${entry.completed}">${entry.completed ? '✓' : ''}</button><div class="learning-entry-copy"><span class="learning-category">${escapeHtml(entry.category)}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.note)}</p></div><div class="learning-actions"><button class="learning-action icon-only" data-doing-edit="${escapeHtml(entry.id)}" title="Edit task" aria-label="Edit task">${editIcon}</button><button class="learning-action icon-only danger" data-doing-delete="${escapeHtml(entry.id)}" title="Delete task" aria-label="Delete task">${trashIcon}</button></div></article>`;
}

function renderDeletePopover() {
  const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === pendingDeleteId);
  if (!entry) return '';
  return `<button class="delete-popover-backdrop" data-doing-delete-cancel aria-label="Cancel delete"></button><div class="delete-popover" role="dialog" aria-label="Confirm delete" style="top:${deletePosition.top}px;left:${deletePosition.left}px"><strong>Delete task?</strong><span>${escapeHtml(entry.title)}</span><div><button class="delete-confirm" data-doing-delete-confirm>Delete</button><button data-doing-delete-cancel>Cancel</button></div></div>`;
}

export function renderDoingPage() {
  const selectedEntries = entriesByDate[selectedDate] ?? [];
  const monthLabel = visibleMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const totalEntries = Object.values(entriesByDate).reduce((total, entries) => total + entries.length, 0);
  const unfinishedEntries = Object.values(entriesByDate).flat().filter((entry) => !entry.completed).length;
  return `<div class="page-heading"><div><p class="eyebrow">ACTIVE TASKS</p><h1>What I'm doing</h1><p class="subheading">Rencanakan, prioritaskan, dan selesaikan task harian melalui kalender.</p></div><div class="connection"><span class="pulse"></span><span>${unfinishedEntries} unfinished · ${totalEntries} total</span></div></div>
    <div class="learning-layout"><section class="calendar-panel"><div class="calendar-header"><button class="calendar-nav" data-doing-month-prev aria-label="Previous month">‹</button><div><p class="eyebrow">DOING CALENDAR</p><h2>${escapeHtml(monthLabel)}</h2></div><button class="calendar-nav" data-doing-month-next aria-label="Next month">›</button></div><div class="calendar-weekdays"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div><div class="calendar-grid">${monthCells().map((day) => {
      if (!day) return '<span class="calendar-day empty-day"></span>';
      const key = dateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
      const entries = entriesByDate[key] ?? [];
      const unfinishedCount = entries.filter((entry) => !entry.completed).length;
      const allCompleted = entries.length > 0 && unfinishedCount === 0;
      return `<button class="calendar-day ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''} ${entries.length ? 'has-lessons' : ''} ${allCompleted ? 'all-completed' : ''}" data-doing-day="${key}" title="${allCompleted ? 'All tasks completed' : entries.length ? `${unfinishedCount} unfinished tasks` : 'No tasks'}"><span>${day}</span>${entries.length ? `<i aria-label="${allCompleted ? 'All completed' : `${unfinishedCount} unfinished tasks`}">${allCompleted ? '✓' : unfinishedCount}</i>` : ''}</button>`;
    }).join('')}</div><div class="calendar-legend"><span><i class="legend-progress">3</i> Unfinished</span><span><i class="legend-complete">✓</i> All completed</span></div><button class="today-button" data-doing-today>Jump to today</button></section><section class="learning-detail"><div class="detail-heading"><div><p class="eyebrow">SELECTED DAY</p><h2>${escapeHtml(selectedLabel)}</h2></div><span class="date-badge">${selectedEntries.length} ${selectedEntries.length === 1 ? 'task' : 'tasks'}</span></div><div class="learning-list doing-list">${selectedEntries.length ? selectedEntries.map(renderEntry).join('') : '<div class="learning-empty">Belum ada task untuk tanggal ini.<br><span>Tambahkan task pertama di form di bawah.</span></div>'}</div><form class="learning-form" id="doing-form"><input name="title" placeholder="Apa yang sedang dikerjakan?" aria-label="Task title" required maxlength="160" /><input name="note" placeholder="Catatan singkat (opsional)" aria-label="Task note" maxlength="2000" /><select name="category" aria-label="Task category">${categories.map((category) => `<option>${category}</option>`).join('')}</select><button type="submit">Add task <span>↗</span></button></form></section></div>${renderDeletePopover()}`;
}

function captureScroll() {
  const list = document.querySelector<HTMLElement>('.doing-list');
  if (list) listScrollTop = list.scrollTop;
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

async function runAction(action: () => Promise<void>, options: BindOptions) {
  try {
    await action();
    options.onStatus(true, '');
  } catch (error) {
    options.onStatus(false, error instanceof Error ? error.message : 'Backend tidak tersedia');
  }
  options.rerender();
}

async function persistEntry(entry: DoingEntryResponse, options: BindOptions) {
  await runAction(async () => {
    const updated = await api.updateDoing(entry.id, { date: entry.date, title: entry.title, note: entry.note, category: entry.category, completed: entry.completed });
    entriesByDate[entry.date] = (entriesByDate[entry.date] ?? []).map((candidate) => candidate.id === updated.id ? updated : candidate);
    editingId = null;
    saveEntries();
  }, options);
}

export function bindDoingEvents(options: BindOptions) {
  document.querySelector<HTMLButtonElement>('[data-doing-month-prev]')?.addEventListener('click', () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-doing-month-next]')?.addEventListener('click', () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); options.rerender(); });
  document.querySelector<HTMLButtonElement>('[data-doing-today]')?.addEventListener('click', () => { visibleMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); selectedDate = todayKey; listScrollTop = 0; editingId = null; options.rerender(); });
  document.querySelectorAll<HTMLButtonElement>('[data-doing-day]').forEach((button) => button.addEventListener('click', () => { selectedDate = button.dataset.doingDay!; listScrollTop = 0; editingId = null; options.rerender(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-edit]').forEach((button) => button.addEventListener('click', () => { captureScroll(); editingId = button.dataset.doingEdit!; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-doing-edit-cancel]')?.addEventListener('click', () => { captureScroll(); editingId = null; options.rerender(); });
  document.querySelectorAll<HTMLButtonElement>('[data-doing-toggle]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    button.blur();
    const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === button.dataset.doingToggle);
    if (entry) void persistEntry({ ...entry, completed: !entry.completed }, options);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-delete]').forEach((button) => button.addEventListener('click', () => {
    captureScroll();
    const rect = button.getBoundingClientRect();
    pendingDeleteId = button.dataset.doingDelete!;
    deletePosition = { top: rect.top - 8, left: rect.right };
    button.blur();
    options.rerender();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-delete-cancel]').forEach((button) => button.addEventListener('click', () => { pendingDeleteId = null; options.rerender(); }));
  document.querySelector<HTMLButtonElement>('[data-doing-delete-confirm]')?.addEventListener('click', () => {
    const entry = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === pendingDeleteId);
    if (!entry) return;
    void runAction(async () => {
      await api.deleteDoing(entry.id, entry.date);
      entriesByDate[entry.date] = (entriesByDate[entry.date] ?? []).filter((candidate) => candidate.id !== entry.id);
      pendingDeleteId = null;
      saveEntries();
    }, options);
  });
  document.querySelector<HTMLFormElement>('[data-doing-edit-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    captureScroll();
    const formElement = event.currentTarget as HTMLFormElement;
    const current = (entriesByDate[selectedDate] ?? []).find((candidate) => candidate.id === formElement.dataset.doingEditForm);
    if (!current) return;
    const form = new FormData(formElement);
    const title = String(form.get('title') ?? '').trim();
    if (!title) return;
    void persistEntry({ ...current, title, note: String(form.get('note') ?? '').trim() || 'Task ditambahkan.', category: String(form.get('category') ?? 'General') }, options);
  });
  document.querySelector<HTMLFormElement>('#doing-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const title = String(form.get('title') ?? '').trim();
    if (!title) return;
    const payload = { date: selectedDate, title, note: String(form.get('note') ?? '').trim() || 'Task ditambahkan.', category: String(form.get('category') ?? 'General'), completed: false };
    void runAction(async () => {
      const created = await api.createDoing(payload);
      entriesByDate[selectedDate] = [...(entriesByDate[selectedDate] ?? []), created];
      saveEntries();
    }, options);
  });
  restoreScroll();
}
