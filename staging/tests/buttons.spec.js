// Every button/chip/tab/toggle on every page: visible, not covered, >=40px, >=8px apart, click works without JS errors.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const BASE = `${process.env.FATMI_PREFIX || ''}${process.env.FATMI_PATH || '/staging/'}`;
const S = (name, cat, kg, reps) => ({ name, cat, kg, reps });
const ACTS = [
  { type: 'strength_training', date: '2026-11-10', startTime: '2026-11-10 23:26:25', durationMin: 16.4, avgHR: 98, kcal: 102, name: '肌力訓練',
    sets: [S('GOBLET_SQUAT', 'SQUAT', 13.5, 10), S(null, 'PUSH_UP', null, 10), S('GOBLET_SQUAT', 'SQUAT', 13.5, 12), S(null, 'PUSH_UP', null, 10)] },
  { type: 'multi_sport', date: '2026-11-14', startTime: '2026-11-14 21:33:07', durationMin: 95.4, avgHR: null, kcal: 954, name: '複合式運動',
    children: [{ type: 'strength_training', durationMin: 65.2, avgHR: 114, kcal: 491 },
      { type: 'walking', durationMin: 30.2, avgHR: 162, kcal: 463, cardio: { type: 'walking', durationMin: 30.2, distanceKm: 3.08, paceSec: 577, speedKmh: 6.2, avgHR: 162, maxHR: 173, steps: 3386, cadence: 111, aerobicTE: 4.3, anaerobicTE: 1.7, kcal: 463,
        zones: [{ z: 1, min: 0.1, low: 95 }, { z: 2, min: 1, low: 114 }, { z: 3, min: 2.3, low: 133 }, { z: 4, min: 24.9, low: 152 }, { z: 5, min: 1.9, low: 171 }],
        laps: [{ km: 1, sec: 665, hr: 153 }, { km: 1, sec: 551, hr: 165 }, { km: 1, sec: 549, hr: 168 }] } }],
    sets: [S('BARBELL_BENCH_PRESS', 'BENCH_PRESS', 29, 26), S('BARBELL_BENCH_PRESS', 'BENCH_PRESS', 38, 14), S('SEATED_CABLE_ROW', 'ROW', 50, 10)] },
];
const SEED = { migV: 3, trainDays: [2, 4, 6, 0], logs: { '2026-11-03': { workoutId: 'homeQ', moves: { '臀橋': [{ done: true, reps: 12, weight: null }] }, finishedAt: 3 } } };
const NOW = '2026-11-14T20:00:00+08:00';
const PAGES = [
  { hash: 'today' }, { hash: 'log', open: '[data-testid=log-row-2026-11-14]' }, { hash: 'body' }, { hash: 'sleep' }, { hash: 'shop' }, { hash: 'rules', open: 'summary' },
  { hash: 'today', now: '2026-11-17T09:00:00+08:00', tag: 'today-trainday' },
  { hash: 'today', now: '2026-11-15T21:00:00+08:00', tag: 'today-sunday' },
];
const SEL = 'main button, main [role=button], main a[href], main summary, main select, main input:not([type=hidden]), main [data-go], main label:has(input), nav#tabs button';

async function setup(page, now) {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json(); d.garmin.activities = ACTS; await route.fulfill({ response: r, json: d }); });
  await page.addInitScript((seed) => { localStorage.clear(); localStorage.setItem('fatcat-v2', JSON.stringify(seed)); }, SEED);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
}
let RN = 0;
async function openPage(page, pg) {
  await page.evaluate(() => sessionStorage.clear()).catch(() => {});
  await page.goto(`${BASE}?debug=1&sleep=8&rest=0&r=${++RN}&now=${encodeURIComponent(pg.now || NOW)}#${pg.hash}`);
  await page.waitForSelector('#main *');
  await page.waitForFunction(() => typeof LIVE !== 'undefined' && LIVE.exportedAt && (LIVE.garmin.activities || []).length);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(200);
  if (pg.open) { const o = page.locator(pg.open).first(); if (await o.count()) await o.click(); }
  await page.waitForTimeout(150);
}
// geometry of every interactive element (index = DOM order of SEL among visible ones)
async function survey(page) {
  return page.evaluate((SEL) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('details:not([open]) > :not(summary)'); };
    const all = [...document.querySelectorAll(SEL)].filter((e) => !e.closest('svg'));
    const els = all.filter((e) => vis(e));
    const docBox = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, fixed: !!e.closest('nav#tabs, header') }; };
    return els.map((e, i) => ({ i, anc: els.map((p, j) => (p !== e && (p.contains(e) || e.contains(p))) ? j : -1).filter((j) => j >= 0), label: (e.innerText || e.getAttribute('aria-label') || e.value || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28), tid: e.getAttribute('data-testid') || '', box: docBox(e) }));
  }, SEL);
}
async function nth(page, i) {
  return page.evaluateHandle(([SEL, i]) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('details:not([open]) > :not(summary)'); };
    const all = [...document.querySelectorAll(SEL)].filter((e) => !e.closest('svg'));
    const els = all.filter((e) => vis(e));
    return els[i];
  }, [SEL, i]);
}
const snap = (page) => page.evaluate(() => [location.hash, document.body.className, document.getElementById('main').innerHTML.length + ':' + document.getElementById('main').innerText, localStorage.getItem('fatcat-v2'), !!document.querySelector('.sheet'), document.activeElement && document.activeElement.tagName].join('|'));

