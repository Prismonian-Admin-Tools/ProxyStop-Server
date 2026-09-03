const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8')).host;
const port = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8')).port;
const publicDirectory = path.join(__dirname, 'public');

// Below comment demonstrates the request format. Hope this helps :D
// Request format: proxystop.example.com/api/student?website=example.com?group=groupname

/*
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 8000;
*/
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

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== "OPTIONS") {
    send(response, 405, 'Method not allowed');
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/')) {
    const apiPath = requestUrl.pathname.slice(5); // Remove '/api/' prefix
    const queryParams = Object.fromEntries(requestUrl.searchParams.entries());

    
  }

  if (request.method === 'GET' && !requestUrl.pathname.startsWith('/api/') && json.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8')).app.managementServer.enabled) {
    send(response, 202, 'Management server is being created.');
    // TODO: Implement management server functionality here
  } else {
    send(response, 403, 'Management server is disabled. Please contact your system administrators if you belive this is a mistake.');
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
