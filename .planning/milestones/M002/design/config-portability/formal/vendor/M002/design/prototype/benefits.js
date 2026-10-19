// Deterministic UI examples, not an entitlement or billing service.
export function createBenefitsDesign(H) {
  const { S, F, AD, t, L, esc, B, note, dialog, close, toast, render, scene } = H;
  const now = Date.parse(F.now), day = 86400000;
  const date = n => new Date(n + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  let sequence = 0;
  const issue = type => {
    const item = S.items[type];
    item.issued = true;
    const card = { type, id: 'card-' + ++sequence, status: 'unused', definition: structuredClone(item), useBy: now + item.days * day };
    S.inventory.push(card);
    return card;
  };
  S.inventory = [];
  F.items.forEach((_, i) => issue(i));
  // A separate earlier grant demonstrates per-model extension without merging cards.
  S.modelGrants = [{ source: 'earlier-card', model: 'Model B', start: now, end: now + 3 * day }];
  S.planTrial = null;
  S.planUsed = { visitor: 0, basic: 0, pro: 0, plus: 0 };
  S.extraPools = [];
  const base = () => AD.A.plans.find(p => p.code === (S.guest ? 'visitor' : AD.A.users[0].plan));
  const plan = () => {
    const p = base(), trial = !S.guest && S.planTrial?.end > now && AD.A.plans.find(p => p.code === S.planTrial.code);
    return trial && trial.priority > p.priority ? trial : p;
  };
  const planModels = () => AD.A.models.filter(m => m.enabled && plan().models.includes(m.id)).map(m => m.name);
  const models = () => [...new Set([...planModels(), ...(!S.guest ? S.modelGrants.filter(g => g.end > now).map(g => g.model) : [])])].filter(m => S.models.includes(m));
  const remaining = () => plan().limit === null ? Infinity : Math.max(0, plan().limit - (S.planUsed[plan().code] || 0));
  const pools = () => S.extraPools.filter(p => p.end > now && p.count > 0).sort((a, b) => a.end - b.end);
  const extra = () => S.guest ? 0 : pools().reduce((n, p) => n + p.count, 0);
  function quota() { S.quota = remaining() + extra(); return S.quota; }
  const quotaText = () => t('b.quota', { plan: remaining() === Infinity ? t('a.plan.unlimited') : remaining(), extra: extra() });
  function consume() {
    if (remaining() > 0) { S.planUsed[plan().code]++; S.charge = { code: plan().code }; }
    else if (extra()) { const p = pools()[0]; p.count--; S.charge = { pool: p }; }
    else return false;
    quota(); return true;
  }
  function refundCharge() {
    if (!S.charge) return;
    if (S.charge.pool) S.charge.pool.count++; else S.planUsed[S.charge.code]--;
    S.charge = null; quota();
  }
  const definition = v => v.definition;
  const covered = x => x.type === 'model' && x.models.every(m => planModels().includes(m));
  const modelEnds = x => x.models.map(model => ({ model, end: Math.max(now, ...S.modelGrants.filter(g => g.model === model).map(g => g.end)) + x.duration * day }));
  function unavailable(x) {
    return !x || (x.type === 'model' && !x.models.some(m => S.models.includes(m))) || (x.type === 'plan' && !AD.A.plans.some(p => p.code === x.plan));
  }
  function refundable(v) {
    if (v.status === 'refunded' || v.definition.type !== 'model') return false;
    const allRemoved = v.definition.models.every(m => !AD.A.models.some(a => a.name === m));
    const wasValid = v.status === 'unused' ? v.useBy > now : (v.ends || []).some(e => e.end > now);
    if ((allRemoved || scene() === 'retired') && wasValid) v.refundEligible = true;
    return !!v.refundEligible;
  }
  const effect = x => x.type === 'count' ? t('b.count', { count: x.count }) : x.type === 'model' ? t('b.model', { models: x.models.join(' / '), days: x.duration }) : x.type === 'plan' ? t('b.plan', { plan: t('a.plan.' + x.plan), days: x.duration }) : t('makeup.desc');
  function details(v) {
    const x = definition(v);
    return `${x.type === 'makeup' ? '' : `<p class="item-effect">${esc(effect(x))}</p>`}<dl class="item-dates"><div><dt>${esc(t('account.useby'))}</dt><dd>${esc(date(v.useBy))}</dd></div>${(v.ends || []).map(e => `<div class="benefit-end"><dt>${esc(e.model || t('a.plan.' + x.plan))}</dt><dd>${esc(t('ends', { date: date(e.end) }))}</dd></div>`).join('')}</dl>${x.type === 'count' && v.status === 'active' ? `<p>${esc(t('b.count', { count: S.extraPools.find(p => p.source === v.id)?.count || 0 }))}</p>` : ''}`;
  }
  function preview(i) {
    const v = S.inventory[i], x = definition(v);
    if (v.status !== 'unused' || v.useBy <= now || scene() === 'expired') return;
    if (unavailable(x)) { toast('reward.blocked'); return; }
    if (x.type === 'model') {
      if (covered(x) || scene() === 'covered') { toast('covered'); return; }
      dialog('card.preview', note('card.modelnote') + modelEnds(x).map(e => `<div class="answer-row"><strong>${esc(e.model)}</strong><span>${esc(t('b.extension', { days: x.duration, date: date(e.end) }))}</span></div>`).join(''), B('cancel', 'close') + B('activate', 'benefit-confirm:' + i, 'primary'));
    } else if (x.type === 'plan') {
      const target = AD.A.plans.find(p => p.code === x.plan), old = S.planTrial && AD.A.plans.find(p => p.code === S.planTrial.code);
      if (scene() === 'lower' || target.priority <= base().priority || (old && old.priority > target.priority)) { toast('card.lower'); return; }
      const renew = old?.code === x.plan, cover = old && !renew;
      const end = (renew ? Math.max(now, S.planTrial.end) : now) + x.duration * day;
      dialog(cover ? 'card.cover.title' : 'card.preview', `${cover ? note('b.cover', 'warn') : renew ? note('b.renew') : note('card.plannote')}<p>${esc(effect(x))}</p><p>${esc(t('ends', { date: date(end) }))}</p>`, B('cancel', 'close') + B('confirm', 'benefit-confirm:' + i, 'primary'));
    } else if (x.type === 'count') {
      dialog('card.preview', `<p>${esc(effect(x))}</p>${note('card.countnote')}<p>${esc(t('ends', { date: date(v.useBy) }))}</p>`, B('cancel', 'close') + B('confirm', 'benefit-confirm:' + i, 'primary'));
    }
  }
  function confirm(i) {
    const v = S.inventory[i], x = definition(v);
    if (v.status !== 'unused' || v.useBy <= now || unavailable(x)) return;
    if (x.type === 'model') {
      if (covered(x)) return;
      v.ends = modelEnds(x);
      v.ends.forEach(e => S.modelGrants.push({ source: v.id, model: e.model, start: e.end - x.duration * day, end: e.end }));
    } else if (x.type === 'plan') {
      const p = AD.A.plans.find(p => p.code === x.plan), old = S.planTrial && AD.A.plans.find(p => p.code === S.planTrial.code);
      if (p.priority <= base().priority || (old && old.priority > p.priority)) return;
      const end = (old?.code === x.plan ? Math.max(now, S.planTrial.end) : now) + x.duration * day;
      S.planTrial = { code: x.plan, end }; v.ends = [{ end }];
    } else if (x.type === 'count') S.extraPools.push({ source: v.id, count: x.count, end: v.useBy });
    v.status = 'active'; quota(); close(); render(); toast('card.used');
  }
  function handle(a) {
    const [k, arg] = a.split(':'), i = Number(arg);
    if (k === 'benefit-confirm') { confirm(i); return true; }
    if (k === 'refund') {
      const v = S.inventory[i]; if (!refundable(v)) return true;
      v.quote = S.items[v.type].refund;
      dialog('refund', `${note('card.refundnote')}<strong>${esc(t('pricevalue', { count: v.quote }))}</strong>`, B('cancel', 'close') + B('confirm', 'refund-confirm:' + i, 'primary')); return true;
    }
    if (k === 'refund-confirm') {
      const v = S.inventory[i]; if (!refundable(v)) return true;
      if (v.quote !== S.items[v.type].refund) return handle('refund:' + i);
      S.points += v.quote; v.status = 'refunded'; v.refundedPoints = v.quote;
      S.modelGrants = S.modelGrants.filter(g => g.source !== v.id);
      close(); render(); toast('card.refundok'); return true;
    }
    return false;
  }
  return { issue, definition, models, plan, base, quota, quotaText, consume, refundCharge, covered, refundable, details, effect, preview, handle, unavailable };
}
