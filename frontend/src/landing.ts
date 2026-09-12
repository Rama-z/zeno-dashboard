export type LandingTheme = 'dark' | 'light';
type LandingCallbacks = { onThemeToggle: () => void };
type WorkspaceKey = 'doing' | 'learning' | 'workout' | 'journaling' | 'spending';
type FeatureKey = 'session' | 'activity' | 'changes';
type AccessKey = 'user' | 'admin';
type InteractiveCopy = { label: string; title: string; copy: string; detail: string; icon: string };

const featureCopy: Record<FeatureKey, InteractiveCopy> = {
  session: { label: 'Session Log', title: 'Konteksnya ketemu. Lanjutkan idemu.', copy: 'Cari dan filter ringkasan sesi. Buka pertanyaan serta jawaban saat kamu perlu membaca konteks lengkapnya.', detail: 'Ringkasan bersumber dari Markdown dan tetap terhubung ke detail aslinya.', icon: 'notebook' },
  activity: { label: 'Activity', title: 'Setiap perubahan punya pelaku.', copy: 'Audit trail mencatat actor, action, entity, dan waktu. Kamu bisa menelusuri apa yang berubah dan siapa yang mengubahnya.', detail: 'Tampilan mengikuti role dan ownership akun yang sedang aktif.', icon: 'pulse' },
  changes: { label: 'Change Log', title: 'Zeno bertumbuh, riwayatnya tetap ada.', copy: 'Baca update produk per tanggal, pilih rentang waktu, lalu urutkan dari terbaru atau terlama.', detail: 'Catatan perubahan tersimpan di PostgreSQL dengan fallback lokal.', icon: 'clock-counter-clockwise' },
};
const workspaceCopy: Record<WorkspaceKey, InteractiveCopy> = {
  doing: { label: 'Doing', title: 'Satu centang. Satu langkah maju.', copy: 'Ide besar boleh mulai dari tugas kecil. Susun rencana harian, tandai yang selesai, lalu beri ruang untuk hal berikutnya.', detail: 'Coba centang tugas di samping. Progresmu ikut bergerak.', icon: 'check-square' },
  learning: { label: 'Learning', title: 'Rasa penasaran punya tempat.', copy: 'Kumpulkan pelajaran, catatan, dan progres belajarmu. Sedikit hari ini, makin paham esok hari.', detail: 'Intip contoh catatan belajar bahasa Inggris di workspace mini.', icon: 'book-open' },
  workout: { label: 'Workout', title: 'Gerak sedikit. Rasanya beda.', copy: 'Rencanakan sesi, set, repetisi, dan durasi. Lihat latihan sebagai kebiasaan, bukan sekadar angka.', detail: 'Ini contoh rencana latihan, bukan timer yang sedang berjalan.', icon: 'barbell' },
  journaling: { label: 'Journaling', title: 'Nggak harus rapi. Tulis saja.', copy: 'Beri pikiranmu ruang untuk singgah. Refleksi kecil, ide spontan, atau satu hal baik yang ingin kamu ingat.', detail: 'Coba tulis di sini. Teks hanya diingat selama halaman ini terbuka.', icon: 'note-pencil' },
  spending: { label: 'Spending', title: 'Tahu ke mana uangmu pergi.', copy: 'Catat pengeluaran beserta konteksnya. Dari kopi sampai kebutuhan harian, semuanya lebih mudah ditelusuri.', detail: 'Jumlah di samping dihitung dari transaksi contoh, bukan data akun.', icon: 'wallet' },
};
const accessCopy: Record<AccessKey, InteractiveCopy> = {
  user: { label: 'User', title: 'Ruang kerja tetap personal.', copy: 'Pengguna biasa hanya melihat dan mengubah record serta activity miliknya.', detail: 'Ownership diterapkan di backend untuk Doing, Learning, Workout, Journaling, Spending, dan audit activity.', icon: 'user-circle' },
  admin: { label: 'Admin', title: 'Pengelolaan dengan akses lebih luas.', copy: 'Admin dapat melihat dan mengelola seluruh record serta activity, termasuk data pengguna lain.', detail: 'Role admin ditentukan lewat konfigurasi server (ADMIN_EMAILS), bukan tombol di browser. Memilih demo ini tidak mengubah hak akses.', icon: 'shield-check' },
};
const icon = (name: string) => `<span class="ph ph-${name}" aria-hidden="true"></span>`;
const escapeText = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const taskLabels = ['Bikin ruang untuk ide baru', 'Selesaikan ide keren itu', 'Jalan sore tanpa notifikasi'];
const transactions = [{ label: 'Kopi & waktu sendiri', amount: 28000, icon: 'coffee' }, { label: 'Buku untuk akhir pekan', amount: 89000, icon: 'book-open' }, { label: 'Bekal hari ini', amount: 35000, icon: 'bowl-food' }];
const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
// Page-lifetime demo only. Never localStorage, fetch, API, or dashboard state.
const demo = { tasks: [true, false, false], journal: 'Hari ini, pelan-pelan juga tetap maju.', workspace: 'doing' as WorkspaceKey, feature: 'session' as FeatureKey, access: 'user' as AccessKey, paused: false };