test.setTimeout(900000);
test('every interactive element on every page', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await setup(page);
  const results = [];
  for (const pg of PAGES) {
    const tag = pg.tag || pg.hash;
    await openPage(page, pg);
    const items = await survey(page);
    // spacing between interactive elements (same flow; skip pairs inside header/nav)
    const gapFail = new Set();
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const A = items[a].box, B = items[b].box;
      if (A.fixed || B.fixed || items[a].anc.includes(b)) continue;
      const dx = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w));
      const dy = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
      const gap = Math.max(dx, dy);
      if (gap < 8 - 0.5) { gapFail.add(a); gapFail.add(b); results.push({ page: tag, label: `${items[a].label} ↔ ${items[b].label}`, fail: [`gap ${gap.toFixed(1)}px`] }); }
    }
    const chipBoxes = await page.evaluate(() => [...document.querySelectorAll('main .chips')].filter((e) => e.getBoundingClientRect().height > 0 && !e.querySelector('button,[role=button],select')).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, label: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 24) }; }));
    for (const it of items) for (const C of chipBoxes) {
      const A = it.box; if (A.fixed) continue;
      const dx = Math.max(C.x - (A.x + A.w), A.x - (C.x + C.w)); const dy = Math.max(C.y - (A.y + A.h), A.y - (C.y + C.h));
      if (Math.max(dx, dy) < 7.5) results.push({ page: tag, label: `${it.label} ↔ chips「${C.label}」`, fail: [`gap ${Math.max(dx, dy).toFixed(1)}px`] });
    }
    for (const it of items) {
      await openPage(page, pg);
      const h = await nth(page, it.i);
      const fail = [];
      const lab = await h.evaluate((e) => e ? (e.innerText || e.getAttribute('aria-label') || e.value || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 28) : null).catch(() => null);
      const ok = lab === it.label;
      if (!ok) { results.push({ page: tag, label: it.label, fail: [`not found after reload (got ${lab})`] }); continue; }
      await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(30);
      const g = await h.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return { w: r.width, h: r.height, covered: !(top && (top === e || e.contains(top))), by: top ? (top.innerText || top.tagName).slice(0, 20) : null, inView: cy > 0 && cy < innerHeight };
      });
      if (!g.inView) fail.push('not in viewport');
      if (g.covered) fail.push(`covered by "${g.by}"`);
      if (g.w < 40 || g.h < 40) fail.push(`small ${Math.round(g.w)}×${Math.round(g.h)}`);
      const before = await snap(page);
      const e0 = errs.length;
      const tagName = await h.evaluate((e) => e.tagName);
      const disabled = await h.evaluate((e) => !!e.disabled);
      try {
        if (disabled) {}
        else if (tagName === 'SELECT') { const n = await h.evaluate((e) => e.options.length); if (n > 1) await h.selectOption({ index: n - 1 }); }
        else if (tagName === 'INPUT' && /text|number|search|tel/.test(await h.evaluate((e) => e.type))) await h.fill('1');
        else await h.click({ timeout: 3000 });
      } catch (err) { fail.push('click failed: ' + String(err.message).split('\n')[0].slice(0, 60)); }
      await page.waitForTimeout(250);
      const after = await snap(page).catch(() => 'navigated');
      if (errs.length > e0) fail.push('JS error: ' + errs.slice(e0).join('; ').slice(0, 80));
      const effect = disabled ? 'disabled' : before !== after;
      results.push({ page: tag, label: it.label, tid: it.tid, fail, effect });
    }
  }
  // 375 / 430 widths: geometry only (visible, not covered, >=40px, >=8px apart, no horizontal overflow)
  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 932 });
    for (const pg of PAGES) {
      const tag = `${pg.tag || pg.hash}@${width}`;
      await openPage(page, pg);
      const items = await survey(page);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (ov > 1) results.push({ page: tag, label: 'page', fail: [`horizontal overflow ${ov}px`] });
      for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        const A = items[a].box, B = items[b].box;
        if (A.fixed || B.fixed || items[a].anc.includes(b)) continue;
        const gap = Math.max(Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w)), Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h)));
        if (gap < 7.5) results.push({ page: tag, label: `${items[a].label} ↔ ${items[b].label}`, fail: [`gap ${gap.toFixed(1)}px`] });
      }
      for (const it of items) {
        const h = await nth(page, it.i);
        await h.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        const g = await h.evaluate((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: r.width, h: r.height, covered: !(t && (t === e || e.contains(t))), by: t ? (t.innerText || t.tagName).slice(0, 20) : null, right: r.right }; });
        const fail = [];
        if (g.covered) fail.push(`covered by "${g.by}"`);
        if (g.w < 40 || g.h < 40) fail.push(`small ${Math.round(g.w)}×${Math.round(g.h)}`);
        if (g.right > width + 1) fail.push('off screen');
        results.push({ page: tag, label: it.label, fail, effect: 'geometry' });
      }
    }
  }
  fs.writeFileSync('/workspace/fatmi-layout/buttons-report.json', JSON.stringify(results, null, 1));
  const bad = results.filter((r) => r.fail.length);
  const noEffect = results.filter((r) => !r.fail.length && r.effect === false);
  console.log(`checked ${results.filter((r) => 'effect' in r).length} elements; failures ${bad.length}; no visible effect ${noEffect.length}`);
  for (const r of bad) console.log('FAIL', r.page, '|', r.label, '|', r.fail.join(', '));
  for (const r of noEffect) console.log('NOEFFECT', r.page, '|', r.label);
  expect(bad).toEqual([]);
});
