export type LandingTheme = 'dark' | 'light';

type LandingCallbacks = {
  onThemeToggle: () => void;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]!));

const featureCards = [
  {
    icon: '▤',
    eyebrow: 'SESSION LOG',
    title: 'Baca sinyal yang penting.',
    copy: 'Ringkasan sesi dari sumber Markdown tetap mudah dicari, difilter, dan dibuka sampai detail pertanyaan serta jawabannya.',
    className: 'feature-card-wide',
  },
  {
    icon: '⌁',
    eyebrow: 'ACTIVITY',
    title: 'Setiap perubahan punya jejak.',
    copy: 'Audit trail menampilkan actor, action, dan entity dengan akses yang mengikuti role akun.',
    className: 'feature-card-tall',
  },
  {
    icon: '◫',
    eyebrow: 'CHANGE LOG',
    title: 'Riwayat tidak hilang di antara update.',
    copy: 'Filter berdasarkan hari dan urutkan perubahan terbaru atau terlama.',
    className: 'feature-card-compact',
  },
  {
    icon: '◈',
    eyebrow: 'PERSONAL WORKSPACE',
    title: 'Rencana harian tetap satu konteks.',
    copy: 'Doing, Learning, Workout, Journaling, dan Spending hidup berdampingan dalam satu workspace.',
    className: 'feature-card-compact feature-card-accent',
  },
];

const workspaceAreas = [
  ['Doing', 'Rencanakan task harian dan tandai yang selesai.'],
  ['Learning', 'Catat pembelajaran melalui kalender lintas tahun.'],
  ['Workout', 'Pantau sesi, set, reps, dan durasi latihan.'],
  ['Journaling', 'Tulis dengan editor Markdown dan simpan arsipnya.'],
  ['Spending', 'Lihat total pengeluaran per hari, minggu, bulan, dan tahun.'],
];