function renderTabs<T extends string>(items: Record<T, InteractiveCopy>, group: string, attribute: string, active: T) {
  return (Object.entries(items) as [T, InteractiveCopy][]).map(([key, item]) => `<button class="landing-choice ${active === key ? 'is-active' : ''}" type="button" role="tab" id="landing-${group}-tab-${key}" aria-controls="landing-${group}-panel-${key}" ${attribute}="${key}" aria-selected="${active === key}" tabindex="${active === key ? '0' : '-1'}">${icon(item.icon)}${item.label}</button>`).join('');
}
function renderCopy(item: InteractiveCopy) {
  return `<span class="landing-panel-label">${icon(item.icon)} ${item.label}</span><h3>${item.title}</h3><p>${item.copy}</p><small>${item.detail}</small>`;
}
function renderInfoPanels<T extends string>(items: Record<T, InteractiveCopy>, group: string, active: T) {
  return (Object.entries(items) as [T, InteractiveCopy][]).map(([key, item]) => `<article class="landing-info-panel" role="tabpanel" tabindex="0" id="landing-${group}-panel-${key}" aria-labelledby="landing-${group}-tab-${key}" ${active === key ? '' : 'hidden'}>${renderCopy(item)}</article>`).join('');
}
function renderDemo(key: WorkspaceKey) {
  switch (key) {
    case 'doing': return `<div class="landing-demo-heading"><h4>Hal kecil, hari ini.</h4>${icon('sun-horizon')}</div><div class="landing-task-list">${taskLabels.map((label, index) => `<label class="landing-task"><input type="checkbox" data-demo-task="${index}" ${demo.tasks[index] ? 'checked' : ''} /><span>${label}</span></label>`).join('')}</div><div class="landing-progress-caption"><span>Ruang untuk progres</span><strong data-demo-count>${demo.tasks.filter(Boolean).length} / 3 selesai</strong></div><progress data-demo-progress max="3" value="${demo.tasks.filter(Boolean).length}" aria-label="Tugas demo selesai"></progress><p class="landing-demo-note">Satu langkah juga tetap langkah.</p>`;
    case 'learning': return `<div class="landing-demo-heading"><h4>Catatan penasaran.</h4>${icon('book-open')}</div><span class="landing-tag">ENGLISH / PRESENT SIMPLE</span><div class="landing-note-paper"><h5>Hal yang berulang, pakai simple present.</h5><p>Gunakan bentuk dasar kata kerja untuk rutinitas. Tambahkan -s atau -es untuk he, she, dan it.</p><blockquote>“I learn something new every day.”</blockquote><p><strong>Ingat:</strong> “She reads”, bukan “She read”.</p></div>`;
    case 'workout': return `<div class="landing-demo-heading"><h4>Reset badan & pikiran.</h4>${icon('barbell')}</div><div class="landing-workout-time"><strong>25:00</strong><span>MENIT:DETIK / RENCANA SESI</span></div><dl class="landing-exercise-list"><div><dt>Squat</dt><dd>3 set × 12 repetisi</dd></div><div><dt>Push-up</dt><dd>3 set × 8 repetisi</dd></div><div><dt>Plank</dt><dd>2 set × 30 detik</dd></div></dl>`;
    case 'journaling': return `<div class="landing-demo-heading"><h4>Cerita yang boleh pelan.</h4>${icon('note-pencil')}</div><label class="landing-journal-label" for="landing-journal">Apa yang ingin kamu ingat hari ini?</label><textarea id="landing-journal" data-demo-journal rows="6" maxlength="5000" aria-describedby="landing-journal-help">${escapeText(demo.journal)}</textarea><p class="landing-demo-note" id="landing-journal-help">Hanya di halaman ini. Tidak dikirim atau disimpan ke akun.</p>`;
    case 'spending': return `<div class="landing-demo-heading"><h4>Pengeluaran kecil hari ini.</h4>${icon('wallet')}</div><ul class="landing-transactions">${transactions.map((item) => `<li><span>${icon(item.icon)}${item.label}</span><strong>${rupiah(item.amount)}</strong></li>`).join('')}</ul><div class="landing-spending-total"><span>Total contoh</span><strong data-demo-total>${rupiah(transactions.reduce((sum, item) => sum + item.amount, 0))}</strong></div>`;
  }
}
function renderWorkspacePanels() {
  return (Object.keys(workspaceCopy) as WorkspaceKey[]).map((key) => `<div class="landing-workspace-panel" role="tabpanel" tabindex="0" id="landing-workspace-panel-${key}" aria-labelledby="landing-workspace-tab-${key}" ${demo.workspace === key ? '' : 'hidden'}><div class="landing-workspace-copy">${renderCopy(workspaceCopy[key])}</div><div class="landing-demo"><div class="landing-demo-bar"><span class="landing-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Demo · Data contoh</span>${icon('sparkle')}</div><div class="landing-demo-body">${renderDemo(key)}</div></div></div>`).join('');
}

