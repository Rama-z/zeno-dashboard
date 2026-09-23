import { api, type ManualMaterial, type ManualModule, type ManualModuleInput, type ManualPortion, type ManualSession, type ManualSessionInput } from './api';
import type { AppRoute } from './app-route';

export type ManualRoute = Extract<AppRoute, { kind: 'learning-modules' | 'learning-module-editor' | 'learning-module-detail' | 'learning-session-editor' | 'learning-session-detail' }>;
type MaterialDraft = ManualModuleInput['materials'][number] & { file?: File; uploaded?: boolean };
const blankModule = (): ManualModuleInput => ({ title: '', category: '', level: '', objective: '', note: '', materials: [] });
const blankSession = (): ManualSessionInput => ({ moduleId: '', date: new Date().toLocaleDateString('sv-SE'), title: '', targetMinutes: 30, method: '', objective: '', practicePlan: '', status: 'planned', plannedItems: [], actualItems: [], actualMinutes: 0, reflection: '', confusion: '', nextStep: '', reviewDate: '' });
let modules: ManualModule[] = [];
let sessions: ManualSession[] = [];
let moduleDetail: ManualModule | null = null;
let sessionDetail: ManualSession | null = null;
let moduleDraft: ManualModuleInput = blankModule();
let materialDrafts: MaterialDraft[] = [];
let savedModuleId: string | null = null;
let editingModule = false;
let sessionDraft: ManualSessionInput = blankSession();
let loadedKey = '';
let activeOwner: string | null = null;
let generation = 0;
let loading = false;
let busy = false;
let error = '';
let notice = '';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const path = (kind: 'modules' | 'sessions', id: string) => `/learning/${kind}/${encodeURIComponent(id)}`;
const statusLabel = (status: ManualSession['status']) => ({ planned: 'Direncanakan', in_progress: 'Berlangsung', completed: 'Selesai' })[status];
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Permintaan gagal. Silakan coba lagi.';
const field = (label: string, name: string, value: string | number, type = 'text', required = false) => `<label class="lm-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} /></label>`;
const area = (label: string, name: string, value: string, rows = 3) => `<label class="lm-field"><span>${label}</span><textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
const materialTypes = ['text', 'pdf', 'video', 'youtube', 'link'] as const;
const safeUrl = (value: string) => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const fileUrl = (moduleId: string, materialId: string) => `/api/learning-modules/${encodeURIComponent(moduleId)}/materials/${encodeURIComponent(materialId)}/file`;

export function resetLearningManualData(owner: string | null) {
  if (activeOwner === owner) return;
  activeOwner = owner; generation++; loadedKey = ''; loading = false; busy = false;
  modules = []; sessions = []; moduleDetail = null; sessionDetail = null;
  moduleDraft = blankModule(); materialDrafts = []; savedModuleId = null; editingModule = false;
  sessionDraft = blankSession(); error = ''; notice = '';
}

export function ensureLearningManualData(route: ManualRoute, rerender: () => void) {
  const key = route.kind + ('id' in route ? ':' + route.id : '');
  if (loadedKey === key) return;
  const requestGeneration = generation;
  loadedKey = key;
  error = ''; notice = ''; loading = true;
  const load = async () => {
    if (route.kind === 'learning-modules') {
      const [moduleResult, sessionResult] = await Promise.all([api.learningModules(), api.learningSessions()]);
      if (requestGeneration !== generation || loadedKey !== key) return;
      modules = moduleResult.modules; sessions = sessionResult.sessions;
    } else if (route.kind === 'learning-module-detail') { const result = await api.learningModule(route.id); if (requestGeneration !== generation || loadedKey !== key) return; moduleDetail = result; editingModule = false; }
    else if (route.kind === 'learning-session-detail') {
      const [session, moduleResult] = await Promise.all([api.learningSession(route.id), api.learningModules()]);
      if (requestGeneration !== generation || loadedKey !== key) return;
      sessionDetail = session; modules = moduleResult.modules; sessionDraft = { ...session };
    } else if (route.kind === 'learning-session-editor') {
      const result = await api.learningModules(); if (requestGeneration !== generation || loadedKey !== key) return;
      modules = result.modules;
      sessionDraft = blankSession();
    } else if (route.kind === 'learning-module-editor') { savedModuleId = null; editingModule = false; moduleDetail = null; moduleDraft = blankModule(); materialDrafts = []; }
  };
  void load().catch((cause) => { if (requestGeneration === generation && loadedKey === key) error = errorText(cause); }).finally(() => { if (requestGeneration === generation && loadedKey === key) { loading = false; rerender(); } });
}

function navigation() {
  return `<nav class="lm-nav" aria-label="Ruang belajar"><a href="/learning" data-lm-route>Jurnal</a><a href="/learning/modules" data-lm-route>Modul</a><a href="/learning/sessions/new" data-lm-route>Sesi baru</a><a href="/learning/materials" data-lm-route>Katalog</a></nav>`;
}
function heading(title: string, subtitle: string) { return `<header class="lm-heading"><p class="lm-kicker">ZENO / LEARNING</p><h1>${title}</h1><p>${subtitle}</p></header>`; }
function materialSummary(material: ManualMaterial, moduleId: string) {
  const link = material.type === 'pdf' || material.type === 'video' ? fileUrl(moduleId, material.id) : safeUrl(material.url);
  return `<li class="lm-material"><span class="lm-index">${String(material.sortOrder + 1).padStart(2, '0')}</span><div><small>${esc(material.type.toUpperCase())}</small><strong>${esc(material.title)}</strong>${material.body ? `<p>${esc(material.body)}</p>` : ''}${material.fileName ? `<p>${esc(material.fileName)}</p>` : ''}${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Buka ${esc(material.type)}</a>` : ''}</div></li>`;
}
function renderList() {
  return `${heading('Rangkai pembelajaranmu.', 'Satukan materi pilihanmu, lalu rencanakan sesi belajar.')}<div class="lm-actions"><a class="lm-button primary" href="/learning/modules/new" data-lm-route>Buat modul</a><a class="lm-button" href="/learning/sessions/new" data-lm-route>Rencanakan sesi</a></div><div class="lm-columns"><section><h2>Modul <span>${modules.length}</span></h2>${modules.length ? `<div class="lm-list">${modules.map((module) => `<a href="${esc(path('modules', module.id))}" data-lm-route class="lm-row"><span><small>${esc(module.category)} / ${esc(module.level)}</small><strong>${esc(module.title)}</strong><em>${module.materials?.length ?? 0} materi</em></span><span aria-hidden="true">↗</span></a>`).join('')}</div>` : '<p class="lm-empty">Belum ada modul. Buat modul untuk mengumpulkan materi belajarmu.</p>'}</section><section><h2>Sesi <span>${sessions.length}</span></h2>${sessions.length ? `<div class="lm-list">${sessions.map((session) => `<a href="${esc(path('sessions', session.id))}" data-lm-route class="lm-row"><span><small>${esc(session.date)} / ${statusLabel(session.status)}</small><strong>${esc(session.title)}</strong><em>${esc(modules.find((module) => module.id === session.moduleId)?.title ?? 'Modul tidak tersedia')}</em></span><span aria-hidden="true">↗</span></a>`).join('')}</div>` : '<p class="lm-empty">Belum ada sesi. Rencanakan sesi dari modulmu.</p>'}</section></div>`;
}
function renderModuleEditor() {
  return `${heading('Buat modul.', 'Susun teks, dokumen, video, dan tautan sesuai urutan belajarmu.')}<form id="lm-module-form" class="lm-form"><div class="lm-grid">${field('Judul modul', 'title', moduleDraft.title, 'text', true)}${field('Kategori', 'category', moduleDraft.category)}${field('Tingkat', 'level', moduleDraft.level)}</div>${area('Tujuan belajar', 'objective', moduleDraft.objective)}${area('Konteks / catatan', 'note', moduleDraft.note)}<section class="lm-builder"><div class="lm-section-title"><h2>Materi</h2><p>Atur urutan materi yang akan dipelajari.</p></div><div class="lm-list">${materialDrafts.map((material, i) => `<div class="lm-material-edit" data-lm-material="${i}"><div class="lm-material-header"><strong>${String(i + 1).padStart(2, '0')} / ${esc(material.type.toUpperCase())}</strong><div><button type="button" data-lm-move="${i}" data-direction="up" aria-label="Geser materi ${i + 1} ke atas" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-lm-move="${i}" data-direction="down" aria-label="Geser materi ${i + 1} ke bawah" ${i === materialDrafts.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-lm-remove="${i}" aria-label="Hapus materi ${i + 1}">Hapus</button></div></div>${field('Judul materi', 'materialTitle', material.title, 'text', true)}${material.type === 'text' ? area('Teks', 'materialBody', material.body) : material.type === 'youtube' || material.type === 'link' ? field('URL (http/https)', 'materialUrl', material.url, 'url', true) : `<label class="lm-field"><span>${material.type === 'pdf' ? 'Berkas PDF' : 'Berkas video'}</span><input type="file" name="materialFile" accept="${material.type === 'pdf' ? 'application/pdf,.pdf' : 'video/mp4,video/webm,.mp4,.webm'}" ${material.file || material.uploaded ? '' : 'required'} /><small>${esc(material.file?.name ?? (material.uploaded ? 'Sudah diunggah' : material.type === 'pdf' ? 'PDF maksimal 20 MB. Pilih berkas untuk diunggah.' : 'MP4/WebM maksimal 100 MB. Pilih berkas untuk diunggah.'))}</small></label>`}</div>`).join('')}</div><label class="lm-field lm-add"><span>Tambah materi</span><select id="lm-add-type" aria-label="Jenis materi">${materialTypes.map((type) => `<option value="${type}">${type.toUpperCase()}</option>`).join('')}</select></label><button type="button" class="lm-button" data-lm-add>Tambah materi</button></section><div class="lm-actions"><button class="lm-button primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Menyimpan…' : savedModuleId ? 'Coba lagi simpan & unggah' : 'Simpan modul'}</button><a class="lm-button" href="/learning/modules" data-lm-route>Batal</a></div></form>`;
}
function renderModuleDetail(module: ManualModule) {
  return `${heading(esc(module.title), 'Jalur belajar dari materi pilihanmu.')}<div class="lm-actions"><a class="lm-button primary" href="/learning/sessions/new" data-lm-route>Rencanakan sesi</a><button type="button" class="lm-button" data-lm-edit-module>Ubah modul</button><a class="lm-button" href="/learning/modules" data-lm-route>Semua modul</a></div><div class="lm-meta"><span>${esc(module.category)}</span><span>${esc(module.level)}</span></div><section class="lm-paper"><h2>Tujuan belajar</h2><p>${esc(module.objective) || 'Belum diisi'}</p>${module.note ? `<h2>Catatan</h2><p>${esc(module.note)}</p>` : ''}</section><section class="lm-builder"><h2>Urutan materi</h2>${module.materials?.length ? `<ol class="lm-material-list">${[...module.materials].sort((a,b) => a.sortOrder - b.sortOrder).map((material) => materialSummary(material, module.id)).join('')}</ol>` : '<p class="lm-empty">Modul ini belum memiliki materi.</p>'}</section>`;
}
function portionFields(material: ManualMaterial, portion: ManualPortion | undefined) {
  if (material.type === 'pdf') return `<div class="lm-portion-grid">${field('Dari halaman', 'startPage', portion?.startPage ?? '', 'number')}${field('Sampai halaman', 'endPage', portion?.endPage ?? '', 'number')}</div>`;
  if (material.type === 'video' || material.type === 'youtube') return `<div class="lm-portion-grid">${field(material.type === 'youtube' ? 'Timestamp (detik)' : 'Mulai (detik)', 'startSecond', portion?.startSecond ?? '', 'number')}${material.type === 'video' ? field('Selesai (detik)', 'endSecond', portion?.endSecond ?? '', 'number') : ''}</div>`;
  return '';
}
function portionList(module: ManualModule | undefined, items: ManualPortion[], prefix: string) {
  if (!module?.materials?.length) return '<p class="lm-empty">Pilih modul yang memiliki materi terlebih dahulu.</p>';
  return `<div class="lm-portions">${[...module.materials].sort((a,b) => a.sortOrder - b.sortOrder).map((material) => { const portion = items.find((item) => item.materialId === material.id); return `<div class="lm-portion" data-lm-portion="${esc(material.id)}" data-prefix="${prefix}"><label><input type="checkbox" name="selected" ${portion ? 'checked' : ''} /><span>${esc(material.title)} <small>${esc(material.type)}</small></span></label>${portionFields(material, portion)}</div>`; }).join('')}</div>`;
}
function renderSessionForm(isNew: boolean) {
  const module = modules.find((entry) => entry.id === sessionDraft.moduleId);
  return `${heading(isNew ? 'Rencanakan sesi.' : esc(sessionDraft.title), isNew ? 'Pilih materi dan cara berlatih.' : 'Catat yang sungguh dipelajari. Sesi selesai bukan berarti sudah menguasai.')}<form id="lm-session-form" class="lm-form"><div class="lm-grid"><label class="lm-field"><span>Modul</span><select name="moduleId" id="lm-module-select" required><option value="">Pilih modul</option>${modules.map((item) => `<option value="${esc(item.id)}" ${item.id === sessionDraft.moduleId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label>${field('Judul sesi', 'title', sessionDraft.title, 'text', true)}${field('Tanggal', 'date', sessionDraft.date, 'date', true)}${field('Target menit', 'targetMinutes', sessionDraft.targetMinutes, 'number', true)}</div>${area('Metode', 'method', sessionDraft.method)}${area('Tujuan', 'objective', sessionDraft.objective)}${area('Rencana latihan', 'practicePlan', sessionDraft.practicePlan)}<section class="lm-builder"><h2>Bagian yang direncanakan</h2>${portionList(module, sessionDraft.plannedItems, 'planned')}</section>${isNew ? '' : `<section class="lm-builder"><div class="lm-section-title"><h2>Bagian yang dipelajari</h2><span class="lm-status">${statusLabel(sessionDraft.status)}</span></div>${portionList(module, sessionDraft.actualItems, 'actual')}${field('Menit aktual', 'actualMinutes', sessionDraft.actualMinutes, 'number')}${area('Apa yang membingungkan?', 'confusion', sessionDraft.confusion)}${area('Langkah berikutnya', 'nextStep', sessionDraft.nextStep)}${field('Tanggal tinjau ulang', 'reviewDate', sessionDraft.reviewDate, 'date')}</section><section class="lm-reflection"><h2>Notes sesi</h2><p>Jelaskan yang dipahami, perubahan sudut pandang, dan langkah berikutnya. Notes wajib untuk menyelesaikan sesi.</p>${area('Refleksi belajar', 'reflection', sessionDraft.reflection, 9)}</section>`}<div class="lm-actions">${isNew ? `<button type="submit" class="lm-button" data-lm-save="planned" ${busy || !modules.length ? 'disabled' : ''}>Simpan rencana</button><button type="submit" class="lm-button primary" data-lm-save="in_progress" ${busy || !modules.length ? 'disabled' : ''}>Mulai sesi</button>` : `<button type="submit" class="lm-button" data-lm-save="${sessionDraft.status}" ${busy ? 'disabled' : ''}>${sessionDraft.status === 'completed' ? 'Simpan perubahan' : 'Simpan draf'}</button>${sessionDraft.status === 'completed' ? '' : `${sessionDraft.status === 'planned' ? `<button type="submit" class="lm-button" data-lm-save="in_progress" ${busy ? 'disabled' : ''}>Mulai sesi</button>` : ''}<button type="submit" class="lm-button primary" data-lm-save="completed" ${busy ? 'disabled' : ''}>Selesaikan sesi</button>`}`}<a href="/learning/modules" class="lm-button" data-lm-route>Semua modul</a></div></form>`;
}
export function renderLearningManual(route: ManualRoute) {
  const content = loading ? '<div class="lm-loading" role="status"><span></span><span></span><span></span><p>Memuat ruang belajar…</p></div>' : route.kind === 'learning-modules' ? renderList() : route.kind === 'learning-module-editor' ? renderModuleEditor() : route.kind === 'learning-module-detail' ? editingModule ? renderModuleEditor() : moduleDetail ? renderModuleDetail(moduleDetail) : '<p class="lm-empty">Modul tidak ditemukan.</p>' : route.kind === 'learning-session-editor' ? renderSessionForm(true) : sessionDetail ? renderSessionForm(false) : '<p class="lm-empty">Sesi tidak ditemukan.</p>';
  return `<div class="learning-manual">${navigation()}${error ? `<p class="lm-error" role="alert">${esc(error)}</p>` : ''}${notice ? `<p class="lm-notice" role="status">${esc(notice)}</p>` : ''}${content}</div>`;
}
function captureModuleForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('#lm-module-form'); if (!form) return;
  const data = new FormData(form);
  moduleDraft = { ...moduleDraft, title: String(data.get('title') ?? ''), category: String(data.get('category') ?? ''), level: String(data.get('level') ?? ''), objective: String(data.get('objective') ?? ''), note: String(data.get('note') ?? '') };
  root.querySelectorAll<HTMLElement>('[data-lm-material]').forEach((row) => { const i = Number(row.dataset.lmMaterial); const material = materialDrafts[i]; if (!material) return; material.title = row.querySelector<HTMLInputElement>('[name=materialTitle]')?.value ?? ''; material.body = row.querySelector<HTMLTextAreaElement>('[name=materialBody]')?.value ?? ''; material.url = row.querySelector<HTMLInputElement>('[name=materialUrl]')?.value ?? ''; const file = row.querySelector<HTMLInputElement>('[name=materialFile]')?.files?.[0]; if (file) { material.file = file; material.uploaded = false; } });
}
function capturePortions(root: HTMLElement, prefix: string): ManualPortion[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-prefix="${prefix}"]`)].filter((row) => row.querySelector<HTMLInputElement>('[name=selected]')?.checked).map((row) => {
    const result: ManualPortion = { materialId: row.dataset.lmPortion! };
    (['startPage','endPage','startSecond','endSecond'] as const).forEach((name) => { const raw = row.querySelector<HTMLInputElement>(`[name=${name}]`)?.value; if (raw !== undefined && raw !== '') result[name] = Number(raw); });
    return result;
  });
}
function captureSessionForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('#lm-session-form'); if (!form) return;
  const data = new FormData(form);
  sessionDraft = { ...sessionDraft, moduleId: String(data.get('moduleId') ?? ''), title: String(data.get('title') ?? ''), date: String(data.get('date') ?? ''), targetMinutes: Number(data.get('targetMinutes') ?? 0), method: String(data.get('method') ?? ''), objective: String(data.get('objective') ?? ''), practicePlan: String(data.get('practicePlan') ?? ''), actualMinutes: Number(data.get('actualMinutes') ?? 0), reflection: String(data.get('reflection') ?? ''), confusion: String(data.get('confusion') ?? ''), nextStep: String(data.get('nextStep') ?? ''), reviewDate: String(data.get('reviewDate') ?? ''), plannedItems: capturePortions(root, 'planned'), actualItems: capturePortions(root, 'actual') };
}
export function bindLearningManualEvents(route: ManualRoute, navigate: (path: string) => void, rerender: () => void) {
  const root = document.querySelector<HTMLElement>('.learning-manual'); if (!root) return;
  root.querySelectorAll<HTMLAnchorElement>('a[data-lm-route]').forEach((anchor) => anchor.addEventListener('click', (event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(anchor.pathname); }));
  root.querySelector<HTMLButtonElement>('[data-lm-edit-module]')?.addEventListener('click', () => { if (!moduleDetail) return; savedModuleId = moduleDetail.id; editingModule = true; moduleDraft = { title: moduleDetail.title, category: moduleDetail.category, level: moduleDetail.level, objective: moduleDetail.objective, note: moduleDetail.note, materials: [] }; materialDrafts = [...moduleDetail.materials].sort((a,b) => a.sortOrder - b.sortOrder).map(({ id, type, title, body, url, sortOrder }) => ({ id, type, title, body, url, sortOrder, uploaded: true })); rerender(); });
  root.querySelector<HTMLButtonElement>('[data-lm-add]')?.addEventListener('click', () => { captureModuleForm(root); const type = root.querySelector<HTMLSelectElement>('#lm-add-type')?.value as MaterialDraft['type']; materialDrafts.push({ type, title: '', body: '', url: '', sortOrder: materialDrafts.length }); rerender(); });
  root.querySelectorAll<HTMLButtonElement>('[data-lm-remove]').forEach((button) => button.addEventListener('click', () => { captureModuleForm(root); materialDrafts.splice(Number(button.dataset.lmRemove), 1); rerender(); }));
  root.querySelectorAll<HTMLButtonElement>('[data-lm-move]').forEach((button) => button.addEventListener('click', () => { captureModuleForm(root); const index = Number(button.dataset.lmMove), other = index + (button.dataset.direction === 'up' ? -1 : 1); [materialDrafts[index], materialDrafts[other]] = [materialDrafts[other], materialDrafts[index]]; rerender(); }));
  root.querySelector<HTMLFormElement>('#lm-module-form')?.addEventListener('submit', (event) => { event.preventDefault(); if (busy) return; captureModuleForm(root); void (async () => {
    const operationGeneration = generation;
    busy = true; error = ''; notice = ''; rerender();
    try {
      const input: ManualModuleInput = { ...moduleDraft, title: moduleDraft.title.trim(), materials: [] };
      if (!input.title || materialDrafts.some((item) => !item.title.trim())) throw new Error('Isi judul modul dan setiap materi.');
      for (const item of materialDrafts) if ((item.type === 'pdf' || item.type === 'video') && !item.file && !item.uploaded) throw new Error('Pilih berkas untuk setiap PDF dan video.');
      for (const item of materialDrafts) if (item.file && item.file.size > (item.type === 'pdf' ? 20 : 100) * 1024 * 1024) throw new Error('Berkas PDF maksimal 20 MB; video maksimal 100 MB.');
      for (const item of materialDrafts) if (item.file && item.type === 'video' && !/\.(mp4|webm)$/i.test(item.file.name)) throw new Error('Video harus MP4 atau WebM.');
      for (const item of materialDrafts) if (item.type === 'text' && !item.body.trim()) throw new Error('Isi teks materi.');
      for (const item of materialDrafts) if ((item.type === 'youtube' || item.type === 'link') && !safeUrl(item.url)) throw new Error('Gunakan URL http atau https yang valid.');
      const saved = savedModuleId ? await api.updateLearningModule(savedModuleId, input) : await api.createLearningModule(input);
      if (operationGeneration !== generation) return;
      savedModuleId = saved.id;
      for (const existing of moduleDetail?.id === saved.id ? moduleDetail.materials : []) {
        if (materialDrafts.some((item) => item.id === existing.id)) continue;
        await api.deleteLearningModuleMaterial(saved.id, existing.id);
        if (operationGeneration !== generation) return;
        moduleDetail!.materials = moduleDetail!.materials.filter((item) => item.id !== existing.id);
      }
      for (const [sortOrder, item] of materialDrafts.entries()) {
        if (item.id && moduleDetail?.id === saved.id && moduleDetail.materials.some((entry) => entry.id === item.id)) {
          await api.updateLearningModuleMaterial(saved.id, item.id, { type: item.type, title: item.title.trim(), body: item.body, url: item.url, sortOrder });
          if (operationGeneration !== generation) return;
        }
        if (item.id && item.uploaded) continue;
        if (item.type === 'pdf' || item.type === 'video') {
          if (!item.file) throw new Error('Pilih berkas untuk setiap PDF dan video.');
          if (!item.id) {
            const created = await api.createLearningModuleMaterial(saved.id, { type: item.type, title: item.title.trim(), body: '', url: '', sortOrder });
            if (operationGeneration !== generation) return;
            item.id = created.id;
          }
          const material = await api.uploadLearningModuleFile(saved.id, item.id, item.file);
          if (operationGeneration !== generation) return;
          item.id = material.id; item.uploaded = true; item.file = undefined;
        } else if (!item.id) {
          const material = await api.createLearningModuleMaterial(saved.id, { type: item.type, title: item.title.trim(), body: item.body, url: item.url, sortOrder });
          if (operationGeneration !== generation) return;
          item.id = material.id; item.uploaded = true;
        }
      }
      const readback = await api.learningModule(saved.id);
      if (operationGeneration !== generation) return;
      if (readback.materials.length < materialDrafts.length) throw new Error('Sebagian materi belum tersimpan. Silakan coba lagi.');
      moduleDetail = readback; savedModuleId = null; editingModule = false; navigate(path('modules', saved.id));
    } catch (cause) { if (operationGeneration === generation) { error = errorText(cause); if (savedModuleId) notice = 'Modul tersimpan, tetapi sebagian materi gagal. Coba lagi untuk melengkapi.'; } }
    finally { if (operationGeneration === generation) { busy = false; rerender(); } }
  })(); });
  root.querySelector<HTMLSelectElement>('#lm-module-select')?.addEventListener('change', () => { captureSessionForm(root); sessionDraft.plannedItems = []; sessionDraft.actualItems = []; rerender(); });
  root.querySelector<HTMLFormElement>('#lm-session-form')?.addEventListener('submit', (event) => { event.preventDefault(); if (busy) return; captureSessionForm(root); const button = (event as SubmitEvent).submitter as HTMLButtonElement | null; const status = (button?.dataset.lmSave ?? 'planned') as ManualSession['status']; if (status === 'completed' && !sessionDraft.reflection.trim()) { error = 'Tulis refleksi sebelum menyelesaikan sesi.'; rerender(); return; } void (async () => {
    const operationGeneration = generation;
    busy = true; error = ''; rerender();
    try { const input: ManualSessionInput = { ...sessionDraft, title: sessionDraft.title.trim(), reflection: sessionDraft.reflection.trim(), status };
      const saved = route.kind === 'learning-session-detail' ? await api.updateLearningSession(route.id, input) : await api.createLearningSession(input);
      if (operationGeneration !== generation) return;
      const readback = await api.learningSession(saved.id);
      if (operationGeneration !== generation) return;
      if (status === 'completed' && (!readback.reflection?.trim() || readback.status !== 'completed')) throw new Error('Refleksi belum terkonfirmasi tersimpan. Coba lagi.');
      sessionDetail = readback; sessionDraft = { ...readback }; notice = status === 'completed' ? 'Sesi selesai dan refleksi tersimpan.' : 'Sesi tersimpan.';
      if (route.kind === 'learning-session-editor') navigate(path('sessions', saved.id)); else rerender();
    } catch (cause) { if (operationGeneration === generation) error = errorText(cause); } finally { if (operationGeneration === generation) { busy = false; rerender(); } }
  })(); });
}
