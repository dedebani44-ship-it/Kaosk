# Kaosk Social Downloader

Web downloader sederhana untuk TikTok dan YouTube. Aplikasi ini dapat mengambil metadata konten dan mengalirkan unduhan sebagai video MP4 atau audio MP3 dengan bantuan `yt-dlp`.

> Gunakan hanya untuk konten milik Anda, konten bebas lisensi, atau konten yang Anda punya izin untuk unduh. Patuhi hak cipta dan ketentuan layanan platform.

## Fitur

- UI web responsif berbahasa Indonesia.
- Mendukung URL TikTok dan YouTube.
- Tombol unduh video MP4 dan musik MP3.
- Endpoint metadata untuk melihat judul, uploader, durasi, thumbnail, dan format yang tersedia.
- Tanpa dependency npm eksternal; server memakai modul bawaan Node.js.

## Kebutuhan

- Node.js 18 atau lebih baru.
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) tersedia di `PATH`.
- `ffmpeg` untuk merge video/audio dan konversi MP3.

Jika binary `yt-dlp` tidak ada di `PATH`, set environment variable:

```bash
YTDLP_BIN=/path/to/yt-dlp npm start
```

## Menjalankan

```bash
npm start
```

Buka `http://localhost:3000`.

## API

### `GET /api/info?url=<url>`

Mengembalikan metadata konten TikTok/YouTube dalam JSON.

### `GET /api/download?type=video&url=<url>`

Mengunduh kualitas video terbaik sebagai MP4.

### `GET /api/download?type=audio&url=<url>`

Mengunduh audio terbaik sebagai MP3.