export function renderLandingPage(theme: LandingTheme) {
  const marquee = `<div class="landing-marquee-group">${['Doing', 'Learning', 'Workout', 'Journaling', 'Spending'].map((label) => `<span>${label}</span><b>✳</b>`).join('')}</div>`;
  return `<main class="zeno-landing" data-landing-page id="top">
    <a class="landing-skip" href="#workspace">Lewati ke demo workspace</a>
    <header class="landing-nav-shell landing-container">
      <a class="landing-brand" href="#top" aria-label="Zeno home"><img src="/zeno-logo-96.webp" width="40" height="40" alt="" /><strong>Zeno<span class="landing-brand-note">playground</span></strong></a>
      <nav class="landing-nav-links" id="landing-navigation" aria-label="Navigasi landing page"><a href="#workspace">Workspace</a><a href="#observability">Kenapa Zeno?</a></nav>
      <div class="landing-nav-actions"><button class="landing-theme-button" type="button" data-landing-theme aria-label="Gunakan tema ${theme === 'dark' ? 'terang' : 'gelap'}">${icon(theme === 'dark' ? 'sun' : 'moon')}</button><a class="landing-login" href="/login">Masuk ${icon('arrow-up-right')}</a><button class="landing-menu-button" type="button" data-landing-menu aria-controls="landing-navigation" aria-expanded="false" aria-label="Buka navigasi">${icon('list')}</button></div>
    </header>
    <section class="landing-hero landing-container" aria-labelledby="landing-title">
      <div class="landing-hero-copy"><p class="landing-eyebrow">A LITTLE STRUCTURE. A LOT OF YOU.</p><h1 id="landing-title"><span>Banyak ide.</span><span>Satu ruang.</span><span class="landing-hero-emphasis">Lebih seru.<svg viewBox="0 0 430 28" aria-hidden="true"><path d="M6 19 Q210 -4 423 14 M45 25 Q235 8 384 23" /></svg></span></h1><p>Dari to-do sampai me-time. Satukan rencana, belajar, dan cerita harianmu di Zeno. Biar hidup nggak cuma buka tab baru.</p><div class="landing-hero-actions"><a class="landing-primary-button" href="#workspace">Jelajahi Zeno ${icon('arrow-right')}</a><a class="landing-secondary-button" href="#observability">Kenalan dulu ${icon('arrow-down-right')}</a></div></div>
      <div class="landing-hero-art" data-landing-scene role="group" aria-label="Teman kecil untuk harimu. Demo · Data contoh">
        <div class="landing-orbit-layer" data-depth="0.4" data-scroll-depth="0.035" aria-hidden="true"><div class="landing-orbit"></div><div class="landing-orbit landing-orbit-secondary"></div></div>
        <span class="landing-star landing-star-one" data-depth="1.2" data-scroll-depth="-0.05" aria-hidden="true">${icon('sparkle')}</span><span class="landing-star landing-star-two" data-depth="-0.7" data-scroll-depth="0.025" aria-hidden="true">${icon('asterisk-simple')}</span>
        <div class="landing-mascot-layer" data-depth="0.8"><div class="landing-mascot-float"><svg class="landing-mascot" data-landing-mascot viewBox="0 0 340 360" role="img" aria-label="Maskot lime Zeno tersenyum"><path class="landing-blob" d="M165 20 C222 -4 282 34 283 91 C348 111 352 176 311 217 C344 278 298 326 241 320 C208 365 141 363 115 325 C48 345 6 294 28 235 C-10 197 1 137 45 117 C39 59 92 10 137 27 C148 24 156 20 165 20Z"/><ellipse cx="122" cy="150" rx="20" ry="28" fill="#fffef8"/><ellipse cx="211" cy="150" rx="20" ry="28" fill="#fffef8"/><g data-mascot-eyes><ellipse cx="126" cy="154" rx="9" ry="14" fill="#202820"/><ellipse cx="207" cy="154" rx="9" ry="14" fill="#202820"/></g><path d="M134 205 Q170 244 207 202" fill="none" stroke="#202820" stroke-width="9" stroke-linecap="round"/><ellipse cx="103" cy="199" rx="16" ry="9" fill="#accd54"/><ellipse cx="237" cy="196" rx="16" ry="9" fill="#accd54"/></svg></div></div>
        <div class="landing-float-layer landing-doing-layer" data-depth="-0.6"><article class="landing-float-card landing-doing-card"><span>${icon('check-square')} Doing</span><p>Selesaikan ide keren itu</p><small>Demo · Data contoh</small></article></div>
        <div class="landing-float-layer landing-workout-layer" data-depth="1.1"><article class="landing-float-card landing-workout-card"><span>${icon('barbell')} Workout</span><strong>25:00</strong><small>Demo · Data contoh</small></article></div>
        <div class="landing-float-layer landing-journal-layer" data-depth="-0.9"><article class="landing-float-card landing-journal-card"><span>${icon('note-pencil')} Journaling</span><p>Hari ini, pelan-pelan juga tetap maju.</p><small>Demo · Data contoh</small></article></div>
        <span class="landing-handnote">less chaos, more you.</span>
      </div>
      <div class="landing-motion-controls"><button type="button" data-landing-pause aria-pressed="${demo.paused}">${icon(demo.paused ? 'play' : 'pause')}<span>${demo.paused ? 'Lanjutkan animasi' : 'Jeda animasi'}</span></button><span data-motion-note>Atur ritmemu sendiri.</span></div>
    </section>
    <section class="landing-marquee" aria-label="Doing, Learning, Workout, Journaling, Spending"><div class="landing-marquee-track" aria-hidden="true">${marquee}${marquee}</div></section>
    <section class="landing-section landing-container landing-workspace" id="workspace" tabindex="-1" aria-labelledby="workspace-title" data-reveal>
      <h2 id="workspace-title">Hidup punya banyak tab.<br />Kamu cukup buka satu.</h2><p class="landing-section-intro">Lima ruang untuk harimu. Coba dulu, tanpa perlu masuk.</p>
      <div class="landing-choice-list landing-workspace-choices" role="tablist" aria-label="Area personal workspace">${renderTabs(workspaceCopy, 'workspace', 'data-workspace-module', demo.workspace)}</div>
      ${renderWorkspacePanels()}
      <p class="landing-sr-only" data-demo-status role="status" aria-live="polite" aria-atomic="true"></p>
    </section>
    <section class="landing-section landing-container landing-observability" id="observability" tabindex="-1" aria-labelledby="observability-title" data-reveal>
      <div class="landing-story-heading"><span class="landing-story-mark" aria-hidden="true">${icon('scribble-loop')}</span><h2 id="observability-title">Progres punya cerita.</h2><p class="landing-section-intro">Bukan cuma apa yang selesai. Tapi juga bagaimana kamu sampai di sana.</p></div>
      <div class="landing-story-card"><div class="landing-choice-list" role="tablist" aria-label="Fitur observability">${renderTabs(featureCopy, 'feature', 'data-feature-tab', demo.feature)}</div>${renderInfoPanels(featureCopy, 'feature', demo.feature)}</div>
    </section>
    <section class="landing-section landing-container landing-ownership" id="ownership" aria-labelledby="ownership-title" data-reveal>
      <div class="landing-ownership-heading"><span class="landing-lock-mark" aria-hidden="true">${icon('lock-key')}</span><h2 id="ownership-title">Ruangmu.<br />Tetap milikmu.</h2><p>Daftar, verifikasi email, lalu masuk. Backend menjaga session dan membatasi data sesuai role serta ownership.</p><span class="landing-security-note">${icon('shield-check')} Session HttpOnly · Hak akses di server</span></div>
      <div class="landing-access-card"><p class="landing-panel-label">Kenali perbedaan akses</p><div class="landing-choice-list" role="tablist" aria-label="Tampilan akses">${renderTabs(accessCopy, 'access', 'data-access-view', demo.access)}</div>${renderInfoPanels(accessCopy, 'access', demo.access)}</div>
    </section>
    <section class="landing-cta landing-container" aria-labelledby="cta-title" data-reveal><span class="landing-cta-star" aria-hidden="true">${icon('asterisk-simple')}</span><h2 id="cta-title">Bikin ruang untuk<br />versi kamu berikutnya.</h2><a class="landing-primary-button" href="/login">Masuk ke Zeno ${icon('arrow-up-right')}</a><p>Rencanakan. Coba. Ceritakan. Ulangi dengan caramu.</p></section>
    <footer class="landing-footer landing-container"><a class="landing-brand" href="#top" aria-label="Zeno home"><img src="/zeno-logo-96.webp" width="36" height="36" alt="" /><strong>Zeno</strong></a><p>YOUR LIFE, A LITTLE MORE TOGETHER.</p><a href="#top">Kembali ke atas ${icon('arrow-up-right')}</a></footer>
  </main>`;
}

