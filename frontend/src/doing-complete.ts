import { api, type DoingCriterion, type DoingTaskInput, type DoingTaskResponse, type DoingEntryResponse } from './api';
import type { AppRoute } from './app-route';

type BindOptions = { rerender: () => void; navigate: (path: string) => void; onStatus: (online: boolean, error: string) => void };
type FieldKey = Exclude<keyof DoingTaskInput, 'definitionOfDone' | 'duration'>;
const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = dateKey(new Date());
const monday = (key: string) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateKey(d); };
const shift = (key: string, days: number) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); };
const dateLabel = (key: string | null) => key ? new Date(`${key}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Belum dijadwalkan';
const fields: FieldKey[] = ['title','area','project','type','status','priority','urgency','impact','effort','energy','focus','context','device','location','timePreference','difficulty','resistance','due','nextAction','plannedDate','notes'];
const labels: Record<FieldKey, string> = { title:'Task',area:'Area',project:'Project',type:'Type',status:'Status',priority:'Priority',urgency:'Urgency',impact:'Impact',effort:'Effort',energy:'Energy',focus:'Focus',context:'Context',device:'Device',location:'Location',timePreference:'Time Preference',difficulty:'Difficulty',resistance:'Resistance',due:'Due',nextAction:'Next Action',plannedDate:'Planned Date',notes:'Notes' };
const choices: Partial<Record<FieldKey, string[]>> = {
  area:['💻 Personal Project','Work','Personal'], type:['Deep Work','Admin','Creative','Communication'],
  status:['Ready','In progress','Blocked','Done'], priority:['P0','P1','P2','P3'], urgency:['Low','Normal','High'],
  impact:['Low','Medium','High'], effort:['Low','Medium','High'], energy:['Low','Medium','High'],
  focus:['Light','Moderate','Deep'], context:['@computer','@home','@office','@errands'], device:['Laptop','Phone','Tablet','Any device'],
  location:['Anywhere','Home','Office','Library'], timePreference:['Morning','Afternoon','Evening','Anytime'],
  difficulty:['Low','Medium','High'], resistance:['Low','Medium','High'],
};
const defaults: DoingTaskInput = {
  title:'',area:'💻 Personal Project',project:'',type:'Deep Work',status:'Ready',priority:'P1',urgency:'Normal',impact:'High',effort:'Medium',
  energy:'Medium',focus:'Deep',duration:{minMinutes:60,maxMinutes:120},context:'@computer',device:'Laptop',location:'Anywhere',
  timePreference:'Morning',difficulty:'Medium',resistance:'Low',due:null,nextAction:'',definitionOfDone:[],plannedDate:null,notes:'',
};
let tasks: DoingTaskResponse[] = [];
let legacyOverviewEntries: DoingEntryResponse[] = [];
let loaded = false;
let loadError = '';
let loading = false;
let selectedDate = '';
let weekStart = monday(today);
let query = '';
let statusFilter = '';
let priorityFilter = '';
let projectFilter = '';
let draft: DoingTaskInput | null = null;
let draftFor: string | null = null;
let pending = false;
let feedback = '';
let deleteId: string | null = null;
let listScroll = 0;
let originId: string | null = null;
const taskPath = (id: string) => `/doing/${encodeURIComponent(id)}`;
const cloneTask = (task: DoingTaskResponse): DoingTaskInput => Object.fromEntries(Object.keys(defaults).map(key => [key, key === 'definitionOfDone' ? task.definitionOfDone.map(item => ({ ...item })) : key === 'duration' ? { minMinutes: task.duration.minMinutes, maxMinutes: task.duration.maxMinutes } : task[key as keyof DoingTaskInput]])) as DoingTaskInput;
const findTask = (id: string | null) => tasks.find(task => task.id === id);

export async function syncDoingData() {
  loading = true;
  const [workspace, legacy] = await Promise.allSettled([api.doingTasks(), api.doing()]);
  if (workspace.status === 'fulfilled') {
    tasks = Array.isArray(workspace.value.entries) ? workspace.value.entries : [];
    loadError = '';
  } else loadError = typeof workspace.reason?.message === 'string' ? workspace.reason.message : 'Task tidak dapat dimuat.';
  if (legacy.status === 'fulfilled') legacyOverviewEntries = legacy.value.entries;
  loaded = true;
  loading = false;
  if (workspace.status === 'rejected') throw workspace.reason;
}

// Overview must retain the original date-bucket records, not fabricated values from workspace tasks.
export function doingOverviewEntries(): DoingEntryResponse[] {
  return legacyOverviewEntries;
}
async function refreshLegacyOverview() {
  try { legacyOverviewEntries = (await api.doing()).entries; }
  catch { /* The workspace write succeeded; retain the last confirmed Overview snapshot. */ }
}

function field(key: FieldKey, task: DoingTaskInput) {
  const value = task[key] ?? '';
  const mandatory = ['title','project','nextAction'].includes(key);
  const options = choices[key];
  const control = options
    ? `<select name="${key}">${[...new Set([String(value), ...options])].map(option => `<option value="${html(option)}" ${option === value ? 'selected' : ''}>${html(option)}</option>`).join('')}</select>`
    : key === 'notes' ? `<textarea name="notes" rows="9" placeholder="Konteks, keputusan, referensi, risiko…">${html(value)}</textarea>`
    : `<input name="${key}" type="${key === 'due' || key === 'plannedDate' ? 'date' : 'text'}" value="${html(value)}" ${mandatory ? 'required' : ''} />`;
  return `<label class="dc-field dc-${key}"><span>${labels[key]}${mandatory ? ' <b>*</b>' : ''}</span>${control}${key === 'plannedDate' ? '<small>Kapan mulai dikerjakan · opsional</small>' : key === 'due' ? '<small>Batas akhir, bukan jadwal bekerja</small>' : ''}</label>`;
}
function group(num: string, title: string, subtitle: string, keys: FieldKey[], task: DoingTaskInput) {
  return `<section class="dc-group"><div class="dc-group-heading"><span>${num}</span><div><h2>${title}</h2><p>${subtitle}</p></div></div><div class="dc-fields">${keys.map(key => field(key, task)).join('')}</div></section>`;
}
function checklist(items: DoingCriterion[], editor = false) {
  return editor ? `<div class="dc-checklist" data-doing-checklist>${items.map((item, index) => `<div class="dc-check-row"><label><input type="checkbox" data-doing-check="${index}" ${item.done ? 'checked' : ''} aria-label="Selesai kriteria ${index + 1}" /></label><input data-doing-check-text="${index}" aria-label="Kriteria ${index + 1}" value="${html(item.text)}" /><button type="button" data-doing-check-remove="${index}" aria-label="Hapus kriteria ${index + 1}">×</button></div>`).join('')}</div><div class="dc-check-add"><input data-doing-check-new aria-label="Kriteria baru" placeholder="Tambahkan kriteria selesai…" /><button type="button" data-doing-check-add>＋ Tambah</button></div>`
    : `<div class="dc-detail-checks">${items.map((item,index) => `<label><input type="checkbox" data-doing-check="${index}" ${item.done ? 'checked' : ''} ${pending ? 'disabled' : ''} /><span>${html(item.text)}</span></label>`).join('')}</div>`;
}
function renderEditor(task: DoingTaskResponse | undefined) {
  const edit = Boolean(task);
  const current = draft && draftFor === (task?.id ?? 'new') ? draft : (task ? cloneTask(task) : { ...defaults, plannedDate: selectedDate || null, definitionOfDone: [] });
  const done = current.definitionOfDone.filter(item => item.done).length;
  return `<div class="dc-editor"><div class="dc-intro"><span class="dc-eyebrow">Doing / Complete Workspace</span><h1 tabindex="-1">${edit ? 'Buat langkahnya lebih jelas.' : 'Rencanakan kerja yang berarti.'}</h1><p>Semua konteks terlihat. Dari niat menjadi langkah yang jelas.</p></div>
  <div class="dc-editor-grid"><form data-doing-form novalidate aria-busy="${pending}"><div class="dc-form-sections">
    ${group('01','Identitas & prioritas','Apa yang ingin kamu tuntaskan?', ['title','area','project','type','status','priority','urgency','impact','effort'], current)}
    ${group('02','Ritme kerja','Cocokkan beban dengan kapasitasmu.', ['energy','focus','timePreference','difficulty','resistance'], current)}
    <section class="dc-group"><div class="dc-group-heading"><span>03</span><div><h2>Konteks & waktu</h2><p>Pisahkan tempat bekerja dan batas selesai.</p></div></div><div class="dc-fields">${['context','device','location','plannedDate','due'].map(key => field(key as FieldKey,current)).join('')}<label class="dc-field"><span>Duration · min (menit)</span><input name="durationMinMinutes" type="number" min="1" max="240" step="1" value="${current.duration.minMinutes}" /></label><label class="dc-field"><span>Duration · max (menit)</span><input name="durationMaxMinutes" type="number" min="1" max="240" step="1" value="${current.duration.maxMinutes}" /></label></div></section>
    <section class="dc-group"><div class="dc-group-heading"><span>04</span><div><h2>Langkah & hasil</h2><p>Mulai jelas. Selesai juga jelas.</p></div></div><div class="dc-fields">${field('nextAction',current)}<div class="dc-definition"><div class="dc-section-title"><strong>Definition of Done</strong><span>${done}/${current.definitionOfDone.length} selesai</span></div>${checklist(current.definitionOfDone,true)}</div></div></section>
  </div><section class="dc-group dc-notes">${group('05','Notes','Ruang untuk konteks, keputusan dan referensi.', ['notes'],current)}</section>
  <div class="dc-save"><span data-doing-feedback role="status" aria-live="polite">${html(feedback)}</span><button type="button" data-doing-cancel ${pending ? 'disabled' : ''}>Batal</button><button type="submit" class="dc-primary" data-doing-submit ${pending ? 'disabled' : ''}>${pending ? 'Menyimpan…' : 'Simpan task ↗'}</button></div></form>
  <aside class="dc-summary"><span class="dc-eyebrow">Live task card</span><h2 data-live="title">${html(current.title || 'Belum diisi')}</h2><p><span data-live="area">${html(current.area)}</span> / <span data-live="project">${html(current.project || 'Belum diisi')}</span></p><div class="dc-tags"><span data-live="status">${html(current.status)}</span><span data-live="priority">${html(current.priority)}</span><span data-live="type">${html(current.type)}</span></div><dl>${['energy','focus','context','due','plannedDate'].map(key => `<div><dt>${labels[key as FieldKey]}</dt><dd data-live="${key}">${html((key === 'due' || key === 'plannedDate') ? dateLabel(current[key]) : current[key as FieldKey])}</dd></div>`).join('')}<div><dt>Duration</dt><dd data-live="duration">${current.duration.minMinutes}–${current.duration.maxMinutes} menit</dd></div></dl><strong>Next small step</strong><p data-live="nextAction">${html(current.nextAction || 'Belum diisi')}</p><div class="dc-progress"><i style="width:${current.definitionOfDone.length ? done / current.definitionOfDone.length * 100 : 0}%"></i></div><small data-live="criteria">${done}/${current.definitionOfDone.length} kriteria selesai</small></aside></div></div>`;
}
function renderDetail(task: DoingTaskResponse) {
  const done = task.definitionOfDone.filter(item => item.done).length;
  return `<div class="dc-detail"><div class="dc-detail-nav"><button data-doing-back>← Ruang kerja</button><div><button class="dc-icon" data-doing-delete="${html(task.id)}" aria-label="Hapus task" title="Hapus task"><span class="ph ph-trash" aria-hidden="true"></span></button><button class="dc-icon dc-primary" data-doing-edit="${html(task.id)}" aria-label="Edit task" title="Edit task"><span class="ph ph-pencil-simple" aria-hidden="true"></span></button></div></div>
  ${deleteId === task.id ? `<div class="dc-delete" role="group" aria-label="Konfirmasi hapus task"><span>Hapus ${html(task.title)}? Tindakan ini tidak bisa dibatalkan.</span><button data-doing-delete-cancel>Batal</button><button data-doing-delete-confirm="${html(task.id)}" ${pending ? 'disabled' : ''}>Hapus permanen</button></div>` : ''}
  <span class="dc-eyebrow">Task detail / Complete Workspace</span><h1 tabindex="-1">${html(task.title)}</h1><p class="dc-muted">${html(task.project)} / ${html(task.area)}</p><div class="dc-tags"><span>${html(task.status)}</span><span>${html(task.priority)}</span><span>${html(task.type)}</span></div>
  <div class="dc-detail-grid"><div><section class="dc-next"><span class="dc-eyebrow">Next Action / mulai di sini</span><p>${html(task.nextAction || 'Belum ditentukan')}</p></section>
  <section class="dc-definition-detail"><h2>Definition of Done <small>${done}/${task.definitionOfDone.length}</small></h2>${checklist(task.definitionOfDone)}<p class="dc-muted">Centang hasil yang sudah terpenuhi. Edit task untuk mengubah kriterianya.</p></section>
  <section class="dc-notes-detail"><h2>Notes</h2><p>Seluruh konteks, tanpa potongan.</p><div>${html(task.notes || 'Belum ada catatan. Tambahkan lewat Edit task.')}</div></section>
  <details class="dc-attributes"><summary>Semua atribut · identitas, ritme & konteks</summary>${attributes(task, fields.filter(key => key !== 'notes' && key !== 'nextAction'))}<dl><div><dt>Duration</dt><dd>${task.duration.minMinutes}–${task.duration.maxMinutes} menit</dd></div></dl></details>${task.legacyMetadata ? `<details class="dc-attributes"><summary>Metadata task lama</summary><dl>${Object.entries(task.legacyMetadata).map(([key,value]) => `<div><dt>${html(key)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl></details>` : ''}</div>
  <aside class="dc-aside"><span class="dc-eyebrow">At a glance</span>${attributes(task,['plannedDate','due','energy','focus','context','area'])}<p>Planned adalah rencana bekerja; Due adalah batas selesai. Energy ≠ Focus · Area ≠ Context.</p></aside></div></div>`;
}
function attributes(task: DoingTaskResponse, keys: FieldKey[]) { return `<dl class="dc-attribute-list">${keys.map(key => `<div><dt>${labels[key]}</dt><dd>${html(key === 'plannedDate' || key === 'due' ? dateLabel(task[key]) : task[key] || '—')}</dd></div>`).join('')}</dl>`; }
function filteredTasks() { const q = query.trim().toLocaleLowerCase(); return tasks.filter(task => (!selectedDate || task.plannedDate === selectedDate) && (!statusFilter || task.status === statusFilter) && (!priorityFilter || task.priority === priorityFilter) && (!projectFilter || task.project === projectFilter) && (!q || [task.title,task.project,task.area,task.notes,task.nextAction].some(value => value.toLocaleLowerCase().includes(q)))); }
function renderList() {
  const visible = filteredTasks();
  const projects = [...new Set(tasks.map(task => task.project).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  return `<div class="dc-intro"><div><span class="dc-eyebrow">Personal workspace / 01</span><h1>Doing<span>.</span></h1><p>Lebih sedikit distraksi. Satu langkah yang berarti.</p></div><button class="dc-primary" data-doing-new>＋ Task baru</button></div>
  <div class="dc-stats">${[['Belum selesai',tasks.filter(t => t.status !== 'Done').length],['In progress',tasks.filter(t => t.status === 'In progress').length],['Blocked',tasks.filter(t => t.status === 'Blocked').length],['Selesai',tasks.filter(t => t.status === 'Done').length]].map(([label,count]) => `<div><strong>${String(count).padStart(2,'0')}</strong><span>${label}</span></div>`).join('')}</div>
  <section class="dc-planner"><div class="dc-planner-top"><div><span class="dc-eyebrow">Rencanakan, bukan menumpuk</span><h2>${dateLabel(weekStart)} — ${dateLabel(shift(weekStart,6))}</h2></div><div><button data-doing-week="-7" aria-label="Minggu sebelumnya">←</button><button data-doing-week="today">Minggu ini</button><button data-doing-week="7" aria-label="Minggu berikutnya">→</button></div></div><div class="dc-week">${Array.from({length:7},(_,i) => { const day=shift(weekStart,i); const count=tasks.filter(t => t.plannedDate === day).length; return `<button data-doing-day="${day}" aria-pressed="${day === selectedDate}" class="${day === selectedDate ? 'selected' : ''}"><span>${new Date(`${day}T12:00:00`).toLocaleDateString('id-ID',{weekday:'short'})}</span><strong>${Number(day.slice(-2))}</strong><small>${count ? `${count} task` : '—'}</small></button>`; }).join('')}</div><p>Pilih hari untuk melihat Planned Date · Due tetap batas akhir, bukan jadwal kerja.</p></section>
  <section class="dc-task-section"><div class="dc-list-title"><h2>Ruang kerja</h2><button data-doing-all-dates aria-pressed="${!selectedDate}">Semua jadwal</button></div><div class="dc-filters"><label>Cari task / project<input data-doing-query type="search" value="${html(query)}" placeholder="Cari langkah berikutnya…" /></label><label>Status<select data-doing-status-filter><option value="">Semua status</option>${choices.status!.map(value => `<option ${value === statusFilter ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Priority<select data-doing-priority-filter><option value="">Semua priority</option>${choices.priority!.map(value => `<option ${value === priorityFilter ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Project<select data-doing-project-filter><option value="">Semua project</option>${projects.map(value => `<option value="${html(value)}" ${value === projectFilter ? 'selected' : ''}>${html(value)}</option>`).join('')}</select></label><button data-doing-clear>Reset filter</button></div><p class="dc-result" role="status">${visible.length} dari ${tasks.length} task · ${selectedDate ? `Planned ${dateLabel(selectedDate)}` : 'Semua jadwal, termasuk belum dijadwalkan'}</p>
  <div class="dc-task-list">${visible.length ? ['In progress','Ready','Blocked','Done'].map(status => {const group=visible.filter(t => t.status === status);return group.length ? `<div class="dc-group-label">${status} <span>${group.length}</span></div>${group.map(t => `<button class="dc-task-row" data-doing-open="${html(t.id)}"><span class="dc-priority">${html(t.priority)}</span><span class="dc-task-name"><strong>${html(t.title)}</strong><small>${html(t.project)} · ${html(t.area)}</small></span><span class="dc-status">${status}</span><span class="dc-task-fact"><small>FOCUS · DURATION</small>${html(t.focus)} · ${t.duration.minMinutes}–${t.duration.maxMinutes}m</span><span class="dc-task-fact"><small>DUE</small>${dateLabel(t.due)}</span><span aria-hidden="true">↗</span></button>`).join('')}` : '';}).join('') : '<div class="dc-empty"><h3>Ruang untuk langkah baru.</h3><p>Tidak ada task yang cocok. Coba tanggal lain atau reset filter.</p><button data-doing-clear>Tampilkan semua task</button></div>'}</div></section>`;
}
export function renderDoingPage(route: AppRoute = { kind:'page',page:'doing' }) {
  const task = route.kind === 'doing-detail' || route.kind === 'doing-editor' && route.taskId ? findTask(route.taskId) : undefined;
  const missing = (route.kind === 'doing-detail' || route.kind === 'doing-editor' && route.taskId) && !task;
  return `<div class="doing-complete" aria-busy="${pending || loading}"><div class="dc-announcement" role="status" aria-live="polite">${pending ? 'Menyimpan perubahan task…' : html(feedback)}</div>${loading || !loaded && !loadError ? '<div class="dc-loading" role="status"><span>Memuat Doing workspace…</span><i></i><i></i><i></i></div>' : loadError ? `<div class="dc-empty" role="alert"><h2>Task belum dapat dimuat</h2><p>${html(loadError)}</p><button data-doing-retry>Coba lagi</button></div>` : missing ? `<div class="dc-empty"><h2>Task tidak ditemukan</h2><button data-doing-back>Ruang kerja</button></div>` : route.kind === 'doing-detail' && task ? renderDetail(task) : route.kind === 'doing-editor' ? renderEditor(task) : renderList()}</div>`;
}
function snapshot(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (key: FieldKey) => { const raw=String(data.get(key) ?? ''); return key === 'notes' ? raw : raw.trim(); };
  const items = draft?.definitionOfDone ?? [];
  draft = { ...defaults, ...draft, ...Object.fromEntries(fields.map(key => [key, key === 'due' || key === 'plannedDate' ? value(key) || null : value(key)])),
    duration:{minMinutes:Number(data.get('durationMinMinutes')), maxMinutes:Number(data.get('durationMaxMinutes'))},
    definitionOfDone:items.map((item,index) => ({ ...item, text: (form.querySelector<HTMLInputElement>(`[data-doing-check-text="${index}"]`)?.value ?? item.text).trim(), done:form.querySelector<HTMLInputElement>(`[data-doing-check="${index}"]`)?.checked ?? item.done })) } as DoingTaskInput;
  return draft;
}
function updateSummary(form: HTMLFormElement) {
  const task = snapshot(form);
  const update = (key: string, value: string) => { document.querySelectorAll<HTMLElement>(`[data-live="${key}"]`).forEach(node => { node.textContent = value || 'Belum diisi'; }); };
  for (const key of ['title','area','project','type','status','priority','energy','focus','context','nextAction'] as FieldKey[]) update(key,String(task[key] ?? ''));
  update('due',dateLabel(task.due)); update('plannedDate',dateLabel(task.plannedDate)); update('duration',`${task.duration.minMinutes}–${task.duration.maxMinutes} menit`);
  const done=task.definitionOfDone.filter(item => item.done).length;
  update('criteria',`${done}/${task.definitionOfDone.length} kriteria selesai`);
  const bar=document.querySelector<HTMLElement>('.dc-progress i'); if(bar) bar.style.width=`${task.definitionOfDone.length ? done/task.definitionOfDone.length*100 : 0}%`;
}
function validate(task: DoingTaskInput, previous?: DoingTaskResponse) {
  const legacyMissing = (key: 'project' | 'nextAction') => Boolean(previous?.legacyMetadata && task[key] === previous[key] && !task[key]);
  if (!task.title || (!task.project && !legacyMissing('project')) || (!task.nextAction && !legacyMissing('nextAction'))) return 'Lengkapi Task, Project, dan Next Action.';
  if (Array.from(task.title).length > 160 || Array.from(task.project).length > 160 || Array.from(task.nextAction).length > 500) return 'Task dan Project maksimal 160 karakter; Next Action maksimal 500 karakter.';
  if (Array.from(task.notes).length > 20000) return 'Notes maksimal 20.000 karakter Unicode.';
  if (task.definitionOfDone.length > 100 || task.definitionOfDone.some(item => Array.from(item.text).length > 500)) return 'Maksimal 100 kriteria, masing-masing 500 karakter.';
  if ((!task.definitionOfDone.length && !(previous?.legacyMetadata && previous.definitionOfDone.length === 0)) || task.definitionOfDone.some(item => !item.text)) return 'Tambahkan setidaknya satu kriteria selesai yang tidak kosong.';
  if (!Number.isInteger(task.duration.minMinutes) || !Number.isInteger(task.duration.maxMinutes) || task.duration.minMinutes < 1 || task.duration.minMinutes > task.duration.maxMinutes || task.duration.maxMinutes > 240) return 'Duration min dan max harus antara 1–240 menit.';
  return '';
}
function focus(selector: string) { requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus({preventScroll:true})); }
export function bindDoingEvents(options: BindOptions, route: AppRoute = {kind:'page',page:'doing'}) {
  document.querySelector<HTMLButtonElement>('[data-doing-retry]')?.addEventListener('click',() => {
    if (loading) return;
    loading = true;
    options.rerender();
    void syncDoingData().then(() => { options.onStatus(true,''); options.rerender(); }).catch(error => {
      options.onStatus(false,error instanceof Error ? error.message : 'Task tidak dapat dimuat.'); options.rerender();
    });
  });
  const navigate = (path: string) => { feedback=''; options.navigate(path); };
  const back = () => { draft=null; draftFor=null; deleteId=null; navigate('/doing'); requestAnimationFrame(() => { window.scrollTo(0,listScroll); focus(originId ? `[data-doing-open="${CSS.escape(originId)}"]` : '[data-doing-new]'); }); };
  document.querySelectorAll<HTMLButtonElement>('[data-doing-back]').forEach(button => button.addEventListener('click',back));
  document.querySelector<HTMLButtonElement>('[data-doing-new]')?.addEventListener('click',() => {listScroll=window.scrollY;originId=null;draft={...defaults,plannedDate:selectedDate || null,definitionOfDone:[]};draftFor='new';navigate('/doing/new');focus('.dc-intro h1');});
  document.querySelectorAll<HTMLButtonElement>('[data-doing-open]').forEach(button => button.addEventListener('click',() => {listScroll=window.scrollY;originId=button.dataset.doingOpen!;navigate(taskPath(originId));focus('.dc-detail h1');}));
  document.querySelector<HTMLButtonElement>('[data-doing-edit]')?.addEventListener('click',event => {const id=(event.currentTarget as HTMLButtonElement).dataset.doingEdit!;const task=findTask(id);if(!task)return;draft=cloneTask(task);draftFor=id;navigate(`${taskPath(id)}/edit`);focus('.dc-intro h1');});
  document.querySelector<HTMLButtonElement>('[data-doing-cancel]')?.addEventListener('click',() => {if(route.kind === 'doing-editor' && route.taskId){draft=null;draftFor=null;navigate(taskPath(route.taskId));focus('[data-doing-edit]');}else back();});
  document.querySelectorAll<HTMLButtonElement>('[data-doing-week]').forEach(button => button.addEventListener('click',() => { weekStart=button.dataset.doingWeek==='today' ? monday(today) : shift(weekStart,Number(button.dataset.doingWeek)); options.rerender();focus(`[data-doing-week="${button.dataset.doingWeek}"]`); }));
  document.querySelectorAll<HTMLButtonElement>('[data-doing-day]').forEach(button => button.addEventListener('click',() => {selectedDate=button.dataset.doingDay!;options.rerender();focus(`[data-doing-day="${selectedDate}"]`);}));
  document.querySelector<HTMLButtonElement>('[data-doing-all-dates]')?.addEventListener('click',() => {selectedDate='';options.rerender();focus('[data-doing-all-dates]');});
  document.querySelectorAll<HTMLButtonElement>('[data-doing-clear]').forEach(button => button.addEventListener('click',() => {query='';statusFilter='';priorityFilter='';projectFilter='';selectedDate='';options.rerender();focus('[data-doing-query]');}));
  document.querySelector<HTMLInputElement>('[data-doing-query]')?.addEventListener('input',event => {const input=event.currentTarget as HTMLInputElement;query=input.value;const pos=input.selectionStart;options.rerender();requestAnimationFrame(() => {const next=document.querySelector<HTMLInputElement>('[data-doing-query]');next?.focus();if(pos!==null) next?.setSelectionRange(pos,pos);});});
  for(const [key,set] of [['status', (v:string)=>statusFilter=v],['priority',(v:string)=>priorityFilter=v],['project',(v:string)=>projectFilter=v]] as const) document.querySelector<HTMLSelectElement>(`[data-doing-${key}-filter]`)?.addEventListener('change',event=>{set((event.currentTarget as HTMLSelectElement).value);options.rerender();focus(`[data-doing-${key}-filter]`);});
  const form=document.querySelector<HTMLFormElement>('[data-doing-form]');
  if(form) {
    if(draftFor !== (route.kind === 'doing-editor' ? route.taskId ?? 'new' : null)) {draft=null;draftFor=route.kind === 'doing-editor' ? route.taskId ?? 'new' : null;}
    form.addEventListener('input',()=>updateSummary(form));form.addEventListener('change',()=>updateSummary(form));
    form.querySelector<HTMLButtonElement>('[data-doing-check-add]')?.addEventListener('click',() => {const input=form.querySelector<HTMLInputElement>('[data-doing-check-new]')!;const text=input.value.trim();snapshot(form);if(!text){input.focus();return;}draft!.definitionOfDone.push({id:'',text,done:false});options.rerender();focus('[data-doing-check-new]');});
    form.querySelector<HTMLInputElement>('[data-doing-check-new]')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();form.querySelector<HTMLButtonElement>('[data-doing-check-add]')?.click();}});
    form.querySelectorAll<HTMLButtonElement>('[data-doing-check-remove]').forEach(button=>button.addEventListener('click',()=>{snapshot(form);draft!.definitionOfDone.splice(Number(button.dataset.doingCheckRemove),1);options.rerender();focus('[data-doing-check-new]');}));
    form.addEventListener('submit',event=>{event.preventDefault();if(pending)return;const input=snapshot(form);feedback=validate(input,route.kind==='doing-editor' ? findTask(route.taskId) : undefined);const label=form.querySelector<HTMLElement>('[data-doing-feedback]');if(label)label.textContent=feedback;if(feedback){(feedback.includes('kriteria') ? form.querySelector<HTMLElement>('[data-doing-check-new]') : form.querySelector<HTMLElement>('[name="title"]'))?.focus();return;}
      pending=true;options.rerender();const id=route.kind==='doing-editor' ? route.taskId : null;
      void (id ? api.updateDoingTask(id,input) : api.createDoingTask(input)).then(async saved=>{tasks=id?tasks.map(task=>task.id===id?saved:task):[saved,...tasks];await refreshLegacyOverview();draft=null;draftFor=null;pending=false;feedback='Task tersimpan.';options.onStatus(true,'');navigate(taskPath(saved.id));focus('.dc-detail h1');}).catch(error=>{pending=false;feedback=error instanceof Error?error.message:'Task tidak dapat disimpan.';options.onStatus(false,feedback);options.rerender();focus('[data-doing-submit]');});
    });
  }
  document.querySelectorAll<HTMLInputElement>('.dc-detail-checks [data-doing-check]').forEach(box=>box.addEventListener('change',()=>{if(pending)return;const id=route.kind==='doing-detail'?route.taskId:null;const task=findTask(id);if(!task)return;const input=cloneTask(task);input.definitionOfDone[Number(box.dataset.doingCheck)].done=box.checked;pending=true;options.rerender();void api.updateDoingTask(task.id,input).then(async saved=>{tasks=tasks.map(item=>item.id===saved.id?saved:item);await refreshLegacyOverview();pending=false;feedback='Kriteria diperbarui.';options.onStatus(true,'');options.rerender();focus(`[data-doing-check="${box.dataset.doingCheck}"]`);}).catch(error=>{pending=false;feedback=error instanceof Error?error.message:'Kriteria tidak dapat disimpan.';options.onStatus(false,feedback);options.rerender();});}));
  document.querySelector<HTMLButtonElement>('[data-doing-delete]')?.addEventListener('click',()=>{deleteId=route.kind==='doing-detail'?route.taskId:null;options.rerender();focus('[data-doing-delete-cancel]');});
  document.querySelector<HTMLButtonElement>('[data-doing-delete-cancel]')?.addEventListener('click',()=>{deleteId=null;options.rerender();focus('[data-doing-delete]');});
  document.querySelector<HTMLButtonElement>('[data-doing-delete-confirm]')?.addEventListener('click',event=>{if(pending)return;const id=(event.currentTarget as HTMLButtonElement).dataset.doingDeleteConfirm!;pending=true;options.rerender();void api.deleteDoingTask(id).then(async()=>{tasks=tasks.filter(task=>task.id!==id);await refreshLegacyOverview();pending=false;deleteId=null;feedback='Task dihapus.';options.onStatus(true,'');back();}).catch(error=>{pending=false;feedback=error instanceof Error?error.message:'Task tidak dapat dihapus.';options.onStatus(false,feedback);options.rerender();});});
  document.querySelector<HTMLElement>('.doing-complete')?.addEventListener('keydown',event=>{if(event.key!=='Escape'||pending)return;if(deleteId){deleteId=null;options.rerender();focus('[data-doing-delete]');}else if(route.kind==='doing-editor'){if(route.taskId){draft=null;draftFor=null;navigate(taskPath(route.taskId));}else back();}else if(route.kind==='doing-detail')back();});
}
