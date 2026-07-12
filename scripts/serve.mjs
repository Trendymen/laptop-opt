import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve('dist/laptop-performance-handoff.html');
const html = await readFile(file);
const port = Number(process.env.PORT || 4173);

createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/?capture=1`));