function bindLandingMotion(root: HTMLElement, signal: AbortSignal) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const pointerAllowed = () => fine.matches && !(navigator.maxTouchPoints > 0);
  const scene = root.querySelector<HTMLElement>('[data-landing-scene]')!;
  const eyes = root.querySelector<SVGElement>('[data-mascot-eyes]')!;
  const layers = [...root.querySelectorAll<HTMLElement>('[data-depth]')].map((element) => ({ element, depth: Number(element.dataset.depth), scrollDepth: Number(element.dataset.scrollDepth ?? 0) }));
  const pause = root.querySelector<HTMLButtonElement>('[data-landing-pause]')!;
  const note = root.querySelector<HTMLElement>('[data-motion-note]')!;
  const reveals = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  let observer: IntersectionObserver | undefined;
  let frame = 0;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  let targetScroll = window.scrollY, currentScroll = window.scrollY;
  let box = { left: 0, top: 0, width: 1, height: 1 };
  let viewportHeight = window.innerHeight;
  const measure = () => {
    const rect = scene.getBoundingClientRect();
    box = { left: rect.left, top: rect.top + window.scrollY, width: rect.width || 1, height: rect.height || 1 };
    viewportHeight = window.innerHeight;
  };
  const running = () => root.dataset.motion === 'running' && root.isConnected;
  const inView = () => targetScroll + viewportHeight >= box.top && targetScroll <= box.top + box.height;
  const applyTransforms = () => {
    layers.forEach(({ element, depth, scrollDepth }) => {
      element.style.setProperty('--px', `${(currentX * depth * 8).toFixed(2)}px`);
      element.style.setProperty('--py', `${(currentY * depth * 6).toFixed(2)}px`);
      element.style.setProperty('--sy', `${(Math.min(500, Math.max(0, currentScroll)) * scrollDepth).toFixed(2)}px`);
    });
    eyes.style.transform = `translate(${(currentX * 5).toFixed(2)}px, ${(currentY * 4).toFixed(2)}px)`;
  };
  const tick = () => {
    frame = 0;
    if (!running() || !inView()) return;
    currentX += (targetX - currentX) * 0.13;
    currentY += (targetY - currentY) * 0.13;
    currentScroll += (targetScroll - currentScroll) * 0.13;
    applyTransforms();
    if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002 || Math.abs(targetScroll - currentScroll) > 0.1) schedule();
  };
  const schedule = () => {
    if (!frame && running() && inView()) frame = requestAnimationFrame(tick);
  };
  const stopFrame = () => { cancelAnimationFrame(frame); frame = 0; };
  const refreshPolicy = () => {
    stopFrame();
    const mode = reduced.matches ? 'reduced' : demo.paused || document.hidden ? 'paused' : 'running';
    root.dataset.motion = mode;
    root.dataset.pointerMotion = String(mode === 'running' && pointerAllowed());
    pause.disabled = reduced.matches;
    pause.setAttribute('aria-pressed', String(demo.paused));
    pause.innerHTML = `${icon(reduced.matches || demo.paused ? 'play' : 'pause')}<span>${reduced.matches ? 'Animasi dikurangi' : demo.paused ? 'Lanjutkan animasi' : 'Jeda animasi'}</span>`;
    note.textContent = reduced.matches ? 'Mengikuti preferensi perangkatmu.' : 'Atur ritmemu sendiri.';
    observer?.disconnect();
    if (mode !== 'running' || !('IntersectionObserver' in window)) {
      reveals.forEach((element) => element.classList.add('is-visible'));
    } else {
      root.classList.add('landing-motion-ready');
      observer ??= new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      reveals.filter((element) => !element.classList.contains('is-visible')).forEach((element) => observer!.observe(element));
    }
    if (reduced.matches || !pointerAllowed()) {
      targetX = targetY = currentX = currentY = 0;
      if (reduced.matches) currentScroll = 0;
      applyTransforms();
    }
    if (mode === 'running') { measure(); targetScroll = window.scrollY; schedule(); }
  };
  pause.addEventListener('click', () => { demo.paused = !demo.paused; refreshPolicy(); }, { signal });
  reduced.addEventListener('change', refreshPolicy, { signal });
  fine.addEventListener('change', refreshPolicy, { signal });
  document.addEventListener('visibilitychange', refreshPolicy, { signal });
  // Geometry is measured on entry/resize, never inside the pointermove hot path.
  scene.addEventListener('pointerenter', measure, { signal, passive: true });
  scene.addEventListener('pointermove', (event) => {
    if (!running() || !pointerAllowed() || event.pointerType === 'touch') return;
    targetX = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY + window.scrollY - box.top) / box.height * 2 - 1));
    schedule();
  }, { signal, passive: true });
  scene.addEventListener('pointerleave', () => { targetX = targetY = 0; schedule(); }, { signal, passive: true });
  window.addEventListener('scroll', () => { targetScroll = window.scrollY; schedule(); }, { signal, passive: true });
  window.addEventListener('resize', () => { measure(); schedule(); }, { signal, passive: true });
  let resizeObserver: ResizeObserver | undefined;
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => { measure(); schedule(); });
    resizeObserver.observe(scene);
  }
  refreshPolicy();
  return () => {
    stopFrame();
    observer?.disconnect();
    resizeObserver?.disconnect();
    root.dataset.motion = 'paused';
    root.dataset.pointerMotion = 'false';
    root.classList.remove('landing-motion-ready');
  };
}

