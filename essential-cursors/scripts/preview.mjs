import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createReadStream } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const docsDir = join(rootDir, 'docs');

const PORT = 8080;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  let urlPath = req.url === '/' ? '/docs/index.html' : req.url;
  
  // Remover query params
  urlPath = urlPath.split('?')[0];
  
  const filePath = join(rootDir, urlPath);
  const ext = '.' + filePath.split('.').pop();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const stream = createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🌐 Preview server rodando em http://localhost:${PORT}`);
  console.log('\nPressione Ctrl+C para parar.\n');
});