export function renderLandingPage(theme: LandingTheme) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeLabel = theme === 'dark' ? 'Light' : 'Dark';
  return `
    <main class="landing-page">
      <header class="landing-nav">
        <a class="landing-brand" href="/" aria-label="Zeno home">
          <span class="landing-brand-mark"><img src="/zeno-logo.png" alt="" /></span>
          <span class="landing-brand-copy"><strong>Zeno</strong><small>PERSONAL WORKSPACE</small></span>
        </a>
        <nav class="landing-nav-links" aria-label="Landing navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#workspace">Workspace</a>
        </nav>
        <div class="landing-nav-actions">
          <button class="landing-theme-toggle" type="button" data-landing-theme aria-label="Ganti ke ${nextTheme} mode"><span>${theme === 'dark' ? '☼' : '☾'}</span><small>${themeLabel}</small></button>
          <a class="landing-login-link" href="/login">Open dashboard <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <section class="landing-hero" aria-labelledby="landing-title">
        <div class="landing-hero-copy landing-reveal">
          <p class="landing-kicker">PERSONAL WORKSPACE / ZENO</p>
          <h1 id="landing-title">Satu workspace. Tetap terlihat.</h1>
          <p class="landing-hero-description">Zeno menyatukan session log, aktivitas, dan progres harian dalam dashboard yang tetap terasa personal.</p>
          <div class="landing-hero-actions">
            <a class="landing-button landing-button-primary" href="/login">Open dashboard <span aria-hidden="true">↗</span></a>
            <a class="landing-button landing-button-quiet" href="#capabilities">See what is inside</a>
          </div>
        </div>
        <div class="landing-hero-visual landing-reveal landing-reveal-delay" aria-label="Zeno workspace signal preview">
          <img src="/zeno-landing-hero.png" alt="Abstract blue activity paths on a dark Zeno background" />
          <div class="landing-signal-panel">
            <div class="landing-signal-header"><span>WORKSPACE SIGNAL</span><strong>CONNECTED</strong></div>
            <div class="landing-signal-flow">
              <div class="landing-signal-node"><span>▤</span><div><strong>Session log</strong><small>Source-backed entries</small></div></div>
              <span class="landing-signal-line" aria-hidden="true"></span>
              <div class="landing-signal-node signal-node-active"><span>⌁</span><div><strong>Activity trail</strong><small>Actor and entity history</small></div></div>
              <span class="landing-signal-line" aria-hidden="true"></span>
              <div class="landing-signal-node"><span>◫</span><div><strong>Daily progress</strong><small>Plans that stay visible</small></div></div>
            </div>
            <div class="landing-signal-footer"><span>One place for work that keeps moving.</span><code>ZEN / 01</code></div>
          </div>
        </div>
      </section>

      <section class="landing-intro" id="capabilities" aria-labelledby="capabilities-title">
        <div class="landing-section-heading landing-reveal">
          <p class="landing-kicker">WHY ZENO</p>
          <h2 id="capabilities-title">A clear view of the work behind the day.</h2>
          <p>Mulai dari data sesi sampai catatan personal, Zeno membantu kamu melihat apa yang terjadi dan apa yang perlu dilakukan berikutnya.</p>
        </div>
        <div class="landing-feature-grid">
          ${featureCards.map((feature, index) => `<article class="landing-feature-card ${feature.className} landing-reveal" style="--landing-delay:${index * 70}ms"><div class="landing-feature-icon" aria-hidden="true">${feature.icon}</div><p class="landing-kicker">${feature.eyebrow}</p><h3>${feature.title}</h3><p>${feature.copy}</p><span class="landing-feature-arrow" aria-hidden="true">↗</span></article>`).join('')}
        </div>
      </section>

      <section class="landing-workspace" id="workspace" aria-labelledby="workspace-title">
        <div class="landing-workspace-copy landing-reveal">
          <p class="landing-kicker">ONE WORKSPACE</p>
          <h2 id="workspace-title">Dari observasi ke tindakan, tanpa pindah konteks.</h2>
          <p>Dashboard Zeno dibuat untuk dipakai berulang kali. Buka satu area saat dibutuhkan, lalu kembali ke ringkasan saat ingin melihat gambaran besarnya.</p>
          <a class="landing-inline-link" href="/login">Open dashboard <span aria-hidden="true">↗</span></a>
        </div>
        <div class="landing-area-list" aria-label="Zeno workspace areas">
          ${workspaceAreas.map(([title, copy], index) => `<div class="landing-area-row landing-reveal" style="--landing-delay:${index * 55}ms"><span class="landing-area-index">0${index + 1}</span><div><strong>${title}</strong><p>${copy}</p></div><span class="landing-area-mark" aria-hidden="true">↗</span></div>`).join('')}
        </div>
      </section>

      <section class="landing-trust" aria-labelledby="trust-title">
        <div class="landing-trust-panel landing-reveal">
          <div class="landing-trust-copy"><p class="landing-kicker">SECURE BY DEFAULT</p><h2 id="trust-title">Workspace pribadi dengan alur akses yang jelas.</h2><p>Register, verifikasi email, lalu login. Session tersimpan melalui cookie HttpOnly dan akses mengikuti role akun.</p></div>
          <div class="landing-trust-list"><span>✓ Email verification</span><span>✓ HttpOnly session</span><span>✓ Role-based access</span><span>✓ Owner-scoped records</span></div>
        </div>
      </section>

      <section class="landing-final-cta" aria-labelledby="cta-title">
        <div class="landing-final-copy landing-reveal"><p class="landing-kicker">READY WHEN YOU ARE</p><h2 id="cta-title">Buka workspace yang sudah bekerja untukmu.</h2><p>Masuk untuk melihat session, aktivitas, dan progres yang tersimpan di Zeno.</p></div>
        <a class="landing-button landing-button-primary landing-final-button" href="/login">Open dashboard <span aria-hidden="true">↗</span></a>
      </section>

      <footer class="landing-footer"><a class="landing-brand" href="/" aria-label="Zeno home"><span class="landing-brand-mark"><img src="/zeno-logo.png" alt="" /></span><span class="landing-brand-copy"><strong>Zeno</strong><small>PERSONAL WORKSPACE</small></span></a><span>Session, activity, and everyday progress.</span></footer>
    </main>
  `;
}

export function bindLandingEvents(callbacks: LandingCallbacks) {
  document.querySelector<HTMLButtonElement>('[data-landing-theme]')?.addEventListener('click', callbacks.onThemeToggle);
}
