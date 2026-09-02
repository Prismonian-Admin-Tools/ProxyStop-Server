const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 8000;
const publicDirectory = path.join(__dirname, '..', 'public');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(body);
}

function serveFile(requestPath, response) {
  const requestedPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.resolve(publicDirectory, `.${requestedPath}`);

  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    send(response, 404, 'Not found');
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const extension = path.extname(filePath);
    send(response, 200, file, contentTypes[extension] || 'application/octet-stream');
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || host}`);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed');
    return;
  }

  if (requestUrl.pathname === '/health') {
    send(response, 200, 'ok');
    return;
  }

  if (request.method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }

  serveFile(requestUrl.pathname, response);
});

server.listen(port, host, () => {
  console.log(`Application listening at http://${host}:${port}`);
});
