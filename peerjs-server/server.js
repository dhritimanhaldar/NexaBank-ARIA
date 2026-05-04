const { PeerServer } = require('peer');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';
const PATH = '/peerjs';
const KEY = process.env.PEERJS_KEY || 'NexaBank-ARIA-peerkey-secret';

const peerServer = PeerServer({
  port: PORT,
  host: HOST,
  path: PATH,
  key: KEY,
  proxied: true,
  allow_discovery: false
});

peerServer.on('connection', (client) => {
  console.log('[peerjs] connection:', client?.getId ? client.getId() : 'unknown');
});

peerServer.on('disconnect', (client) => {
  console.log('[peerjs] disconnect:', client?.getId ? client.getId() : 'unknown');
});

console.log(`PeerJS signaling server running on port ${PORT} at path ${PATH}`);