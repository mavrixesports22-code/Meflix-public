// Serves `npx expo export --platform web` output with the repository's existing
// NetMirror API. Keep this app beside ../netmirror-service.js and ../lib/.
// Usage: node web-server.cjs [staticRoot] [port]
// Environment: MEFLIX_WEB_ROOT, PORT (8090), MEFLIX_WEB_HOST (127.0.0.1).
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8',
};
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
function reply(req, res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(req.method === 'HEAD' ? undefined : message);
}
function createWebServer({ staticRoot = path.join(__dirname, 'dist'), handleNetMirror } = {}) {
  const root = fs.realpathSync(path.resolve(staticRoot));
  if (!fs.statSync(root).isDirectory()) throw new Error('The web export root must be a directory.');
  let api = handleNetMirror;
  if (!api) {
    const source = require('../netmirror-service.js');
    const prime = source.createNetMirrorProvider('pv');
    api = async (req, res, url) => url.pathname.startsWith('/api/prime/')
      ? prime.handleNetMirror(req, res, url) : source.handleNetMirror(req, res, url);
  }
  return http.createServer(async (req, res) => {
    try {
      // The fixed parsing origin prevents an untrusted Host header from changing
      // URL interpretation; the API itself checks browser Origin against Host.
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (await api(req, res, url)) return;
        return reply(req, res, 404, 'Unknown API endpoint.');
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(req, res, 405, 'Method not allowed.', { Allow: 'GET, HEAD' });
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); }
      catch { return reply(req, res, 400, 'Invalid URL encoding.'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '..' || part.startsWith('.'))) {
        return reply(req, res, 403, 'Invalid file path.');
      }
      let filename = path.resolve(root, '.' + decoded);
      if (!within(root, filename)) return reply(req, res, 403, 'Invalid file path.');
      let stat;
      try {
        stat = await fsp.stat(filename);
        if (stat.isDirectory()) { filename = path.join(filename, 'index.html'); stat = await fsp.stat(filename); }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        // Expo's client router owns extensionless navigation. Missing assets
        // retain a 404 so JavaScript requests cannot receive an HTML response.
        if (path.extname(decoded)) return reply(req, res, 404, 'File not found.');
        filename = path.join(root, 'index.html'); stat = await fsp.stat(filename);
      }
      filename = await fsp.realpath(filename);
      if (!within(root, filename) || !stat.isFile()) return reply(req, res, 403, 'Invalid file path.');
      const headers = {
        'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': filename.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
      };
      let range;
      if (req.headers.range) {
        range = byteRange(req.headers.range, stat.size);
        if (!range) return reply(req, res, 416, 'Requested range is unavailable.', { 'Content-Range': `bytes */${stat.size}` });
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
        headers['Content-Length'] = range.end - range.start + 1;
      }
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(filename, range || {});
      res.once('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) res.destroy();
      else reply(req, res, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, 'Unable to serve this request.');
    }
  });
}
if (require.main === module) {
  try {
    const rawPort = process.argv[3] || process.env.PORT || '8090';
    if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('PORT must be between 1 and 65535.');
    const root = process.argv[2] || process.env.MEFLIX_WEB_ROOT || path.join(__dirname, 'dist');
    const host = process.env.MEFLIX_WEB_HOST || '127.0.0.1';
    const server = createWebServer({ staticRoot: root });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(Number(rawPort), host, () => console.log(`Meflix web: http://${host}:${rawPort} (${path.resolve(root)})`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createWebServer, byteRange };
