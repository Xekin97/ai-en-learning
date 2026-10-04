import { icon } from "./icons.js?v=M002-UI-23";
// Shared learner-facing growth states use the same example configuration as operations.
export function createGrowthDesign(H) {
  const { S, F, AD, BD, t, L, esc, B, note, heading, link, badge, scene, render, toast } = H;
  const earned = new Set(), claimed = new Set(), levelEarned = new Set(), levelClaimed = new Set();
  AD.A.levels.forEach((r, i) => r.designId = 'level-' + i);
  Object.entries(AD.A.achievements).forEach(([kind, rows]) => rows.forEach((r, i) => r.designId = kind + '-' + i));
  let sequence = 0;
  const id = r => r.designId || (r.designId = 'new-tier-' + ++sequence);
  const current = kind => scene() === 'empty' ? 0 : ({ mastery: F.user.mastered, stories: F.user.stories, signin: 7, review: S.reviewToday ? 4 : 3 })[kind];
  const xp = () => scene() === 'empty' ? 0 : scene() === 'demoted' ? 150 : scene() === 'maxlevel' ? Math.max(S.xp, AD.A.levels.at(-1).threshold + 50) : S.xp;
  const level = () => Math.max(0, AD.A.levels.findLastIndex(r => xp() >= r.threshold));
  function reason(r, isLevel = false, i = 0) {
    if (scene() === 'disabled' || !r.enabled) return 'reward.disabled';
    if (scene() === 'blocked' || (r.card >= 0 && BD.unavailable(S.items[r.card]))) return 'reward.blocked';
    if (isLevel && i > level()) return 'reward.demoted';
    return '';
  }
  function reward(r) {
    return `<p class="growth-reward">${esc(t('reward', { points: r.points, xp: r.xp || 0 }))}${r.card >= 0 ? `<br>${esc(L(S.items[r.card]?.title))} × ${r.quantity}` : ''}</p>`;
  }
  function rows() { return Object.entries(AD.A.achievements).flatMap(([kind, values]) => values.map(r => ({ kind, r }))); }
  function update() {
    rows().forEach(({ kind, r }) => { if (current(kind) >= r.threshold) earned.add(id(r)); });
    AD.A.levels.forEach((r, i) => { if (i > 0 && (i <= level() || (scene() === 'demoted' && i === 2))) levelEarned.add(id(r)); });
  }
  function achievement(r, kind, i) {
    const reached = earned.has(id(r)), done = claimed.has(id(r)), why = reason(r);
    return `<article class="achievement ${reached ? 'is-reached' : ''}" data-achievement="${kind}:${r.threshold}"><div class="achievement-heading"><span class="medal" aria-hidden="true">${icon(({ signin: 'calendar-check', mastery: 'brain', review: 'clipboard-check', stories: 'notebook-pen' })[kind])}</span><div><h3>${esc(L(r.title))}</h3><p class="achievement-count">${current(kind)} / ${r.threshold}</p></div></div><div class="progress" role="progressbar" aria-label="${esc(L(r.title))}" aria-valuemin="0" aria-valuemax="${r.threshold}" aria-valuenow="${Math.min(current(kind), r.threshold)}"><span style="width:${Math.min(100, current(kind) / r.threshold * 100)}%"></span></div><p class="achievement-description">${esc(L(r.description))}</p>${reached ? `<p class="achievement-honor">${icon('trophy')}${esc(t('g.honor', { title: L(r.honor) }))}</p>` : ''}${why && reached && !done ? note(why, 'warn') : ''}<div class="achievement-footer">${reward(r)}${B(done ? 'claimed' : reached ? 'claim' : 'unreached', 'growth-claim:' + i, 'primary', done || !reached || !!why)}</div></article>`;
  }
  function achievementGroups() {
    let offset = 0;
    return Object.entries(AD.A.achievements).map(([kind, values]) => {
      const start = offset; offset += values.length;
      const featured = Math.max(0, values.findIndex(r => !claimed.has(id(r))));
      return `<div class="achievement-group" data-achievement-group="${kind}">${achievement(values[featured], kind, start + featured)}<details class="tier-disclosure"><summary>${esc(t('g.tiers', { count: values.length }))}</summary><div>${values.map((r, i) => i === featured ? '' : achievement(r, kind, start + i)).join('')}</div></details></div>`;
    }).join('');
  }
  function view() {
    update();
    const lev = level(), next = AD.A.levels[lev + 1], threshold = AD.A.levels[lev].threshold;
    const pct = next ? Math.max(0, Math.min(100, (xp() - threshold) / (next.threshold - threshold) * 100)) : 100;
    return `${heading('growth.title', 'growth.desc')}${scene() === 'claim-error' ? note('g.claim.failed', 'error') : ''}<div class="account-growth"><div class="growth-grid"><section class="growth-banner"><div class="growth-level-heading"><div><p class="eyebrow">${esc(t('level'))}</p><h2>Lv. ${lev + 1}</h2></div><span class="growth-level-symbol" aria-hidden="true">${icon('trophy')}</span></div><p class="growth-xp">${next ? esc(t('progress', { current: xp(), target: next.threshold })) : `${esc(t('maxlevel'))} · ${xp()} XP`}</p><div class="progress" role="progressbar" aria-label="${esc(t('level'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${pct}%"></span></div><div class="stats">${[['points', S.points], ['mastered', current('mastery')], ['stories', current('stories')]].map(([k, v]) => `<div><strong>${v}</strong><small>${esc(t(k))}</small></div>`).join('')}</div></section><section class="panel signin-panel"><div class="section-head"><h2>${icon('calendar-check')}${esc(t('signin'))}</h2>${badge(S.signed ? 'signed' : 'unsigned')}</div><div class="calendar">${Array.from({ length: 7 }, (_, i) => { const signed = i === 3 ? S.madeup : i === 6 ? S.signed : true; return `<span class="day ${signed ? 'signed' : i === 6 ? 'today' : 'missed'}" data-day="${11 + i}">${11 + i}${icon(signed ? 'check' : i === 6 ? 'circle' : 'minus')}<span class="sr-only">${esc(t(signed ? 'signed' : 'unsigned'))}</span></span>`; }).join('')}</div><p class="signin-rule">${esc(t('signin.rule'))}</p><div class="actions">${B('makeup', 'makeup')}${link('create', 'learn', 'btn primary')}</div></section></div><section class="section"><div class="account-section-head">${icon('trophy')}<h2>${esc(t('achievements'))}</h2></div><div class="achievement-grid">${achievementGroups()}</div></section><section class="section"><div class="account-section-head">${icon('gift')}<h2>${esc(t('levelrewards'))}</h2></div><div class="level-reward-list">${AD.A.levels.slice(1).map((r, n) => {
      const i = n + 1, reached = levelEarned.has(id(r)), done = levelClaimed.has(id(r)), why = reason(r, true, i);
      return `<article class="level-reward" data-level="${i + 1}"><span class="level-reward-symbol" aria-hidden="true">${icon('gift')}</span><h3>Lv. ${i + 1}</h3><div class="level-reward-details">${reward(r)}${why && reached && !done ? note(why, 'warn') : ''}</div>${B(done ? 'claimed' : reached ? 'claimlevel' : 'unreached', 'growth-level:' + i, 'primary', done || !reached || !!why)}</article>`;
    }).join('')}</div></section></div>`;
  }
  function handle(a) {
    if (!a.startsWith('growth-')) return false;
    const [k, arg] = a.split(':'), i = Number(arg), isLevel = k === 'growth-level';
    update();
    const r = isLevel ? AD.A.levels[i] : rows()[i]?.r, facts = isLevel ? levelEarned : earned, claims = isLevel ? levelClaimed : claimed;
    if (!r || !facts.has(id(r)) || claims.has(id(r)) || reason(r, isLevel, i)) return true;
    if (scene() === 'claim-error') { toast('g.claim.failed'); return true; }
    claims.add(id(r)); S.points += r.points; S.xp += r.xp || 0;
    if (r.card >= 0) for (let n = 0; n < r.quantity; n++) BD.issue(r.card);
    const openGroups = [...document.querySelectorAll('.achievement-group:has(details[open])')].map(el => el.dataset.achievementGroup);
    const group = document.querySelector(`[data-action="${a}"]`)?.closest('.achievement-group')?.dataset.achievementGroup;
    render();
    openGroups.forEach(kind => { const details = document.querySelector(`[data-achievement-group="${kind}"] details`); if (details) details.open = true; });
    const target = group ? document.querySelector(`[data-achievement-group="${group}"] summary`) : document.querySelector(`[data-level="${i + 1}"] h3`);
    if (target) { if (!group) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    toast('claim.ok'); return true;
  }
  return { view, handle };
}
