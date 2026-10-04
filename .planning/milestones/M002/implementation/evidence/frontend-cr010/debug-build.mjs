import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const { loadNuxt, buildNuxt } = await import(require.resolve('nuxt/kit'));
const isolated = mkdtempSync(join(tmpdir(), 'wordweave-cr010-build-'));
writeFileSync(new URL('./debug-build-location.json', import.meta.url), JSON.stringify({ isolated }));
const nuxt = await loadNuxt({cwd:process.cwd(),dev:false,overrides:{buildDir:join(isolated,'.nuxt'),vite:{define:{__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:true}},nitro:{output:{dir:join(isolated,'.output'),serverDir:join(isolated,'.output/server'),publicDir:join(isolated,'.output/public')}}}});
try { await buildNuxt(nuxt); } finally { await nuxt.close(); }
