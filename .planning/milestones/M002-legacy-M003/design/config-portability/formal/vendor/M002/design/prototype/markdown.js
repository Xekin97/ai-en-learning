import { Marked } from './assets/marked.esm.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Prototype preview only. Production continues to use backend allowlist-sanitized HTML.
const parser = new Marked({ gfm: true, breaks: false, renderer: {
  html(token) { return escape(token.text); },
  image(token) { return escape(token.text); },
  link(token) {
    const text = this.parser.parseInline(token.tokens);
    let url;
    try { url = new URL(token.href); } catch { return text; }
    if (!['http:', 'https:'].includes(url.protocol)) return text;
    return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
}});
export const renderMarkdown = value => parser.parse(String(value ?? ''));
