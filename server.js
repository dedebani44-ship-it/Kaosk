const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

const SUPPORTED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'm.tiktok.com'
];

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function isSupportedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    return SUPPORTED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch (error) {
    return false;
  }
}

function runYtDlp(args, res, options = {}) {
  const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  child.on('error', (error) => {
    if (!res.headersSent) {
      const message = error.code === 'ENOENT'
        ? 'yt-dlp belum terpasang. Install yt-dlp dan pastikan tersedia di PATH, atau set environment variable YTDLP_BIN.'
        : error.message;
      sendJson(res, 500, { error: message });
    } else {
      res.destroy(error);
    }
  });

  child.on('close', (code) => {
    if (code !== 0 && !res.headersSent) {
      sendJson(res, 500, { error: stderr.trim() || `yt-dlp selesai dengan kode ${code}.` });
    }
    if (options.onClose) options.onClose(code, stderr);
  });

  return child;
}

function handleInfo(req, res, query) {
  const videoUrl = query.get('url');
  if (!videoUrl || !isSupportedUrl(videoUrl)) {
    return sendJson(res, 400, { error: 'Masukkan URL TikTok atau YouTube yang valid.' });
  }

  const args = ['--dump-json', '--no-playlist', '--no-warnings', videoUrl];
  const child = runYtDlp(args, res);
  let stdout = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0 || res.headersSent) return;

    try {
      const info = JSON.parse(stdout);
      const formats = Array.isArray(info.formats)
        ? info.formats
          .filter((format) => format.format_id && (format.vcodec !== 'none' || format.acodec !== 'none'))
          .slice(-20)
          .map((format) => ({
            id: format.format_id,
            ext: format.ext,
            resolution: format.resolution || format.format_note || `${format.width || '?'}x${format.height || '?'}`,
            audio: format.acodec !== 'none',
            video: format.vcodec !== 'none',
            filesize: format.filesize || format.filesize_approx || null
          }))
        : [];

      sendJson(res, 200, {
        title: info.title || 'Media',
        uploader: info.uploader || info.channel || null,
        duration: info.duration || null,
        thumbnail: info.thumbnail || null,
        webpageUrl: info.webpage_url || videoUrl,
        formats
      });
    } catch (error) {
      sendJson(res, 500, { error: 'Gagal membaca metadata dari yt-dlp.' });
    }
  });
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'kaosk-download';
}

function sendDownloadedFile(res, filePath, type, cleanup) {
  const filename = `${sanitizeFilename(path.basename(filePath, path.extname(filePath)))}.${type === 'audio' ? 'mp3' : 'mp4'}`;
  const stream = fs.createReadStream(filePath);

  res.writeHead(200, {
    'Content-Type': type === 'audio' ? 'audio/mpeg' : 'video/mp4',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  stream.pipe(res);
  stream.on('close', cleanup);
  stream.on('error', (error) => {
    cleanup();
    if (!res.headersSent) sendJson(res, 500, { error: error.message });
    else res.destroy(error);
  });
}

function handleDownload(req, res, query) {
  const videoUrl = query.get('url');
  const type = query.get('type') || 'video';

  if (!videoUrl || !isSupportedUrl(videoUrl)) {
    return sendJson(res, 400, { error: 'Masukkan URL TikTok atau YouTube yang valid.' });
  }

  if (!['video', 'audio'].includes(type)) {
    return sendJson(res, 400, { error: 'Tipe unduhan harus video atau audio.' });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaosk-download-'));
  const outputTemplate = path.join(tempDir, '%(title).160B.%(ext)s');
  const args = type === 'audio'
    ? ['--no-playlist', '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '-o', outputTemplate, videoUrl]
    : ['--no-playlist', '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputTemplate, videoUrl];

  const cleanup = () => fs.rm(tempDir, { recursive: true, force: true }, () => {});
  const child = runYtDlp(args, res, {
    onClose: (code, stderr) => {
      if (code !== 0 || res.headersSent) {
        if (code !== 0) cleanup();
        return;
      }

      fs.readdir(tempDir, (error, files) => {
        if (error || files.length === 0) {
          cleanup();
          return sendJson(res, 500, { error: stderr.trim() || 'File unduhan tidak ditemukan.' });
        }

        const preferredExt = type === 'audio' ? '.mp3' : '.mp4';
        const selected = files.find((file) => path.extname(file).toLowerCase() === preferredExt) || files[0];
        sendDownloadedFile(res, path.join(tempDir, selected), type, cleanup);
      });
    }
  });

  req.on('aborted', () => {
    if (!child.killed) child.kill('SIGTERM');
    cleanup();
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const requestedPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Tidak ditemukan');
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && parsedUrl.pathname === '/api/info') {
    return handleInfo(req, res, parsedUrl.searchParams);
  }

  if (req.method === 'GET' && parsedUrl.pathname === '/api/download') {
    return handleDownload(req, res, parsedUrl.searchParams);
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method tidak diizinkan.' });
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Kaosk Downloader berjalan di http://localhost:${PORT}`);
  console.log('Gunakan hanya untuk konten yang Anda miliki atau yang Anda punya izin untuk unduh.');
});
