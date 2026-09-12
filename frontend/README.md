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

## Preview landing Zeno Playground (tanpa deployment)

Dari folder `frontend`, gunakan Node.js 22.12+ atau 24+:

```bash
npm ci
npm run build
npm test
npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

Buka `http://localhost:4173/`. Preview ini melayani hasil build lokal; tidak membangun ulang container dan tidak mengubah deployment pada port 8080. Backend tidak diperlukan untuk mencoba landing. Route `/login` tetap membuka UI login, tetapi autentikasi nyata memerlukan integrasi API existing.

Demo ditandai **Demo · Data contoh**. Checklist dan jurnal hanya disimpan di memori selama halaman terbuka, termasuk saat berpindah tab dan tema. Reload mengembalikan data contoh; tidak ada request penyimpanan ke backend.

Checklist audit manual:
- Periksa light/dark mode dan lebar 360, 390, 768, 1024, serta 1440 piksel.
- Coba kelima tab workspace, centang Doing, edit Journaling, lalu kembali ke keduanya.
- Spending menjumlahkan Rp28.000, Rp89.000, dan Rp35.000 dari data contoh.
- Gunakan Tab, tombol panah, Home/End; Escape menutup navigasi mobile.
- Coba Jeda/Lanjutkan animasi dan ubah preferensi reduced motion saat halaman terbuka.
- Ikuti anchor Workspace/Kenapa Zeno?, pemilih informasi/role, dan tautan Masuk.

`npm test` mencakup kontrak integrasi serta tes DOM dengan jsdom (dependency development saja). Pengujian browser terpisah diperlukan untuk geometri, animasi aktual, dan audit visual.

## Update data log

Data Markdown diproses pada saat image dibuild. Setelah file berikut berubah:

```text
../sesi-hermes-discord-gemini.md
```

build ulang image:

```bash
docker compose up --build -d
```
