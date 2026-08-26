# Zeno Dashboard

Zeno adalah personal workspace untuk mengelola aktivitas harian dalam satu dashboard: Doing, Learning, Workout, Journaling, Spending, Activity, dan Change Log.

Repository ini menggunakan **monorepo** agar perubahan frontend, backend, kontrak API, database schema, dan dokumentasi dapat dirilis secara konsisten.

## Struktur

```text
.
├── backend/                         Go 1.23 REST API + PostgreSQL
├── frontend/                        Vite + TypeScript + Nginx
├── .github/workflows/ci.yml         Backend dan frontend quality gates
├── sesi-hermes-discord-gemini.md    Sumber data session log
├── frontend-design.md               Catatan desain antarmuka
├── CURRICULUM.md                    English Grammar learning path dan review model
└── frontend/src/content/learning/   Manifest dan lesson JSON static prototype
```

## Fitur utama

- Register, verifikasi email, login, logout, dan profile
- Session opaque berbasis database dengan cookie HttpOnly
- Authorization `user` dan `admin`
- Ownership record per user
- Activity audit trail dengan actor dan subject
- Doing, Learning, Workout, Journaling, dan Spending
- Learning Material List dengan English Grammar catalogue PostgreSQL-backed, 20 topic families, A1–C1 seed batches, practice, quiz, review cycle, dan owner-scoped progress
- Workout Material List dengan katalog Mobility JSON tervalidasi dan scheduling ke Workout berdasarkan tanggal
- Immutable journal revision history dengan deliberate edit reasons dan optimistic concurrency
- Ringkasan pengeluaran harian, mingguan, bulanan, dan tahunan
- Dark/light theme dengan branding Zeno
- Font profile UI Compact, Standard, dan Expanded dengan Compact sebagai default

## Prasyarat

- Go 1.23+
- Node.js 22+
- PostgreSQL 16+
- Docker dan Docker Compose untuk deployment frontend lokal

## Menjalankan backend

```bash
cp backend/.env.example backend/.env
# Isi DATABASE_URL dan konfigurasi lokal tanpa meng-commit backend/.env
cd backend
make test
make build
make run
```

Backend tersedia di `http://localhost:3000`; health endpoint berada di `http://localhost:3000/api/health`.

## Menjalankan frontend

Development mode:

```bash
cd frontend
npm ci
npm run dev
```

Production container:

```bash
cd frontend
docker compose up --build -d
```

Frontend tersedia di `http://localhost:8080` dan meneruskan `/api` ke backend lokal.

Learning Material List memakai route client-side tanpa router dependency tambahan:
`/learning/materials` → `/learning/materials/english` → `/learning/materials/english/grammar` → `/learning/materials/english/grammar/:topicId`.
Runtime catalogue dibaca dari `GET /api/learning-materials` dan `GET /api/learning-materials/:id`; `PUT /api/learning-materials/:id/progress` menyimpan snapshot mastery/review per user. Seed version-controlled berada di `backend/internal/learningseed/` dan dijalankan secara transactional dengan `make seed-learning` setelah schema tersedia. Frontend lesson JSON lama tetap menjadi arsip authoring/prototype, bukan runtime source.

Workout Material List memakai route client-side yang tetap mempertahankan Workout sebagai halaman aktif:
`/workout/materials` → `/workout/materials/mobility` → `/workout/materials/mobility/:movementId`.
Tanggal terpilih dipertahankan lewat `?date=YYYY-MM-DD`; scheduling membuat Workout entry baru dengan optional `materialId` tanpa menggandakan definisi material ke PostgreSQL.

## Quality gates

Backend:

```bash
cd backend
go fmt ./...
go vet ./...
go test -count=1 ./...
go build -trimpath -o bin/api ./cmd/api
```

Frontend:

```bash
cd frontend
npm ci
npm test
npm run build
npm audit --omit=dev
```

GitHub Actions menjalankan test backend dengan PostgreSQL, frontend production build, dan Docker image build pada setiap push dan pull request.

## Konfigurasi dan keamanan

- Jangan commit `.env`, token, password, private key, database URL, email outbox, atau session data.
- Gunakan `backend/.env.example` sebagai template konfigurasi.
- Untuk production HTTPS, aktifkan `COOKIE_SECURE=true`.
- Credential deployment disimpan sebagai GitHub Actions Secrets, bukan di source code.

## Branching

- `main`: branch stabil dan deployable
- `feature/<nama>`: pengembangan fitur
- `fix/<nama>`: perbaikan bug

Sebelum merge, pastikan seluruh CI checks lulus.
