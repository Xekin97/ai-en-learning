import { createServer, request } from 'node:http';
import { candidate as compatibilityCandidate } from '../qa2-009/provider-fixed.mjs';

// Local UAT fixture only. Values follow the real prompt; prose and definitions
// are explicitly synthetic and must not be used as AI-quality evidence.
export function candidateForRequest(body) {
  const messages = body.messages ?? [];
  if (messages.some(m => m.content.includes('fixed compatibility probe')))
    return compatibilityCandidate(['learn'], 'en', true);
  const input = JSON.parse(messages.findLast(m => m.role === 'user').content);
  const { entries, meaning_language: language, minimum_words: minimum } = input;
  if (!Array.isArray(entries) || !entries.length || !entries.every(e => typeof e === 'string' && e.length)
      || !Number.isSafeInteger(minimum) || minimum < 1)
    throw new Error('Unsupported fixture prompt');
  const localized = {
    Chinese: ['本地测试释义，仅用于流程验收', '测试样文'],
    English: ['Placeholder definition for local testing only', 'test sample'],
    Japanese: ['動作確認用の仮の意味です', 'テスト文章'],
  }[language];
  if (!localized) throw new Error('Unsupported fixture meaning language');
  const openings = {
    story: 'On a quiet morning, a group of friends met in a small library to explore a new set of words.',
    discussion: 'A group of students discussed how regular vocabulary practice could make their daily conversations more confident.',
    business: 'During a team workshop, colleagues developed a vocabulary exercise to improve communication across their company.',
    news: 'A local library has introduced a vocabulary workshop that brings neighbors together for regular reading practice.',
  };
  const targets = Object.fromEntries(entries.map(entry => [entry, {
    entry_meaning: localized[0], hint_phrase: `the expression ${entry}(${entry})`,
  }]));
  const parts = [openings[input.scenario] ?? openings.story,
    'This is a local test passage for checking the learning workflow.',
    ...entries.map(entry => `One card displayed the expression ${entry}(${entry}), which the group discussed before adding it to their shared notes.`)];
  const filler = [
    'Each person took a moment to read the notes carefully and ask a question about an unfamiliar idea. The others listened with patience and offered clear examples from everyday experience.',
    'After a short break, they compared their observations and organized the material into a simple plan. This gave everyone a chance to contribute and discover a useful connection between the ideas.',
    'The group then read a short passage together and discussed its central message. They noticed how context could make an expression easier to remember, especially when it appeared in a familiar situation.',
  ];
  const count = () => (parts.join(' ').replace(/\([^)]*\)/g, '').match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? []).length;
  for (let i = 0; count() < Math.ceil(minimum * 1.2); i++) parts.push(filler[i % filler.length]);
  parts.push('At the end of the session, everyone agreed to return with another idea to share.');
  return { passage: parts.join(' '), tags: [localized[1]], targets };
}

let calls = 0;
const fixture = createServer(async (req, res) => {
  if (req.url === '/stats') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ localProviderCalls: calls, realProviderCalls: 0, fixtureVersion: 'request-aware-v1' })); return;
  }
  if (req.url === '/models') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'provider/integration', supported_parameters: ['structured_outputs'] }] })); return;
  }
  if (req.url !== '/chat/completions') { res.writeHead(404); res.end(); return; }
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls++;
    const value = JSON.stringify(candidateForRequest(JSON.parse(raw)));
    res.setHeader('content-type', 'text/event-stream');
    for (let offset = 0; offset < value.length; offset += 256)
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: value.slice(offset, offset + 256) } }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  } catch {
    res.writeHead(422, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Local fixture cannot interpret the requested prompt' }));
  }
});
const proxy = createServer((req, res) => {
  const upstream = request({ hostname: '127.0.0.1', port: req.url.startsWith('/api/v1') ? 38083 : 3332, path: req.url, method: req.method,
    headers: { ...req.headers, 'x-forwarded-host': '127.0.0.1:3302', 'x-forwarded-proto': 'http' } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
fixture.listen(38084, '127.0.0.1');
proxy.listen(3302, '127.0.0.1');
process.on('SIGTERM', () => { fixture.close(); proxy.close(); });
