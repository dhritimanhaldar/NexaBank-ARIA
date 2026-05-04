const express = require('express');
const http = require('http');
const { ExpressPeerServer } = require('peer');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const PUBLIC_PATH = '/peerjs';
const KEY = process.env.PEERJS_KEY || 'NexaBank-ARIA-peerkey-secret';

const app = express();
app.enable('trust proxy');

app.get('/status', (_req, res) => {
  res.status(200).json({ ok: true, service: 'peerjs-signaling-server' });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    name: 'NexaBank PeerJS Signaling Server',
    peerjs: `https://nexabank-peerjs-server.onrender.com${PUBLIC_PATH}`
  });
});

const server = http.createServer(app);

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

app.use(PUBLIC_PATH, peerServer);

server.listen(PORT, HOST, () => {
  console.log(`PeerJS signaling server running on port ${PORT} at path ${PUBLIC_PATH}`);
});