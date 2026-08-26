export type ChangeLogUpdate = {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  category: 'Frontend' | 'Backend' | 'DevOps' | 'Hermes' | 'General';
};

// Tambahkan satu entri untuk setiap permintaan perubahan yang selesai diterapkan.
// Gunakan timestamp ISO dengan zona waktu agar sorting dan filter tanggal tetap akurat.
export const changeLogUpdates: ChangeLogUpdate[] = [
  {
    id: '2026-08-22-change-log-time-groups',
    occurredAt: '2026-08-22T23:54:16+07:00',
    title: 'Pembagian waktu dan tab baru pada Change Log',
    description: 'Menambahkan tab Session Entries dan Log Update dengan layout responsif. Setiap update kini dicatat per tanggal, dapat diurutkan, serta difilter berdasarkan Hari ini, Kemarin, Minggu ini, dan Lebih lama.',
    category: 'Frontend',
  },
  {
    id: '2026-08-23-remove-session-entries-tab',
    occurredAt: '2026-08-23T00:28:50+07:00',
    title: 'Change Log langsung menampilkan Log Update',
    description: 'Menghapus tab Session Entries beserta navigasi tab. Halaman Change Log kini langsung menampilkan daftar Log Update, filter waktu, dan pengurutan.',
    category: 'Frontend',
  },
  {
    id: '2026-08-23-go-postgres-swagger-backend',
    occurredAt: '2026-08-23T00:39:40+07:00',
    title: 'Backend Go, PostgreSQL, dan Swagger siap digunakan',
    description: 'Mengganti backend Node.js menjadi Go dengan struktur ringkas, mempertahankan kontrak API dashboard, mengaktifkan migrasi otomatis dan persistence PostgreSQL lokal, serta menyediakan OpenAPI 3.0.3 dan Swagger UI. Test, build, health check, CRUD API, pembacaan database, dan render Swagger telah diverifikasi berhasil.',
    category: 'Backend',
  },
  {
    id: '2026-08-23-session-dashboard-learning-update',
    occurredAt: '2026-08-23T00:44:17+07:00',
    title: 'Pembaruan lengkap dashboard dan Learning Journal',
    description: 'Merangkum pembaruan sesi ini: dark/light mode, sidebar modern dan konsisten, route URL per halaman, koneksi frontend ke API Go/PostgreSQL, kalender Learning lintas tahun, tambah/edit/delete/checklist, tiga item dengan internal scroll yang mempertahankan posisi, icon action, popover konfirmasi delete, dropdown sesuai tema, serta penanda kalender berbeda untuk task in progress dan seluruh task selesai.',
    category: 'General',
  },
  {
    id: '2026-08-23-change-log-postgres-api',
    occurredAt: '2026-08-23T00:59:14+07:00',
    title: 'Change Log dipersist ke PostgreSQL',
    description: 'Menambahkan tabel Change Log, endpoint GET dan POST pada backend Go, migrasi entri existing, serta integrasi frontend agar membaca data dari API dengan fallback lokal saat backend tidak tersedia.',
    category: 'Backend',
  },
  {
    id: '2026-08-23-lifestyle-pages',
    occurredAt: '2026-08-23T01:14:29+07:00',
    title: 'Workout, Journaling, dan Spending tersedia',
    description: 'Menambahkan tiga page bergaya Learning yang terhubung ke PostgreSQL: kalender dan checklist Workout, Journaling dengan tab Arsip serta Ruang Tulis berfitur Markdown, autosave draft, live preview, toolbar, shortcut, dan mode fokus, serta Spending dengan ledger dan ringkasan total harian, mingguan, bulanan, dan tahunan.',
    category: 'General',
  },
  {
    id: '2026-08-23-calendar-unfinished-badges',
    occurredAt: '2026-08-23T02:35:19+07:00',
    title: 'Badge kalender menghitung task yang belum selesai',
    description: 'Mengubah badge angka pada kalender Learning dan Workout agar menampilkan jumlah task unfinished, bukan jumlah seluruh task. Jika hanya satu task belum selesai, badge kini menampilkan 1; hari yang seluruh task-nya selesai tetap menggunakan tanda centang.',
    category: 'Frontend',
  },
  {
    id: '2026-08-23-doing-page',
    occurredAt: '2026-08-23T11:35:17+07:00',
    title: 'Page Doing tersedia di atas Learning',
    description: 'Menambahkan page Doing dengan kalender lintas bulan dan tahun, task per tanggal, unfinished badge, tambah, edit, delete, checklist, scroll preservation, route /doing, serta persistence PostgreSQL melalui API Go. Item Doing ditempatkan tepat di atas Learning pada sidebar.',
    category: 'General',
  },
  {
    id: '2026-08-23-zeno-rebrand',
    occurredAt: '2026-08-23T12:06:02+07:00',
    title: 'Project berganti nama menjadi Zeno',
    description: 'Mengganti branding project dari Hermes menjadi Zeno pada UI, metadata, API, dokumentasi, package, dan Docker. Logo Z dari pengguna kini digunakan pada sidebar, favicon multi-size, Apple touch icon, dan web app manifest.',
    category: 'General',
  },
  {
    id: '2026-08-23-zeno-color-system',
    occurredAt: '2026-08-23T12:23:35+07:00',
    title: 'Nuansa warna Zeno diterapkan pada dark dan light mode',
    description: 'Menerapkan palet Z Navy, Z Blue, Z Cyan, dan Z White sebagai token source-of-truth. Surface, border, teks, CTA, selected navigation, kalender, status, focus glow, serta komponen Workout, Journaling, dan Spending kini konsisten dalam dark dan light mode tanpa aksen purple legacy.',
    category: 'Frontend',
  },
  {
    id: '2026-08-23-auth-activity-ownership',
    occurredAt: '2026-08-23T13:49:10+07:00',
    title: 'Authentication, authorization, profile, dan user activity tersedia',
    description: 'Menambahkan register email/password, email verification sekali pakai, login, logout, profile, bcrypt password, opaque HttpOnly session, rate limiting, origin check, role admin/user, ownership record, dan Activity audit berbasis actor/action/entity. Admin melihat seluruh activity dan record; user biasa hanya miliknya. Email mendukung Resend, SMTP, dan file outbox development.',
    category: 'General',
  },
  {
    id: '2026-08-24-git-monorepo-ci',
    occurredAt: '2026-08-24T10:59:15+07:00',
    title: 'Git monorepo dan CI GitHub tersedia',
    description: 'Menginisialisasi Zeno sebagai satu monorepo pada branch main, menghubungkannya ke Rama-z/zeno-dashboard, menambahkan ignore rules untuk secret dan runtime artifact, dokumentasi root, serta GitHub Actions untuk format, vet, test PostgreSQL, build backend, build frontend, dan build Docker. Initial push, fresh clone, secret scan, dan CI pertama telah diverifikasi berhasil.',
    category: 'DevOps',
  },
  {
    id: '2026-08-24-dashboard-compact-redesign',
    occurredAt: '2026-08-24T13:02:56+07:00',
    title: 'Dashboard overview dipadatkan dengan visual Zeno',
    description: 'Merapikan shell dashboard, memperlebar area konten, memadatkan spacing heading, metric, toolbar, dan row session, serta menjaga state expand, filter, sidebar, responsive layout, dan dark/light mode.',
    category: 'Frontend',
  },
  {
    id: '2026-08-24-landing-page-v2',
    occurredAt: '2026-08-24T13:53:50+07:00',
    title: 'Landing page V2 Zeno tersedia',
    description: 'Menambahkan landing publik kreatif dan interaktif di root untuk pengunjung anonim, enam aset visual Zeno teroptimasi, observability tabs, personal workspace selector, ownership switch, dual theme, responsive mobile navigation, reduced motion, self-hosted fonts, serta CTA ke login tanpa mengubah route dashboard pengguna terautentikasi.',
    category: 'Frontend',
  },
  {
    id: '2026-08-24-dashboard-precision-redesign',
    occurredAt: '2026-08-24T16:02:37+07:00',
    title: 'Dashboard Zeno memakai precision redesign',
    description: 'Meredesain seluruh shell dashboard dengan Outfit dan Phosphor Icons, grouped navigation Observe, Personal, dan Account, floating sidebar serta topbar, asymmetric metrics, session rows yang lebih padat, global search yang berfungsi, skip link, shared premium surfaces, responsive collapsed rail, dark/light parity, dan reduced motion tanpa mengubah route maupun behavior data.',
    category: 'Frontend',
  },
  {
    id: '2026-08-26-journal-revision-history',
    occurredAt: '2026-08-26T00:17:04+07:00',
    title: 'Riwayat revisi Journaling Zeno tersedia',
    description: 'Menambahkan deliberate edit dengan empat reason code stabil, immutable journal revisions, lazy newest-first history, navigasi swipe/pointer/keyboard yang accessible, optimistic concurrency, audit metadata tanpa isi jurnal, dan cascade delete untuk seluruh revisi.',
    category: 'Frontend',
  },
  {
    id: '2026-08-26-learning-material-foundation',
    occurredAt: '2026-08-26T01:08:31+07:00',
    title: 'Fondasi Learning Material List tersedia',
    description: 'Menyusun kurikulum English Grammar A1–C1 berbasis riset British Council, BBC, Cambridge, Oxford, dan CEFR; menambahkan empat lesson JSON representatif lintas level; serta menyiapkan implementation brief mandiri untuk Luna tanpa membangun UI, adaptive engine, CMS, atau schema progress penuh.',
    category: 'General',
  },
  {
    id: '2026-08-26-learning-material-list',
    occurredAt: '2026-08-26T09:58:49+07:00',
    title: 'Learning Material List prototype tersedia',
    description: 'Menambahkan route nested tanpa router dependency, catalogue English Grammar dari manifest JSON, empat lesson static lintas level, halaman Concept sampai Review, practice dan objective-aware quiz dengan feedback, filter topic, validasi konten build-time, dan label prototype bahwa progress belum disimpan.',
    category: 'Frontend',
  },
  {
    id: '2026-08-26-font-profile-preferences',
    occurredAt: '2026-08-26T10:35:05+07:00',
    title: 'Pilihan font profile tersedia di UI',
    description: 'Menambahkan pengaturan tipografi Compact, Standard, dan Expanded di Appearance. Compact mempertahankan kepadatan saat ini sebagai default; pilihan disimpan di browser dan diterapkan ke ukuran heading, ukuran teks, line-height, dan letter-spacing dashboard.',
    category: 'Frontend',
  },
  {
    id: '2026-08-26-workout-material-list',
    occurredAt: '2026-08-26T14:11:22+07:00',
    title: 'Workout Material List Mobility tersedia',
    description: 'Menambahkan katalog Mobility JSON tervalidasi dengan enam movement detail, route nested di bawah Workout, scheduling berbasis tanggal, preservasi selected date, serta provenance materialId yang tetap immutable pada Workout entry tanpa menggandakan definisi katalog ke PostgreSQL.',
    category: 'Frontend',
  },
  {
    id: '2026-08-26-learning-material-database-expansion',
    occurredAt: '2026-08-26T17:38:10+07:00',
    title: 'English Learning Materials berpindah ke PostgreSQL',
    description: 'Menambahkan learning_materials dan owner-scoped learning_topic_progress, validator seed transactional dengan 20 topic families dan 100 matrix cells, 19 lesson A1 produktif plus Passive/A1 awareness metadata, serta upgrade empat lesson existing tanpa mengubah ID route. Runtime kini memakai endpoint catalogue/detail/progress PostgreSQL; practice, quiz, mastery, review, filter level/topic, published-only state, content version, ownership, OpenAPI, integration tests, production build, Docker health, served routes, dan authenticated API round-trip telah diverifikasi.',
    category: 'Backend',
  },
  {
    id: '2026-08-26-learning-material-a2-batch',
    occurredAt: '2026-08-26T18:53:18+07:00',
    title: 'English Grammar A2 batch tersedia',
    description: 'Mempublikasikan 19 lesson A2 baru dengan rules/pattern, examples bervariasi, common mistakes, practice, objective-aligned quiz, mastery, dan review. Lesson A2 tenses existing tetap dipertahankan; seluruh 20 keluarga A2 kini tersedia di PostgreSQL. Seeder dijalankan dua kali secara idempotent, lalu catalogue, detail, progress owner-scope, test, build, dan deployment verification kembali berhasil.',
    category: 'Backend',
  },
  {
    id: '2026-08-26-learning-material-b1-batch',
    occurredAt: '2026-08-26T19:06:30+07:00',
    title: 'English Grammar B1 batch tersedia',
    description: 'Mempublikasikan 18 lesson B1 baru untuk melengkapi Modals, Passive, Word order, Questions, Negation, Clauses, Articles, Countability, Determiners, Pronouns, Gerunds, Infinitives, Participles, Reported speech, Relative clauses, Conjunctions, Prepositions, dan Comparison. Dua lesson B1 existing tetap dipertahankan; seluruh 20 keluarga B1 kini tersedia di PostgreSQL. Seed, integration test, authenticated detail/progress round-trip, build, dan Docker verification berhasil.',
    category: 'Backend',
  },
  {
    id: '2026-08-26-learning-material-b2-batch',
    occurredAt: '2026-08-26T19:24:30+07:00',
    title: 'English Grammar B2 batch tersedia',
    description: 'Mempublikasikan 20 lesson B2 baru untuk seluruh topic family, termasuk perfect tenses, perfect modals, passive voice lanjutan, third conditional, emphatic word order, complex questions, negative prefixes, reduced relatives, participle clauses, reporting patterns, complex prepositions, dan comparison. Seed idempotent, validator, PostgreSQL integration, authenticated B2 detail/progress round-trip, build, dan Docker verification berhasil.',
    category: 'Backend',
  },
  {
    id: '2026-08-26-learning-material-c1-batch',
    occurredAt: '2026-08-26T19:38:22+07:00',
    title: 'English Grammar C1 batch tersedia',
    description: 'Mempublikasikan 19 lesson C1 baru untuk melengkapi tense nuance, hedging, impersonal passive, mixed conditionals, rhetorical questions, negative inversion, compressed clauses, stylistic articles, nuanced countability, cohesion, advanced gerunds/infinitives/participles, stance reporting, embedded relatives, discourse linking, idiomatic prepositions, dan rhetorical comparison. Lesson word-order C1 existing tetap dipertahankan; seluruh 20 keluarga C1 kini tersedia di PostgreSQL. Seed, integration, authenticated C1 detail/progress round-trip, build, dan Docker verification berhasil.',
    category: 'Backend',
  },
];
