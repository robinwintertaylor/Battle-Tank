const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'site');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const p = path.join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(4173);
