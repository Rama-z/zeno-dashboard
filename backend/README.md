# Zeno Backend (Go)

Backend Go yang menyediakan API untuk frontend Zeno, menyimpan settings, Doing, Learning, Workout, Journaling, Spending, dan Change Log di PostgreSQL, serta menyediakan Swagger UI.

## Struktur

```text
cmd/api/              entrypoint HTTP server
internal/api/         router, handler, Swagger/OpenAPI
internal/model/       kontrak data
internal/source/      parser Markdown session log
internal/store/       PostgreSQL repository + migrasi otomatis
internal/learningseed/ embedded English Grammar catalogue + validator
cmd/seed-learning/    transactional non-destructive catalogue seeder
```

## Menjalankan

Konfigurasi lokal disimpan di `.env` dan tidak masuk Git.

```bash
cd ~/Documents/monitoring/backend
make test
make build
make run

# Setelah schema tersedia, seed catalogue secara eksplisit.
make seed-learning
```

Akses:

- API: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- Swagger UI: `http://localhost:3000/swagger/`
- OpenAPI spec: `http://localhost:3000/openapi.yaml`

Saat startup, backend menguji koneksi PostgreSQL dan otomatis membuat tabel/index yang diperlukan.

## Endpoint utama

- `GET /api/health`
- `GET /api/overview?status=all|success|info&query=`
- `GET /api/logs`
- `GET /api/logs/{id}`
- `GET /api/activity`
- `GET`, `PUT /api/settings`
- `GET`, `POST /api/learning`
- `PUT`, `DELETE /api/learning/{id}`
- `GET /api/learning-materials?subjectId=&categoryId=&level=`
- `GET /api/learning-materials/{id}`
- `PUT /api/learning-materials/{id}/progress`
- `GET`, `POST /api/doing/tasks`; `GET`, `PUT`, `DELETE /api/doing/tasks/{id}` (Complete Workspace)
- `GET`, `POST /api/doing` (legacy Overview)
- `PUT`, `DELETE /api/doing/{id}` (legacy Overview)
- `GET`, `POST /api/workouts` (kontrak legacy; scheduled catalog entries dapat memiliki `materialId` stabil)
- `PUT`, `DELETE /api/workouts/{id}` (kontrak legacy yang mempertahankan `materialId`)
- `GET`, `POST /api/workout-sessions`
- `PUT`, `DELETE /api/workout-sessions/{id}`
- `GET`, `POST /api/workout-templates`
- `GET`, `POST /api/journals`
- `GET`, `POST /api/journals/{id}/revisions`
- `DELETE /api/journals/{id}`
- `GET`, `POST /api/spending`
- `DELETE /api/spending/{id}`
- `GET`, `POST /api/change-logs`

`/api/learning` adalah Learning Journal berbasis tanggal dan tetap terpisah dari Learning Materials. Learning Materials memakai seed JSON version-controlled sebagai input deployment, tetapi runtime list/detail/practice policy dibaca dari PostgreSQL. Seeder memvalidasi 20 topic families, 100 matrix cells, projected metadata, prerequisite/revisit graph, exercise IDs, examples, mastery, dan review sebelum satu transaksi upsert. Seeder tidak menghapus row database yang tidak dikenal atau `learning_topic_progress`, dan hanya mengganti row ketika `content_version` seed lebih baru.

Journaling menyimpan `journal_entries` sebagai logical parent/latest snapshot dan `journal_revisions` sebagai immutable complete snapshot. `POST /api/journals/{id}/revisions` membutuhkan `baseRevisionNumber` dan salah satu reason code `typo`, `clarify`, `incorrect_information`, atau `changed_my_mind`; stale base mengembalikan `409`. History dikembalikan newest-first secara lazy dan penghapusan parent menghapus semua revisions melalui FK cascade. Activity append hanya menyimpan `revisionNumber` dan `editReason`, bukan isi jurnal.

## Complete Workspace Doing contract

