import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../tests/fixtures/page.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404).end('未找到页面');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': html.byteLength,
  });
  response.end(html);
});
server.listen(4173, '127.0.0.1', () => console.log('本地验收页：http://127.0.0.1:4173'));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
