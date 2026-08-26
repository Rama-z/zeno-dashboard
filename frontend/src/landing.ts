export type LandingTheme = 'dark' | 'light';

type LandingCallbacks = {
  onThemeToggle: () => void;
};

type FeatureKey = 'session' | 'activity' | 'changes';
type WorkspaceKey = 'doing' | 'learning' | 'workout' | 'journaling' | 'spending';
type AccessKey = 'user' | 'admin';

type InteractiveCopy = {
  label: string;
  title: string;
  copy: string;
  detail: string;
};

const featureCopy: Record<FeatureKey, InteractiveCopy> = {
  session: {
    label: 'Session Log',
    title: 'Baca sesi tanpa membuka semuanya.',
    copy: 'Cari, filter, lalu buka pertanyaan dan jawaban hanya saat konteksnya dibutuhkan.',
    detail: 'Ringkasan bersumber dari Markdown dan tetap terhubung ke detail aslinya.',
  },
  activity: {
    label: 'Activity',
    title: 'Setiap perubahan punya pelaku.',
    copy: 'Audit trail menyimpan actor, action, entity, dan waktu agar asal perubahan tetap jelas.',
    detail: 'Tampilan mengikuti role dan ownership akun yang sedang aktif.',
  },
  changes: {
    label: 'Change Log',
    title: 'Riwayat tetap bisa ditelusuri.',
    copy: 'Kelompokkan update per tanggal, pilih rentang waktu, lalu urutkan dari terbaru atau terlama.',
    detail: 'Catatan perubahan tersimpan di PostgreSQL dengan fallback lokal.',
  },
};

const workspaceCopy: Record<WorkspaceKey, InteractiveCopy> = {
  doing: {
    label: 'Doing',
    title: 'Rencana harian yang tetap bergerak.',
    copy: 'Susun task per tanggal, tandai yang selesai, dan lihat unfinished badge langsung dari kalender.',
    detail: 'Tambah, edit, hapus, checklist, dan scroll position tetap terjaga.',
  },
  learning: {
    label: 'Learning',
    title: 'Pelajaran tersimpan di hari yang tepat.',
    copy: 'Catat apa yang dipelajari melalui kalender lintas bulan dan tahun.',
    detail: 'Kategori, catatan, checklist, dan histori harian tetap mudah dicari kembali.',
  },
  workout: {
    label: 'Workout',
    title: 'Latihan terlihat sebagai kebiasaan.',
    copy: 'Pantau sesi, set, repetisi, durasi, dan status selesai tanpa meninggalkan workspace.',
    detail: 'Kalender membedakan latihan aktif dan hari yang sudah tuntas.',
  },
  journaling: {
    label: 'Journaling',
    title: 'Tulis fokus, simpan otomatis.',
    copy: 'Gunakan editor Markdown, live preview, autosave draft, arsip, shortcut, dan mode fokus.',
    detail: 'Ruang tulis dan arsip berada dalam alur yang sama.',
  },
  spending: {
    label: 'Spending',
    title: 'Pengeluaran punya konteks waktu.',
    copy: 'Catat transaksi dan lihat total harian, mingguan, bulanan, serta tahunan.',
    detail: 'Ledger tersimpan bersama area personal lain tanpa mencampur data pengguna.',
  },
};

const accessCopy: Record<AccessKey, InteractiveCopy> = {
  user: {
    label: 'User',
    title: 'Ruang kerja tetap personal.',
    copy: 'Pengguna biasa hanya melihat dan mengubah record serta activity miliknya.',
    detail: 'Ownership diterapkan di backend untuk Doing, Learning, Workout, Journaling, Spending, dan audit activity.',
  },
  admin: {
    label: 'Admin',
    title: 'Visibilitas operasional saat dibutuhkan.',
    copy: 'Admin dapat melihat seluruh record dan activity untuk kebutuhan pengelolaan workspace.',
    detail: 'Role admin ditentukan lewat konfigurasi server, bukan kontrol visual di browser.',
  },
};

const renderTabs = <T extends string>(items: Record<T, InteractiveCopy>, attribute: string, active: T) =>
  (Object.entries(items) as [T, InteractiveCopy][])
    .map(([key, item]) => `<button class="landing-choice ${key === active ? 'is-active' : ''}" type="button" role="tab" ${attribute}="${key}" aria-selected="${key === active}" tabindex="${key === active ? '0' : '-1'}">${item.label}</button>`)
    .join('');

