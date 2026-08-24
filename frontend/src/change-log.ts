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
];
