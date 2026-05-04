const http = require('http');
const { ExpressPeerServer } = require('peer');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const PATH = '/peerjs';
const KEY = process.env.PEERJS_KEY || 'NexaBank-ARIA-peerkey-secret';

const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'peerjs-signaling-server' }));
    return;
  }

  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      name: 'NexaBank PeerJS Signaling Server',
      path: PATH,
      peerjs: `https://nexabank-peerjs-server.onrender.com${PATH}`
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const peerServer = ExpressPeerServer(server, {
  path: '/',
  key: KEY,
  proxied: true,
  allow_discovery: false
});

peerServer.on('connection', (client) => {
  const id = client && typeof client.getId === 'function' ? client.getId() : 'unknown';
  console.log('[peerjs] connection:', id);
});

peerServer.on('disconnect', (client) => {
  const id = client && typeof client.getId === 'function' ? client.getId() : 'unknown';
  console.log('[peerjs] disconnect:', id);
});

server.on('request', (req, res) => {
  // no-op, handled above
});

server.listen(PORT, HOST, () => {
  server.on('request', peerServer);
  console.log(`PeerJS signaling server running on port ${PORT} at path ${PATH}`);
});