export function renderLandingPage(theme: LandingTheme) {
  const nextTheme = theme === 'dark' ? 'terang' : 'gelap';
  const currentFeature = featureCopy.session;
  const currentWorkspace = workspaceCopy.doing;
  const currentAccess = accessCopy.user;

  return `
    <main class="zeno-landing" data-landing-page>
      <header class="landing-nav-shell">
        <a class="landing-brand" href="#top" aria-label="Zeno home">
          <img src="/zeno-logo-96.webp" width="40" height="40" alt="" />
          <span><strong>Zeno</strong><small>PERSONAL WORKSPACE</small></span>
        </a>
        <button class="landing-menu-button" type="button" data-landing-menu aria-controls="landing-navigation" aria-expanded="false" aria-label="Buka navigasi">
          <span></span><span></span><span></span>
        </button>
        <nav class="landing-nav-links" id="landing-navigation" aria-label="Navigasi landing page">
          <a href="#observability">Observability</a>
          <a href="#workspace">Workspace</a>
          <a href="#ownership">Ownership</a>
        </nav>
        <div class="landing-nav-actions">
          <button class="landing-theme-button" type="button" data-landing-theme aria-label="Gunakan tema ${nextTheme}"><span aria-hidden="true"></span>${nextTheme}</button>
          <a class="landing-login" href="/login">Masuk</a>
        </div>
      </header>

      <section class="landing-hero" id="top" aria-labelledby="landing-title">
        <div class="landing-hero-media landing-image-shell is-loading" data-tilt-media>
          <img src="/zeno-landing-hero.webp" srcset="/zeno-landing-hero-800.webp 800w, /zeno-landing-hero.webp 1600w" sizes="100vw" width="1600" height="900" alt="Objek logam dan kaca biru berbentuk Z pada ruang gelap" fetchpriority="high" data-landing-image />
          <span class="landing-media-fallback">Visual Zeno tidak tersedia.</span>
        </div>
        <div class="landing-hero-scrim"></div>
        <div class="landing-hero-copy" data-reveal>
          <p class="landing-eyebrow">ZENO PERSONAL WORKSPACE</p>
          <h1 id="landing-title"><span>Kerja terlihat.</span><span>Hari terarah.</span></h1>
          <p>Zeno menyatukan session log, aktivitas, dan progres personal dalam satu workspace yang mudah dibaca.</p>
          <div class="landing-hero-actions">
            <a class="landing-primary-button" href="/login">Masuk ke Zeno</a>
            <a class="landing-secondary-button" href="#observability">Lihat fitur</a>
          </div>
        </div>
        <div class="landing-marquee" aria-label="Fitur Zeno">
          <span class="sr-only">Session Log, Activity, Change Log, Doing, Learning, Workout, Journaling, Spending</span>
          <div class="landing-marquee-track" aria-hidden="true">
            <span>Session Log</span><span>Activity</span><span>Change Log</span><span>Doing</span><span>Learning</span><span>Workout</span><span>Journaling</span><span>Spending</span>
            <span>Session Log</span><span>Activity</span><span>Change Log</span><span>Doing</span><span>Learning</span><span>Workout</span><span>Journaling</span><span>Spending</span>
          </div>
        </div>
      </section>

      <section class="landing-section landing-observability" id="observability" aria-labelledby="observability-title">
        <div class="landing-section-heading" data-reveal>
          <h2 id="observability-title">Dari kejadian ke konteks.</h2>
          <p>Pilih lapisan informasi yang ingin dibaca. Zeno menjaga ringkasan tetap singkat dan detail tetap dekat.</p>
        </div>
        <div class="landing-observe-frame landing-image-shell is-loading" data-reveal>
          <img src="/zeno-landing-observability.webp" width="1600" height="900" alt="Lapisan kaca dan jalur cahaya yang menggambarkan aliran data" loading="lazy" data-landing-image />
          <span class="landing-media-fallback">Visual observability tidak tersedia.</span>
          <div class="landing-observe-scrim"></div>
          <div class="landing-observe-content">
            <div class="landing-choice-list" role="tablist" aria-label="Fitur observability">
              ${renderTabs(featureCopy, 'data-feature-tab', 'session')}
            </div>
            <article class="landing-live-panel" role="tabpanel" aria-live="polite" aria-atomic="true">
              <span data-feature-name>${currentFeature.label}</span>
              <h3 data-feature-title>${currentFeature.title}</h3>
              <p data-feature-copy>${currentFeature.copy}</p>
              <small data-feature-detail>${currentFeature.detail}</small>
            </article>
          </div>
        </div>
      </section>

      <section class="landing-section landing-workspace" id="workspace" aria-labelledby="workspace-title">
        <div class="landing-workspace-visual landing-image-shell is-loading" data-reveal>
          <img src="/zeno-landing-workspace.webp" width="1600" height="900" alt="Kalender, jam latihan, buku catatan, dan alat perencanaan Zeno" loading="lazy" data-landing-image />
          <span class="landing-media-fallback">Visual workspace tidak tersedia.</span>
        </div>
        <div class="landing-workspace-copy" data-reveal>
          <div class="landing-section-heading">
            <h2 id="workspace-title">Rutinitas harian, satu konteks.</h2>
            <p>Berpindah area tanpa kehilangan hubungan antara rencana, pembelajaran, kesehatan, catatan, dan pengeluaran.</p>
          </div>
          <div class="landing-choice-list landing-workspace-choices" role="tablist" aria-label="Area personal workspace">
            ${renderTabs(workspaceCopy, 'data-workspace-module', 'doing')}
          </div>
          <article class="landing-workspace-panel" role="tabpanel" aria-live="polite" aria-atomic="true">
            <span data-workspace-name>${currentWorkspace.label}</span>
            <h3 data-workspace-title>${currentWorkspace.title}</h3>
            <p data-workspace-copy>${currentWorkspace.copy}</p>
            <small data-workspace-detail>${currentWorkspace.detail}</small>
          </article>
        </div>
      </section>

      <section class="landing-section landing-ownership" id="ownership" aria-labelledby="ownership-title">
        <div class="landing-ownership-frame landing-image-shell is-loading" data-reveal>
          <img src="/zeno-landing-ownership.webp" width="1600" height="900" alt="Jalur cahaya terpisah di antara panel kaca transparan" loading="lazy" data-landing-image />
          <span class="landing-media-fallback">Visual ownership tidak tersedia.</span>
          <div class="landing-ownership-scrim"></div>
          <div class="landing-ownership-copy">
            <h2 id="ownership-title">Data mengikuti pemiliknya.</h2>
            <p>Hak akses diterapkan pada record dan activity, bukan sekadar disembunyikan dari tampilan.</p>
            <div class="landing-access-switch" role="tablist" aria-label="Tampilan akses">
              ${renderTabs(accessCopy, 'data-access-view', 'user')}
            </div>
            <article class="landing-access-panel" role="tabpanel" aria-live="polite" aria-atomic="true">
              <span data-access-name>${currentAccess.label}</span>
              <h3 data-access-title>${currentAccess.title}</h3>
              <p data-access-copy>${currentAccess.copy}</p>
              <small data-access-detail>${currentAccess.detail}</small>
            </article>
          </div>
        </div>
      </section>

      <section class="landing-section landing-security" aria-labelledby="security-title">
        <div class="landing-security-visual landing-image-shell is-loading" data-reveal>
          <img src="/zeno-landing-security.webp" width="1600" height="900" alt="Inti bercahaya di dalam lapisan kaca pelindung" loading="lazy" data-landing-image />
          <span class="landing-media-fallback">Visual keamanan tidak tersedia.</span>
        </div>
        <div class="landing-security-copy" data-reveal>
          <h2 id="security-title">Akses dimulai dari identitas terverifikasi.</h2>
          <p>Register, verifikasi email, lalu login. Backend menjaga session dan membatasi data sesuai role serta ownership.</p>
          <dl class="landing-security-list">
            <div><dt>Email terverifikasi</dt><dd>Tautan sekali pakai sebelum akun dapat digunakan.</dd></div>
            <div><dt>Session HttpOnly</dt><dd>Cookie tidak tersedia bagi JavaScript di halaman.</dd></div>
            <div><dt>Role-based access</dt><dd>Hak admin dan user diputuskan di server.</dd></div>
            <div><dt>Owner-scoped records</dt><dd>Data personal disaring berdasarkan pemiliknya.</dd></div>
          </dl>
        </div>
      </section>

      <section class="landing-cta landing-image-shell is-loading" aria-labelledby="cta-title" data-reveal>
        <img src="/zeno-landing-cta.webp" width="1600" height="900" alt="Pita cahaya biru menuju horizon yang terang" loading="lazy" data-landing-image />
        <span class="landing-media-fallback">Visual Zeno tidak tersedia.</span>
        <div class="landing-cta-scrim"></div>
        <div class="landing-cta-copy">
          <h2 id="cta-title">Buka Zeno. Lanjutkan pekerjaanmu.</h2>
          <p>Masuk untuk melihat session, aktivitas, dan progres yang tersimpan di workspace.</p>
          <a class="landing-primary-button" href="/login">Masuk ke Zeno</a>
        </div>
      </section>

      <footer class="landing-footer">
        <a class="landing-brand" href="#top" aria-label="Kembali ke atas">
          <img src="/zeno-logo-96.webp" width="36" height="36" alt="" />
          <span><strong>Zeno</strong><small>PERSONAL WORKSPACE</small></span>
        </a>
        <p>Session, activity, dan progres harian dalam satu tempat.</p>
        <a href="/login">Masuk</a>
      </footer>
    </main>
  `;
}

