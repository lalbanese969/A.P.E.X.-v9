const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);

  // Strip query strings (used by some tools)
  filePath = filePath.split('?')[0];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    // sw.js must never be cached — browser needs to see every change immediately
    // Everything else: no-cache (validates but won't block load)
    const cacheHeader = path.basename(filePath) === 'sw.js'
      ? 'no-store'
      : 'no-cache';

    res.writeHead(200, {
      'Content-Type':  mime,
      'Cache-Control': cacheHeader,
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  A.P.E.X. v9  →  ${url}\n`);

  // Open browser automatically
  const opener =
    process.platform === 'win32'  ? `start ${url}` :
    process.platform === 'darwin' ? `open ${url}`   :
                                    `xdg-open ${url}`;
  exec(opener);
});
