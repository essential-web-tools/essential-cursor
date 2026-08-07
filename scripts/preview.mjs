import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '..');
const PORT = 8080;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`
    );

    let pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/') {
      pathname = '/docs/index.html';
    }

    const filePath = normalize(join(rootDir, pathname));

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Forbidden');
      return;
    }

    const content = await readFile(filePath);

    const contentType =
      mimeTypes[extname(filePath)] ||
      'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    res.end(content);
  } catch {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8'
    });

    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Preview server: http://localhost:${PORT}`);
});