const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const dns = require('dns').promises;

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM = process.env.NEKO_UPSTREAM || 'ws://127.0.0.1:8080/ws';

async function printConnectionInfo() {
  const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || '';
  const externalUrl = process.env.RENDER_EXTERNAL_URL || (hostname ? `https://${hostname}` : '');
  const port = Number(process.env.PORT || 10000);
  let resolved = [];
  if (hostname) {
    try { resolved = await dns.resolve4(hostname); } catch (e) { resolved = [`unavailable (${e.code || e.message})`]; }
  }
  console.log('\n============================================================');
  console.log(' LOVABLE / NEKO CONNECTION SETTINGS');
  console.log('============================================================');
  console.log(`Website URL : ${externalUrl || '(not supplied by host)'}`);
  console.log(`Host / IP   : ${hostname || '(not supplied by host)'}`);
  console.log(`Resolved IP : ${resolved.length ? resolved.join(', ') : '(not available)'}`);
  console.log(`Public port : 443`);
  console.log(`Render PORT : ${port}  (internal only; do NOT use in Lovable)`);
  console.log(`TLS         : ON`);
  console.log(`WebSocket   : ${hostname ? `wss://${hostname}/api/ws` : '(hostname unavailable)'}`);
  console.log(`Username    : any display name`);
  console.log(`Password    : ${process.env.NEKO_MEMBER_MULTIUSER_USER_PASSWORD ? '[value of NEKO_MEMBER_MULTIUSER_USER_PASSWORD]' : 'neko (default)'}`);
  console.log('============================================================\n');
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'neko-render-bridge' }));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const parsed = new URL(req.url, 'http://localhost');
  if (parsed.pathname !== '/api/ws' && parsed.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

function normalizeClientMessage(data) {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.event === 'signal/candidate' && msg.data && typeof msg.data === 'object') {
      return JSON.stringify({ event: 'signal/candidate', ...msg.data });
    }
    return JSON.stringify(msg);
  } catch { return data; }
}

function normalizeServerMessage(data) {
  try {
    const msg = JSON.parse(data.toString());
    // The supplied Lovable client accepts either `iceservers` or `ice`.
    if (msg.event === 'signal/provide' && msg.ice && !msg.iceservers) msg.iceservers = msg.ice;
    return JSON.stringify(msg);
  } catch { return data; }
}

wss.on('connection', (client, req) => {
  const incoming = new URL(req.url, 'http://localhost');
  const upstreamUrl = new URL(UPSTREAM);
  // Preserve exactly the query fields used by the supplied frontend.
  for (const [key, value] of incoming.searchParams) upstreamUrl.searchParams.set(key, value);
  const upstream = new WebSocket(upstreamUrl.toString(), { perMessageDeflate: false });
  let queue = [];

  upstream.on('open', () => {
    for (const item of queue) upstream.send(item);
    queue = [];
  });
  client.on('message', data => {
    const payload = normalizeClientMessage(data);
    if (upstream.readyState === WebSocket.OPEN) upstream.send(payload);
    else if (upstream.readyState === WebSocket.CONNECTING) queue.push(payload);
  });
  upstream.on('message', data => {
    if (client.readyState === WebSocket.OPEN) client.send(normalizeServerMessage(data));
  });
  upstream.on('close', (code, reason) => {
    if (client.readyState === WebSocket.OPEN) client.close(code >= 1000 && code <= 4999 ? code : 1011, reason.toString().slice(0, 120));
  });
  upstream.on('error', err => {
    console.error('upstream websocket error:', err.message);
    if (client.readyState === WebSocket.OPEN) client.close(1011, 'Neko upstream unavailable');
  });
  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
  });
  client.on('error', () => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
  });
});

server.listen(PORT, '0.0.0.0', async () => { console.log(`Render bridge listening on 0.0.0.0:${PORT}`); await printConnectionInfo(); });
