import type { ManualModule, ManualSession } from './api';

type Loaders = { modules: () => Promise<ManualModule[]>; sessions: () => Promise<ManualSession[]> };
type State = 'idle' | 'loading' | 'ready' | 'error';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const labelDate = (value: string) => validDate(value) ? new Date(`${value}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tanggal belum tersedia';
const statusLabel: Record<ManualSession['status'], string> = { planned: 'Direncanakan', in_progress: 'Berlangsung', completed: 'Selesai' };
const routeLink = (path: string, text: string, extra = '') => `<a href="${path}" data-lh-route ${extra}>${text}</a>`;

export function createLearningHome(loaders: Loaders) {
  let owner: string | null = null;
  let active = false;
  let generation = 0;
  let state: State = 'idle';
  let error = '';
  let modules: ManualModule[] = [];
  let sessions: ManualSession[] = [];
  let query = '';
  let moduleFilter = '';
  let statusFilter = '';
  let rerender: () => void = () => {};
  function reset(nextOwner: string | null) {
    if (owner === nextOwner) return;
    generation++;
    owner = nextOwner;
    active = false;
    state = 'idle'; error = ''; modules = []; sessions = [];
    query = ''; moduleFilter = ''; statusFilter = '';
  }
  function deactivate() { if (active) { active = false; generation++; state = 'idle'; } }
  function fetchData() {
    if (!owner) return;
    const request = ++generation;
    state = 'loading'; error = '';
    void Promise.all([loaders.modules(), loaders.sessions()]).then(([nextModules, nextSessions]) => {
      if (request !== generation || !active) return;
      modules = nextModules; sessions = nextSessions; state = 'ready'; rerender();
    }).catch(cause => {
      if (request !== generation || !active) return;
      state = 'error'; error = cause instanceof Error ? cause.message : 'Data belajar tidak dapat dimuat.'; rerender();
    });
  }
  function activate(nextOwner: string, onChange: () => void) {
    reset(nextOwner);
    rerender = onChange;
    if (!active) { active = true; fetchData(); }
  }
  function retry() { if (active) { fetchData(); rerender(); } }
  function filtered() {
    const needle = query.trim().toLocaleLowerCase();
    return [...sessions].filter(session => (!moduleFilter || session.moduleId === moduleFilter) && (!statusFilter || session.status === statusFilter) && (!needle || [session.title, session.reflection, session.confusion, session.nextStep, session.objective, modules.find(module => module.id === session.moduleId)?.title].join(' ').toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  function render(reference = new Date()) {
    const today = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}-${String(reference.getDate()).padStart(2, '0')}`;
    const due = sessions.filter(session => session.status !== 'planned' && validDate(session.reviewDate) && session.reviewDate <= today).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
    const questions = sessions.filter(session => session.confusion?.trim()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const actual = sessions.reduce((sum, session) => sum + Math.max(0, Number(session.actualMinutes) || 0), 0);
    const planned = sessions.reduce((sum, session) => sum + Math.max(0, Number(session.targetMinutes) || 0), 0);
    const reflections = sessions.filter(session => session.status === 'completed' && session.reflection?.trim()).length;
    const nav = `<nav class="lh-nav" aria-label="Ruang belajar">${routeLink('/learning/modules','Modul')}${routeLink('/learning/materials','Katalog')}${routeLink('/learning/journal','Jurnal kalender')}</nav>`;
    const heading = `<header class="lh-heading"><div><p class="lh-kicker">LEARNING / JEJAK</p><h1>Jejak belajar.</h1><p>Apa yang berubah setelah kamu belajar? Simpan jejaknya, bukan hanya centangnya.</p></div><div class="lh-heading-actions">${routeLink('/learning/sessions/new','+ Catat sesi','class="lh-primary"')}${routeLink('/learning/modules/new','Buat modul')}</div></header>`;
    const metrics = `<div class="lh-metrics" aria-label="Ringkasan belajar"><div><strong>${sessions.length}</strong><span>sesi tercatat</span></div><div><strong>${actual}</strong><span>menit aktual</span></div><div><strong>${planned}</strong><span>menit direncanakan</span></div><div><strong>${reflections}</strong><span>refleksi sesi selesai</span></div><div><strong>${due.length}</strong><span>review jatuh tempo</span></div></div>`;
    if (state === 'loading' || state === 'idle') return `<div class="learning-home">${nav}${heading}<p class="lh-message" role="status">Memuat jejak belajar…</p></div>`;
    if (state === 'error') return `<div class="learning-home">${nav}${heading}<div class="lh-message" role="alert"><h2>Jejak belajar belum dapat dimuat</h2><p>${esc(error)}</p><button type="button" data-lh-retry>Coba lagi</button></div></div>`;
    const rows = filtered();
    const controls = `<div class="lh-list-head"><h2>Catatan sesi</h2><span data-lh-result-count>${rows.length} sesi</span></div><div class="lh-filters"><label>Cari sesi / catatan<input type="search" data-lh-search placeholder="Cari yang sudah dipelajari…" value="${esc(query)}"></label><label>Modul<select data-lh-module><option value="">Semua modul</option>${modules.map(module => `<option value="${esc(module.id)}" ${moduleFilter === module.id ? 'selected' : ''}>${esc(module.title)}</option>`).join('')}</select></label><label>Status<select data-lh-status><option value="">Semua status</option>${(Object.keys(statusLabel) as ManualSession['status'][]).map(status => `<option value="${status}" ${statusFilter === status ? 'selected' : ''}>${statusLabel[status]}</option>`).join('')}</select></label></div>`;
    const list = rows.length ? rows.map(session => {
      const module = modules.find(item => item.id === session.moduleId);
      const excerpt = session.reflection?.trim() || session.confusion?.trim() || session.objective?.trim() || session.practicePlan?.trim();
      return `<article class="lh-session"><time datetime="${esc(validDate(session.date) ? session.date : '')}">${esc(labelDate(session.date))}</time><div class="lh-session-copy"><small>${esc(module?.title ?? 'Modul tidak tersedia')} · ${esc(session.status === 'planned' ? `${session.targetMinutes} menit rencana` : `${session.actualMinutes} menit aktual`)}</small><h3>${routeLink(`/learning/sessions/${encodeURIComponent(session.id)}`,`${esc(session.title)} <span aria-hidden="true">↗</span>`)}</h3><p>${esc(excerpt || 'Belum ada catatan sesi.')}</p><span class="lh-chip">${statusLabel[session.status]}</span>${session.status === 'completed' && session.reflection?.trim() ? '<span class="lh-chip">Refleksi dicatat</span>' : ''}</div></article>`;
    }).join('') : `<p class="lh-empty">${sessions.length ? 'Tidak ada sesi yang cocok. Ubah pencarian atau filter.' : 'Belum ada sesi. Buat modul, lalu rencanakan sesi pertamamu.'}</p>`;
    const review = due.length ? due.map(session => `<article class="lh-review-item"><small>${esc(labelDate(session.reviewDate))} · ${esc(modules.find(module => module.id === session.moduleId)?.title ?? 'Modul tidak tersedia')}</small><h3>${esc(session.title)}</h3>${session.confusion?.trim() ? `<p>${esc(session.confusion)}</p>` : ''}${routeLink(`/learning/sessions/${encodeURIComponent(session.id)}`,'Buka catatan & review ↗')}</article>`).join('') : '<p class="lh-empty">Belum ada review jatuh tempo.</p>';
    const questionsHtml = questions.length ? questions.map(session => `<article class="lh-question"><p>${esc(session.confusion)}</p>${routeLink(`/learning/sessions/${encodeURIComponent(session.id)}`,'Lihat sesi ↗')}</article>`).join('') : '<p class="lh-empty">Belum ada pertanyaan yang dicatat.</p>';
    return `<div class="learning-home">${nav}${heading}${metrics}<div class="lh-layout"><section aria-label="Linimasa sesi">${controls}<div class="lh-records" data-lh-records>${list}</div></section><aside><section class="lh-panel lh-review"><p class="lh-kicker">KEMBALI KE YANG PENTING</p><h2>Review berikutnya <span>${due.length}</span></h2><p class="lh-muted">Berdasarkan tanggal tinjau ulang yang dicatat. Tidak mengukur penguasaan.</p>${review}</section><section class="lh-panel"><p class="lh-kicker">RUANG UNTUK BERTANYA</p><h2>Masih membingungkan</h2>${questionsHtml}</section><section class="lh-panel lh-quick"><p class="lh-kicker">LANJUTKAN BELAJAR</p>${routeLink('/learning/modules','Lihat semua modul ↗')}${routeLink('/learning/materials','Jelajahi katalog ↗')}${routeLink('/learning/journal','Buka jurnal kalender ↗')}</section></aside></div></div>`;
  }
  function bind(root: HTMLElement, navigate: (path: string) => void) {
    root.querySelectorAll<HTMLAnchorElement>('[data-lh-route]').forEach(anchor => { if (anchor.closest('.lh-session')) return; anchor.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(anchor.pathname);
    }); });
    root.querySelector<HTMLButtonElement>('[data-lh-retry]')?.addEventListener('click', retry);
    const refresh = () => {
      const view = document.createElement('div'); view.innerHTML = render();
      const records = root.querySelector('[data-lh-records]');
      const next = view.querySelector('[data-lh-records]');
      if (records && next) { records.replaceWith(next); bindRows(next as HTMLElement, navigate); }
      const count = root.querySelector('[data-lh-result-count]'); if (count) count.textContent = `${filtered().length} sesi`;
    };
    root.querySelector<HTMLInputElement>('[data-lh-search]')?.addEventListener('input', event => { query = (event.target as HTMLInputElement).value; refresh(); });
    root.querySelector<HTMLSelectElement>('[data-lh-module]')?.addEventListener('change', event => { moduleFilter = (event.target as HTMLSelectElement).value; refresh(); });
    root.querySelector<HTMLSelectElement>('[data-lh-status]')?.addEventListener('change', event => { statusFilter = (event.target as HTMLSelectElement).value; refresh(); });
    bindRows(root, navigate);
  }
  function bindRows(root: HTMLElement, navigate: (path: string) => void) {
    root.querySelectorAll<HTMLAnchorElement>('.lh-session [data-lh-route]').forEach(anchor => anchor.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(anchor.pathname);
    }));
  }
  return { reset, activate, deactivate, retry, render, bind };
}
