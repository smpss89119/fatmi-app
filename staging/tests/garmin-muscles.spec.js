const { test, expect } = require('@playwright/test');
const { fixData } = require('./_fixed-data');
const URL = 'http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-15T10:00:00%2B08:00';
test('every translated Garmin name / category maps to muscles', async ({ page }) => {
  await fixData(page);
  await page.goto(URL); await page.waitForSelector('.ttl');
  const bad = await page.evaluate(() => {
    const out = [];
    const direct = (n) => MOVE_MUSCLES.find((m) => m.keys.some((k) => n.includes(k)));
    for (const [k, v] of Object.entries(GARMIN_EX)) if (!direct(v)) out.push(`EX ${k}→${v}`);
    for (const [k, v] of Object.entries(GARMIN_CAT)) if (!direct(v) && !GARMIN_CAT_MUSCLES[k]) out.push(`CAT ${k}→${v}`);
    return out;
  });
  expect(bad).toEqual([]);
  const got = await page.evaluate(() => {
    const f = (garminName, cat) => { const n = garminExName({ name: garminName, cat }); const m = musclesFor(n); return [n, m.primary.join(','), m.secondary.join(',')]; };
    return {
      backSquat: f('BARBELL_BACK_SQUAT', 'SQUAT'), rdl: f('ROMANIAN_DEADLIFT', 'DEADLIFT'), pulldown: f('LAT_PULLDOWN', 'PULL_UP'),
      pallof: f('PALLOF_PRESS', 'CHOP'), birddog: f('BIRD_DOG', 'HIP_STABILITY'), knee: f('HANGING_KNEE_RAISE', 'LEG_RAISE'),
      chest: f('CHEST_PRESS', 'BENCH_PRESS'), row: f('SEATED_CABLE_ROW', 'ROW'), thrust: f('BARBELL_HIP_THRUST', 'HIP_RAISE'),
      legpress: f('LEG_PRESS', 'SQUAT'), goblet: f('GOBLET_SQUAT', 'SQUAT'),
    };
  });
  expect(got.backSquat).toEqual(['槓鈴背蹲', 'quads,glutes', 'core']);
  expect(got.rdl).toEqual(['羅馬尼亞硬舉', 'glutes,hams', 'lowback']);
  expect(got.pulldown).toEqual(['滑輪下拉', 'lats', 'bis']);
  expect(got.pallof[0]).toBe('抗旋轉推'); expect(got.pallof[1]).toContain('core');
  expect(got.birddog).toEqual(['鳥狗', 'core', 'glutes,lowback']);
  expect(got.knee[0]).toBe('懸吊抬膝'); expect(got.knee[1]).toContain('core');
  expect(got.chest).toEqual(['胸推', 'chest', 'tris,frontDelts']);
  expect(got.row).toEqual(['坐姿划船', 'lats,midback', 'bis,rearDelts']);
  expect(got.thrust).toEqual(['髖推', 'glutes', 'hams']);
  expect(got.legpress).toEqual(['腿推', 'quads,glutes', 'hams']);
  expect(got.goblet).toEqual(['高腳杯深蹲', 'quads,glutes', 'core']);
});
test('unmapped Garmin exercise falls back by category; chart never empty', async ({ page }) => {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json();
    d.garmin.activities = [{ type: 'strength_training', date: '2026-11-15', startTime: '2026-11-15 09:00:00', durationMin: 30, avgHR: 110, kcal: 200, name: '肌力訓練',
      sets: [{ name: 'ZERCHER_SQUAT_XYZ', cat: 'SQUAT', kg: 40, reps: 8 }, { name: 'WEIRD_PULL', cat: 'PULL_UP', kg: null, reps: 6 }, { name: 'MYSTERY_MOVE', cat: 'NEW_CATEGORY', kg: null, reps: 10 }] }];
    await route.fulfill({ response: r, json: d }); });
  await page.goto(URL + '#log');
  await page.getByTestId('log-row-2026-11-15').click();
  const parts = page.getByTestId('log-parts-2026-11-15');
  await expect(parts).toContainText('股四頭 1 組');
  await expect(parts).toContainText('背闊 1 組');
  await expect(parts).toContainText('核心');
  await expect(page.getByTestId('log-muscles-2026-11-15')).not.toContainText('主要：—');
});
