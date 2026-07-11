const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.gz': 'application/gzip',
  '.wasm': 'application/wasm', '.zip': 'application/zip'
};

const server = http.createServer(function (request, response) {
  const requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(target, function (statError, stat) {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(target);
    stream.on('error', function () {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
    request.on('aborted', function () { stream.destroy(); });
    response.on('error', function () { stream.destroy(); });
    stream.pipe(response);
  });
});

server.on('clientError', function (error, socket) {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(port, '127.0.0.1', function () {
  process.stdout.write('Static server: http://127.0.0.1:' + port + '\n');
});

function shutdown() {
  server.close(function () { process.exit(0); });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
