# Zeno

Dashboard monitoring dan personal workspace Zeno untuk data sesi dari file Markdown di folder parent.

Dashboard hanya dapat dibuka setelah register, verifikasi email, dan login. UI auth tersedia di `/register`, `/verify-email`, dan `/login`; profile dan logout tersedia di `/profile`.

## Jalankan dengan Docker Compose

```bash
docker compose up --build -d
```

Buka:

```text
http://localhost:8080
```

Hentikan container:

```bash
docker compose down
```

## Jalankan dengan Docker CLI

```bash
docker build -f Dockerfile -t zeno ..
docker run --rm -p 8080:80 zeno
```

## Update data log

Data Markdown diproses pada saat image dibuild. Setelah file berikut berubah:

```text
../sesi-hermes-discord-gemini.md
```

build ulang image:

```bash
docker compose up --build -d
```
