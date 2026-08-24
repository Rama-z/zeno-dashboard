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
└── frontend-design.md               Catatan desain antarmuka
```

## Fitur utama

- Register, verifikasi email, login, logout, dan profile
- Session opaque berbasis database dengan cookie HttpOnly
- Authorization `user` dan `admin`
- Ownership record per user
- Activity audit trail dengan actor dan subject
- Doing, Learning, Workout, Journaling, dan Spending
- Ringkasan pengeluaran harian, mingguan, bulanan, dan tahunan
- Dark/light theme dengan branding Zeno

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
npm run build
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