function setSelected<T extends string>(selector: string, key: T) {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    const selected = Object.values(button.dataset).includes(key);
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

function setText(selector: string, value: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (target) target.textContent = value;
}

function updateFeature(key: FeatureKey) {
  const item = featureCopy[key];
  setSelected('[data-feature-tab]', key);
  setText('[data-feature-name]', item.label);
  setText('[data-feature-title]', item.title);
  setText('[data-feature-copy]', item.copy);
  setText('[data-feature-detail]', item.detail);
}

function updateWorkspace(key: WorkspaceKey) {
  const item = workspaceCopy[key];
  setSelected('[data-workspace-module]', key);
  setText('[data-workspace-name]', item.label);
  setText('[data-workspace-title]', item.title);
  setText('[data-workspace-copy]', item.copy);
  setText('[data-workspace-detail]', item.detail);
}

function updateAccess(key: AccessKey) {
  const item = accessCopy[key];
  setSelected('[data-access-view]', key);
  setText('[data-access-name]', item.label);
  setText('[data-access-title]', item.title);
  setText('[data-access-copy]', item.copy);
  setText('[data-access-detail]', item.detail);
}

function bindRovingTabs(selector: string) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  buttons.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + direction + buttons.length) % buttons.length;
    buttons[targetIndex]?.focus();
    buttons[targetIndex]?.click();
  }));
}

