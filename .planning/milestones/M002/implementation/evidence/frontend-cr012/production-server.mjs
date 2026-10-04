import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const {isolated} = JSON.parse(readFileSync(new URL('./build-location.json', import.meta.url), 'utf8'));
await import(pathToFileURL(isolated+'/.output/server/index.mjs'));
