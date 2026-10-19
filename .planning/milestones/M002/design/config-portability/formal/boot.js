const params = new URLSearchParams(location.search);
const formalHost = new URL(location.href);
const page = ['models', 'plans', 'operations'].includes(params.get('page')) ? params.get('page') : 'models';
const category = ['models', 'plans', 'items', 'growth'].includes(params.get('category'))
  ? params.get('category')
  : page === 'models' ? 'models' : page === 'plans' ? 'plans' : 'items';
const language = params.get('lang') === 'en' ? 'en' : 'zh';
const portabilityState = params.get('portState') || 'idle';
const baseline = params.get('inheritance') === 'baseline';

document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
if (page === 'models' || page === 'plans') document.body.classList.add('m003-page');

const vendor = page === 'operations' ? 'M002' : 'M003';
const vendorBase = new URL(vendor === 'M002' ? './vendor/M002/design/prototype/' : './vendor/M003/design/prototype/', import.meta.url);
const baseElement = document.createElement('base');
baseElement.href = vendorBase.href;
document.head.prepend(baseElement);
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL(vendor === 'M002'
  ? './vendor/M002/design/theme.css?v=M002-UI-26'
  : './vendor/M003/design/theme.css?v=M003-UI-13-R4', import.meta.url).href;
document.head.append(stylesheet);
const patchStyles = document.createElement('link');
patchStyles.rel = 'stylesheet';
patchStyles.href = new URL('../theme.css?v=M002-UI-33-R3', import.meta.url).href;
document.head.append(patchStyles);

params.set('page', page);
params.set('lang', language);
if (page === 'models') params.set('state', 'list');
if (page === 'operations') params.set('state', 'normal');
formalHost.search = params.toString();
history.replaceState({}, '', formalHost.pathname + formalHost.search + formalHost.hash);

const modulePath = new URL(vendor === 'M002'
  ? './vendor/M002/design/prototype/app.js?v=M002-UI-26'
  : './vendor/M003/design/prototype/app.js?v=M003-UI-13-R4', import.meta.url).href;
await import(modulePath);
baseElement.remove();

const ready = await new Promise(resolve => {
  const deadline = performance.now() + 8000;
  const check = () => {
    const main = document.querySelector('#main .admin-main');
    if (main) return resolve(main);
    if (performance.now() > deadline) return resolve(null);
    requestAnimationFrame(check);
  };
  check();
});
if (!ready) throw new Error('Inherited admin page did not render');

if (!baseline) {
  const { enhanceConfigPortability } = await import(new URL('./enhancer.js?v=M002-UI-33-R3', import.meta.url));
  await enhanceConfigPortability({ page, category, language, initialState: portabilityState });
}
document.querySelector('#app')?.setAttribute('aria-busy', 'false');
