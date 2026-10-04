import { createServer, request } from 'node:http';
import { candidate } from '../qa2-009/provider-fixed.mjs';
let calls = 0;
const fixture = createServer(async (req, res) => {
  if (req.url === '/stats') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ localProviderCalls: calls, realProviderCalls: 0 })); return; }
  if (req.url === '/models') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'provider/integration', supported_parameters: ['structured_outputs'] }] })); return; }
  if (req.url !== '/chat/completions') { res.writeHead(404); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  calls++;
  const probe = JSON.parse(raw).messages.some(m => m.content.includes('fixed compatibility probe'));
  const value = JSON.stringify(candidate(probe ? ['learn'] : ['learn', 'weave', 'book'], 'en', probe));
  res.setHeader('content-type', 'text/event-stream');
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: value } }] }) + '\n\ndata: [DONE]\n\n');
});
const proxy = createServer((req, res) => {
  const upstream = request({ hostname: '127.0.0.1', port: req.url.startsWith('/api/v1') ? 38083 : 3332, path: req.url, method: req.method, headers: { ...req.headers, 'x-forwarded-host': '127.0.0.1:3302', 'x-forwarded-proto': 'http' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
fixture.listen(38084, '127.0.0.1');
proxy.listen(3302, '127.0.0.1');
process.on('SIGTERM', () => { fixture.close(); proxy.close(); });
