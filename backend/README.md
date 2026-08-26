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
- `GET`, `POST /api/doing`
- `PUT`, `DELETE /api/doing/{id}`
- `GET`, `POST /api/workouts` (scheduled catalog entries may include optional stable `materialId`)
- `PUT`, `DELETE /api/workouts/{id}` (updates preserve `materialId`)
- `GET`, `POST /api/journals`
- `GET`, `POST /api/journals/{id}/revisions`
- `DELETE /api/journals/{id}`
- `GET`, `POST /api/spending`
- `DELETE /api/spending/{id}`
- `GET`, `POST /api/change-logs`

`/api/learning` adalah Learning Journal berbasis tanggal dan tetap terpisah dari Learning Materials. Learning Materials memakai seed JSON version-controlled sebagai input deployment, tetapi runtime list/detail/practice policy dibaca dari PostgreSQL. Seeder memvalidasi 20 topic families, 100 matrix cells, projected metadata, prerequisite/revisit graph, exercise IDs, examples, mastery, dan review sebelum satu transaksi upsert. Seeder tidak menghapus row database yang tidak dikenal atau `learning_topic_progress`, dan hanya mengganti row ketika `content_version` seed lebih baru.

Journaling menyimpan `journal_entries` sebagai logical parent/latest snapshot dan `journal_revisions` sebagai immutable complete snapshot. `POST /api/journals/{id}/revisions` membutuhkan `baseRevisionNumber` dan salah satu reason code `typo`, `clarify`, `incorrect_information`, atau `changed_my_mind`; stale base mengembalikan `409`. History dikembalikan newest-first secara lazy dan penghapusan parent menghapus semua revisions melalui FK cascade. Activity append hanya menyimpan `revisionNumber` dan `editReason`, bukan isi jurnal.

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
