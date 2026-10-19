// Isolated real-network capability probe; no application code, auth, or request mocks.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = process.cwd();
const require = createRequire(resolve(project, 'frontend/package.json'));
const { chromium } = require('@playwright/test');
const evidence = resolve(project, '.planning/milestones/M002/technical/pronunciation/evidence/backend');
const entry = JSON.parse(await readFile(resolve(evidence, 'hello.json'), 'utf8'))[0];
const sample = entry.phonetics.find(p => p.audio?.endsWith('/hello-uk.mp3'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
  res.end('<!doctype html><html lang="en"><title>Isolated pronunciation probe</title><button id="audio">Audio probe</button><button id="speech">Speech probe</button></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const report = { at: new Date().toISOString(), environment: 'Headless Chromium on current workstation; isolated loopback page', mock: false, tlsBypass: false, sample, requests: [], humanListening: false };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  const page = await browser.newPage();
  page.on('request', request => report.requests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType() }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  report.dictionary = await page.evaluate(async () => {
    const started = performance.now();
    try {
      const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/hello', { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(5000) });
      const body = await response.json();
      return { status: response.status, milliseconds: Math.round(performance.now() - started), phonetics: Array.isArray(body) ? body.flatMap(entry => entry.phonetics) : [], responseType: response.type };
    } catch (error) { return { error: `${error.name}: ${error.message}`, milliseconds: Math.round(performance.now() - started) }; }
  });
  await page.evaluate(url => {
    document.querySelector('#audio').onclick = () => {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = url;
      const started = performance.now();
      const events = [];
      let finished = false;
      const finish = outcome => {
        if (finished) return;
        finished = true;
        window.audioResult = { outcome, events, duration: Number.isFinite(audio.duration) ? audio.duration : null, currentTime: audio.currentTime, milliseconds: Math.round(performance.now() - started), mediaError: audio.error?.code ?? null };
        clearTimeout(timer);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      };
      for (const event of ['loadedmetadata', 'canplay', 'playing', 'ended', 'error']) audio.addEventListener(event, () => {
        events.push(event);
        if (event === 'ended' || event === 'error') finish(event);
      });
      const timer = setTimeout(() => finish('probe_timeout'), 10000);
      audio.play().then(() => events.push('play_resolved')).catch(error => finish(error.name));
    };
    document.querySelector('#speech').onclick = () => {
      if (!('speechSynthesis' in window)) { window.speechResult = { outcome: 'unsupported' }; return; }
      const voices = speechSynthesis.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang));
      if (!voices.length) { window.speechResult = { outcome: 'no_english_voice', totalVoices: speechSynthesis.getVoices().length }; return; }
      const utterance = new SpeechSynthesisUtterance('hello');
      utterance.voice = voices[0]; utterance.lang = voices[0].lang;
      const events = []; let done = false;
      const finish = outcome => { if (done) return; done = true; clearTimeout(timer); window.speechResult = { outcome, events, voice: { name: voices[0].name, lang: voices[0].lang, localService: voices[0].localService } }; speechSynthesis.cancel(); };
      utterance.onstart = () => events.push('start');
      utterance.onend = () => finish('ended');
      utterance.onerror = event => finish(event.error);
      const timer = setTimeout(() => finish('probe_timeout'), 5000);
      speechSynthesis.speak(utterance);
    };
  }, sample.audio);
  await page.click('#audio');
  await page.waitForFunction(() => Boolean(window.audioResult), { timeout: 12000 });
  report.audio = await page.evaluate(() => window.audioResult);
  await page.click('#speech');
  await page.waitForFunction(() => Boolean(window.speechResult), { timeout: 7000 });
  report.speech = await page.evaluate(() => window.speechResult);
} catch (error) {
  report.probeError = `${error.name}: ${error.message}`;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(resolve(evidence, 'browser-probe.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
