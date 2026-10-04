// Prototype data comes from the corresponding preset's sample, never the current UI locale.
export function renderWordMeanings({ words, meanings = [], language }, { t, esc, icon }) {
  const byWord = new Map(meanings.map(item => [item.word, item.meaning]));
  return `<section class="preset-meanings" aria-label="${esc(t('preset.meanings'))}"><div class="preset-meanings-head"><h3>${icon('book-open-text')}${esc(t('preset.meanings'))}</h3><span>${esc(language || '')}</span></div><dl>${words.map(word => `<div><dt lang="en">${esc(word)}</dt><dd>${esc(byWord.get(word) || t('preset.meanings.pending'))}</dd></div>`).join('')}</dl></section>`;
}
