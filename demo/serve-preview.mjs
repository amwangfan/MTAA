import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', [new URL('./group-memory-preview.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/lib/group-memory-demo.js', [new URL('../lib/group-memory-demo.js', import.meta.url), 'text/javascript; charset=utf-8']],
]);
http.createServer(async (request, response) => {
  const item = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!item || request.method !== 'GET') { response.writeHead(404).end(); return; }
  const [url, type] = item;
  response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(await readFile(url));
}).listen(18763, '127.0.0.1', () => console.log('Group memory preview: http://127.0.0.1:18763/'));