`POST /api/doing/tasks` and `PUT /api/doing/tasks/{id}` accept exactly 23 flat camelCase fields: `title`, `area`, `project`, `type`, `status`, `priority`, `urgency`, `impact`, `effort`, `energy`, `focus`, `duration`, `context`, `device`, `location`, `timePreference`, `difficulty`, `resistance`, `due`, `nextAction`, `definitionOfDone`, `plannedDate`, `notes`. The name is **title**, not task. Exact enumerations are in `internal/api/openapi.yaml` and mirror the approved preview. `title`, `project`, `nextAction`, and a non-empty `definitionOfDone` are required for newly created tasks (length caps 160/160/500 and 100 items); on edits of migrated legacy rows, unchanged historical blanks and unknown area labels are permitted without inventing values. `notes` preserves multiline whitespace (20,000 Unicode code points maximum). `due` and `plannedDate` are independent nullable ISO calendar dates. `duration` input is `{ "minMinutes": 60, "maxMinutes": 120 }` (integer 1 <= min <= max <= 240); response adds the server-derived `label` such as `1–2 hours`. The preview's four ranges correspond to (15,30), (30,60), (60,120), (120,240).

`definitionOfDone` is an ordered array of `{id, text, done}`: omit `id` for a new criterion; server issues a UUID. On update, existing IDs must belong to the same task; send them in the desired order, omit deleted items, and omit ID for additions. Checklist completion does **not** change task status. Unknown and response-only fields (`id`, `ownerUserId`, `createdAt`, `updatedAt`, `legacyMetadata`, `duration.label`) are rejected in input. GET list returns `{ "entries": [...] }`; detail/POST/PUT return a task including ID, owner, timestamps. Session auth applies to all; POST/PUT/DELETE require double-submit CSRF and valid origin. Foreign task IDs return 404. Admin can access all tasks.

Persistence is additive on the existing `doing_entries` row (JSONB `workspace_data`, `workspace_updated_at`), **not** a second table. New tasks project title/status/priority/area/project/notes/duration estimate/planned date to legacy columns atomically, so existing Overview reads them; unscheduled tasks have NULL `doing_date` rather than using Due as a schedule. Legacy rows retain their ID, ownership, original columns and nullable dates; startup backfills only missing workspace projections idempotently. Mapping: `title→title`, `category→area` (raw arbitrary label retained), `project→project`, status `todo/doing/blocked/done→Ready/In progress/Blocked/Done`, priority `high/medium/low→P1/P2/P3`, `energy_focus deep/medium/light→focus Deep/Moderate/Light` (**never** energy), `estimated_minutes→duration` bounded to 240, `doing_date→plannedDate`, `note→notes`. Unmapped fields stay empty/null, including Due, Energy, Next Action, and Definition of Done; `legacyMetadata` exposes original date/category/goalOutcome/time blocks/actual minutes/dependencies/carryOver/progress/completed. Historical `goal_outcome` is never interpreted as Next Action or a completion criterion. Editing from either API keeps shared title/status/priority/area/project/notes/duration estimate synchronized; original legacy-only columns remain intact on workspace edit. Legacy Overview writes to a row whose Notes exceed its historical 2,000-code-point limit are rejected with an actionable 400 directing the caller to the workspace endpoint, instead of truncating the content.

Run integration against an isolated test PostgreSQL schema only: `TEST_DATABASE_URL='<isolated DSN with search_path>' /usr/local/go/bin/go test -count=1 ./...`. Never use a production DSN for the test suite or startup migration without release authorization.

### Backup dan rollback Doing
Sebelum startup versi baru, ambil backup PostgreSQL custom-format dengan `pg_dump --format=custom --file=<lokasi-aman-di-luar-repo> "$DATABASE_URL"` dan simpan dengan izin file terbatas. Migrasi hanya menambah `workspace_data`/`workspace_updated_at`, memperbolehkan `doing_date` kosong, serta memperlebar `note` sampai 20.000 karakter; kolom legacy tidak dihapus. Untuk rollback aplikasi, hentikan penulisan, hentikan API, pasang ulang binary/frontend versi sebelumnya, lalu jalankan kembali setelah mengecek versi lama bisa membaca data. **Jangan** otomatis menjatuhkan kolom atau mempersempit `note`: nilai lebih dari 2.000 karakter dan `doing_date` NULL dari task baru tidak kompatibel dengan batas lama. Bila rollback schema/data benar-benar diperlukan, pulihkan backup yang diambil sebelum migrasi ke database terpisah dahulu, audit perbedaan record sejak backup, lalu lakukan rekonsiliasi terencana; restore langsung ke database produksi akan menghapus perubahan setelah backup.

## Manual Learning: material maintenance and transfers

