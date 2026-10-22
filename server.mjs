// Carnet server: serves the app and relays price requests to Yahoo Finance.
// It never receives your data in clear text: the (optional) sync only hands it
// vaults encrypted by the browser, stored in ./data (or CARNET_DATA_DIR).
//   node server.mjs                      → http://localhost:8080
//   PORT=9000 HOST=0.0.0.0 node server.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './lib/handlers.mjs';
import { handleSync, readJson } from './lib/vault.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = +(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const SECURITY = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/sync') {
      const json = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
      try {
        const body = req.method === 'PUT' ? await readJson(req) : null;
        const [status, out] = await handleSync(req.method, req.headers, body, req.socket.remoteAddress);
        return send(res, status, JSON.stringify(out), json);
      } catch (e) {
        return send(res, e.status || 502, JSON.stringify({ error: String(e.message || e) }), json);
      }
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return send(res, 405, '{}', { 'content-type': 'application/json' });
      try {
        const [status, body] = await handleApi(url.pathname, url.searchParams);
        return send(res, status, JSON.stringify(body), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      } catch (e) {
        return send(res, 502, JSON.stringify({ error: String(e.message || e) }), { 'content-type': 'application/json; charset=utf-8' });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep)) return send(res, 403, 'Interdit'); // not a sibling folder such as « public2 »
    let st;
    try { st = await stat(file); } catch { return send(res, 404, 'Introuvable', { 'content-type': 'text/plain; charset=utf-8' }); }
    if (!st.isFile()) return send(res, 404, 'Introuvable');
    const ext = extname(file);
    const body = await readFile(file);
    const noCache = ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest';
    send(res, 200, req.method === 'HEAD' ? '' : body, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': noCache ? 'no-cache' : 'public, max-age=3600' });
  } catch (e) {
    send(res, 500, 'Erreur interne');
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Carnet is ready: http://${shown}:${PORT}`);
});
