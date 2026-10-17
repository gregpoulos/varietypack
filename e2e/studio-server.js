'use strict';

// Serves a directory over HTTP for the studio's e2e tests, so localStorage behaves the
// same in Chromium and WebKit (file:// origins differ between them).
const http = require('http');
const fs   = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

// startServer(dir) → Promise<{ url, close }>. 127.0.0.1, port 0.
function startServer(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise(r => server.close(r)),
    }));
  });
}

// Builds the studio page into a temp dir and serves it: serveStudio() → { url, close }.
async function serveStudio() {
  const os = require('os');
  const { buildPage } = require('../studio/build');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-'));
  fs.writeFileSync(path.join(dir, 'index.html'), await buildPage(), 'utf8');
  const server = await startServer(dir);
  return {
    url: server.url,
    dir,
    close: async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

module.exports = { startServer, serveStudio };