function bindLandingImages() {
  document.querySelectorAll<HTMLImageElement>('[data-landing-image]').forEach((image) => {
    const shell = image.closest<HTMLElement>('.landing-image-shell');
    const loaded = () => shell?.classList.replace('is-loading', 'is-loaded');
    const failed = () => {
      shell?.classList.remove('is-loading');
      shell?.classList.add('has-error');
    };
    if (image.complete) {
      image.naturalWidth ? loaded() : failed();
      return;
    }
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

let landingObserver: IntersectionObserver | null = null;

function bindLandingMotion() {
  landingObserver?.disconnect();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('landing-motion-ready', !reduced);
  if (reduced || !('IntersectionObserver' in window)) {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => element.classList.add('is-visible'));
    return;
  }
  landingObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      (entry.target as HTMLElement).classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => landingObserver?.observe(element));

  if (!window.matchMedia('(pointer: fine)').matches) return;
  const media = document.querySelector<HTMLElement>('[data-tilt-media]');
  if (!media) return;
  let frame = 0;
  media.addEventListener('pointermove', (event) => {
    const rect = media.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      media.style.setProperty('--landing-tilt-x', `${(-y * 1.2).toFixed(2)}deg`);
      media.style.setProperty('--landing-tilt-y', `${(x * 1.6).toFixed(2)}deg`);
    });
  });
  media.addEventListener('pointerleave', () => {
    media.style.setProperty('--landing-tilt-x', '0deg');
    media.style.setProperty('--landing-tilt-y', '0deg');
  });
}

export function bindLandingEvents(callbacks: LandingCallbacks) {
  document.querySelector<HTMLButtonElement>('[data-landing-theme]')?.addEventListener('click', callbacks.onThemeToggle);

  const menuButton = document.querySelector<HTMLButtonElement>('[data-landing-menu]');
  const navigation = document.querySelector<HTMLElement>('#landing-navigation');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Tutup navigasi' : 'Buka navigasi');
    navigation?.classList.toggle('is-open', open);
  });
  navigation?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  }));

  document.querySelectorAll<HTMLButtonElement>('[data-feature-tab]').forEach((button) => button.addEventListener('click', () => updateFeature(button.dataset.featureTab as FeatureKey)));
  document.querySelectorAll<HTMLButtonElement>('[data-workspace-module]').forEach((button) => button.addEventListener('click', () => updateWorkspace(button.dataset.workspaceModule as WorkspaceKey)));
  document.querySelectorAll<HTMLButtonElement>('[data-access-view]').forEach((button) => button.addEventListener('click', () => updateAccess(button.dataset.accessView as AccessKey)));

  bindRovingTabs('[data-feature-tab]');
  bindRovingTabs('[data-workspace-module]');
  bindRovingTabs('[data-access-view]');
  bindLandingImages();
  bindLandingMotion();
}
