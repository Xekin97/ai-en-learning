// Selected Lucide SVGs from Iconify; license and provenance in assets/README.md.
const response = await fetch(new URL('./assets/lucide.json?v=M002-UI-23', import.meta.url));
if (!response.ok) throw new Error('Unable to load local icon assets');
const set = await response.json();
export function icon(name, className = '') {
  const item = set.icons[name];
  if (!item) throw new Error('Unknown UI icon: ' + name);
  return `<svg class="ui-icon ${className}" data-icon="lucide:${name}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${item.width || set.width || 24} ${item.height || set.height || 24}" aria-hidden="true" focusable="false">${item.body}</svg>`;
}
export const routeIcons = { profile: 'user', growth: 'trophy', bag: 'shopping-bag', shop: 'store', adminhome: 'layout-dashboard', metrics: 'chart-no-axes-combined', models: 'bot', plans: 'layers', users: 'users', operations: 'gift', messages: 'megaphone', presets: 'panels-top-left' };
export const actionIcons = { random: 'shuffle', add: 'plus', save: 'save', retry: 'refresh-cw', edit: 'pencil', delete: 'trash', newitem: 'plus', newpreset: 'plus', newmessage: 'plus', 'a.search': 'search', 'a.model.new': 'plus', 'a.key.replace': 'lock-keyhole', 'a.save': 'save', 'l.title.edit': 'pencil' };