Manual Learning uses an explicit SQL access scope: regular accounts list/read/write only their own modules, materials/files, and sessions; a foreign/missing ID returns 404. Admins list and manage all owners' modules, sessions, materials, and files (including uploads/downloads), while new modules belong to the authenticated creator. A newly created session belongs to its selected module's owner, even when an admin creates it. Updates never change module/session ownership, and a session cannot be moved to a module owned by another user, even by an admin. The HTTP handler derives the global scope only from the authenticated admin role; an empty owner ID is not an access bypass. Material deletion still returns 409 if referenced by any session. Normal write validation and CSRF rules apply equally to admins. `PUT /api/learning-modules/{id}/materials/{materialId}` accepts a full JSON metadata replacement, e.g. `{"type":"text","title":"Chapter 2","body":"Revised notes","url":"","sortOrder":3}`. `type` is required and immutable. For `youtube` and `link`, supply an HTTP(S) `url` (YouTube must have an approved YouTube hostname); for `pdf`/`video`, change `title`/`sortOrder` here, and use `POST /api/learning-modules/{id}/materials/{materialId}/file` with multipart `file` to replace the file without changing its type. File metadata is server-managed; PUT ignores client file fields. `sortOrder` is 0–100000; ties sort by ID. PUT returns 200 with the material, 400 on invalid fields/type change, or 404 when missing/foreign. `DELETE` on the same material route returns 204 and cascades its file, 404 when missing/foreign, and 409 while **any** session `plannedItems` or `actualItems` references that material. Session material validation and deletion use transactional row locks to prevent a concurrent insert/update from slipping through the reference check. Unsafe writes require CSRF.

HTTP server accepts only headers within 5 seconds and idle connections for 60 seconds. Whole-request Go `ReadTimeout`/`WriteTimeout` are disabled because the old 15s/30s limits prematurely cut off 100 MiB uploads/downloads. A response-controller middleware instead caps normal request read/write at 2 minutes, and material upload read/write or file download write at 15 minutes; upload bodies are capped at 101 MiB multipart and validated as PDF <=20 MiB or MP4/WebM <=100 MiB. This bounds slow-body/slow-reader connections without a global timeout regression. An upstream reverse proxy must permit these transfer durations and body sizes too; slow connections below ~117 KiB/s may time out at 15 minutes.

## Authentication dan authorization
- Dashboard API mewajibkan session user yang emailnya sudah terverifikasi.
- Password disimpan menggunakan bcrypt; password mentah tidak pernah disimpan.
- Verification token dan session token bersifat opaque; database hanya menyimpan SHA-256 hash.
- Session dikirim melalui cookie `HttpOnly`, `SameSite=Strict`, dan dapat diaktifkan `Secure` melalui konfigurasi.
- Unsafe authenticated requests memerlukan double-submit CSRF token yang terikat pada session serta exact-origin validation.
- Endpoint JSON menolak Content-Type selain `application/json` dan trailing JSON payload.
- User biasa hanya melihat dan mengubah record miliknya. Admin dapat melihat dan mengelola semua record.
- Activity menyimpan actor dan subject secara terpisah. User melihat event yang dibuatnya atau memengaruhi record miliknya; admin melihat seluruh audit workspace.
- Record lama tanpa owner hanya terlihat oleh admin.

Endpoint auth:

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `PUT /api/profile`

## Konfigurasi email

Pilih salah satu provider melalui `.env`. Jangan commit credential.

### Resend

```env
MAIL_PROVIDER=resend
RESEND_API_KEY=...
RESEND_FROM=Zeno <verify@domain-yang-sudah-diverifikasi.example>
APP_BASE_URL=https://zeno.example.com
ALLOWED_ORIGIN=https://zeno.example.com
COOKIE_SECURE=true
ADMIN_EMAILS=admin@example.com
```

### SMTP free-tier / STARTTLS

```env
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.provider.example
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM=Zeno <verify@example.com>
```

### Development file outbox

```env
MAIL_PROVIDER=file
MAIL_FILE_DIR=./data/mail-outbox
```

Mode `file` hanya untuk development dan menulis email verifikasi sebagai file `.eml`. Deployment saat ini memakai mode ini karena credential Resend/SMTP belum dikonfigurasi.

SMTP provider wajib mendukung STARTTLS dengan minimum TLS 1.2. Schema startup dilindungi PostgreSQL advisory lock dan dicatat pada tabel `schema_migrations`.