let activeCleanup: (() => void) | undefined;

export function bindLandingEvents(callbacks: LandingCallbacks): () => void {
  activeCleanup?.();
  const root = document.querySelector<HTMLElement>('[data-landing-page]');
  if (!root) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  const status = root.querySelector<HTMLElement>('[data-demo-status]')!;
  const selectTab = (button: HTMLButtonElement) => {
    const group = button.closest('[role="tablist"]')!;
    group.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab) => {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('is-active', selected);
      const panel = root.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !selected;
    });
    if (button.dataset.workspaceModule) {
      demo.workspace = button.dataset.workspaceModule as WorkspaceKey;
      status.textContent = `Demo ${workspaceCopy[demo.workspace].label} dipilih. ${workspaceCopy[demo.workspace].detail}`;
    } else if (button.dataset.featureTab) {
      demo.feature = button.dataset.featureTab as FeatureKey;
      status.textContent = `${featureCopy[demo.feature].label}. ${featureCopy[demo.feature].title}`;
    } else if (button.dataset.accessView) {
      demo.access = button.dataset.accessView as AccessKey;
      status.textContent = `${accessCopy[demo.access].label}. ${accessCopy[demo.access].copy}`;
    }
  };
  root.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((button) => {
    button.addEventListener('click', () => selectTab(button), { signal });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...button.closest('[role="tablist"]')!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (buttons.indexOf(button) + direction + buttons.length) % buttons.length;
      buttons[index].focus();
      selectTab(buttons[index]);
    }, { signal });
  });
  const themeButton = root.querySelector<HTMLButtonElement>('[data-landing-theme]')!;
  themeButton.addEventListener('click', () => {
    callbacks.onThemeToggle();
    const dark = document.documentElement.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', `Gunakan tema ${dark ? 'terang' : 'gelap'}`);
    themeButton.innerHTML = icon(dark ? 'sun' : 'moon');
  }, { signal });
  const menuButton = root.querySelector<HTMLButtonElement>('[data-landing-menu]')!;
  const navigation = root.querySelector<HTMLElement>('#landing-navigation')!;
  const setMenu = (open: boolean) => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Tutup navigasi' : 'Buka navigasi');
    menuButton.innerHTML = icon(open ? 'x' : 'list');
    navigation.classList.toggle('is-open', open);
  };
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'), { signal });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuButton.focus();
    }
  }, { signal });
  document.addEventListener('click', (event) => {
    const path = event.composedPath();
    if (!path.includes(navigation) && !path.includes(menuButton)) setMenu(false);
  }, { signal });
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = root.querySelector<HTMLElement>(link.hash) ?? (link.hash === '#top' ? root : null);
      if (!target) return;
      event.preventDefault();
      setMenu(false);
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: root.dataset.motion === 'running' ? 'smooth' : 'auto', block: 'start' });
      history.pushState(null, '', link.hash);
    }, { signal });
  });
  root.querySelectorAll<HTMLInputElement>('[data-demo-task]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      demo.tasks[Number(checkbox.dataset.demoTask)] = checkbox.checked;
      const count = demo.tasks.filter(Boolean).length;
      root.querySelector<HTMLElement>('[data-demo-count]')!.textContent = `${count} / 3 selesai`;
      root.querySelector<HTMLProgressElement>('[data-demo-progress]')!.value = count;
      status.textContent = `Demo Doing: ${count} dari 3 tugas selesai.`;
    }, { signal });
  });
  root.querySelector<HTMLTextAreaElement>('[data-demo-journal]')?.addEventListener('input', (event) => {
    demo.journal = (event.currentTarget as HTMLTextAreaElement).value;
  }, { signal });
  const stopMotion = bindLandingMotion(root, signal);
  const removalObserver = new MutationObserver(() => { if (!root.isConnected) cleanup(); });
  const cleanup = () => {
    controller.abort();
    stopMotion();
    removalObserver.disconnect();
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  removalObserver.observe(document.documentElement, { childList: true, subtree: true });
  activeCleanup = cleanup;
  return cleanup;
}
