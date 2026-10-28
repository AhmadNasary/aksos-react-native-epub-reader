// Static server for browser-testing the engine: http://localhost:8123/
const http = require('http');
const fs = require('fs');
const path = require('path');
const HOOK = '<script>window.__events=[];window.__harnessPost=function(t,d){window.__events.push({type:t,data:d})}</script>';
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/reader.html') {
    const html = fs.readFileSync(path.join(__dirname, 'reader.html'), 'utf8').replace('<script>', HOOK + '<script>').replace("default-src 'none';", "default-src 'none'; connect-src 'self';");
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  const f = path.join(__dirname, path.basename(url));
  if (fs.existsSync(f)) { res.writeHead(200); return res.end(fs.readFileSync(f)); }
  res.writeHead(404); res.end();
}).listen(8123, () => console.log('http://localhost:8123/'));
