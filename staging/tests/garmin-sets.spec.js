const { test, expect } = require('@playwright/test');
const S = (name, cat, kg, reps) => ({ name, cat, kg, reps });
const ACTS = [
  { type: 'strength_training', date: '2026-11-10', startTime: '2026-11-10 23:26:25', durationMin: 16.4, avgHR: 98, kcal: 102, name: '肌力訓練',
    sets: [S('GOBLET_SQUAT','SQUAT',13.5,10), S(null,'PUSH_UP',null,10), S(null,'HIP_RAISE',null,10), S('WEIGHTED_DEAD_BUG','HIP_STABILITY',null,24),
           S('GOBLET_SQUAT','SQUAT',13.5,12), S(null,'PUSH_UP',null,10), S(null,'HIP_RAISE',null,12), S('WEIGHTED_DEAD_BUG','HIP_STABILITY',null,24)] },
  { type: 'multi_sport', date: '2026-11-14', startTime: '2026-11-14 21:33:07', durationMin: 95.4, avgHR: null, kcal: 954, name: '複合式運動',
    children: [{ type: 'strength_training', durationMin: 65.2, avgHR: 114, kcal: 491 }, { type: 'walking', durationMin: 30.2, avgHR: 162, kcal: 463 }],
    sets: [S('BARBELL_BENCH_PRESS','BENCH_PRESS',29,26), S('BARBELL_BENCH_PRESS','BENCH_PRESS',38,14), S('BARBELL_BENCH_PRESS','BENCH_PRESS',38,11), S('BARBELL_BENCH_PRESS','BENCH_PRESS',38,13),
           S('INCLINE_BARBELL_BENCH_PRESS','BENCH_PRESS',38,9), S('INCLINE_BARBELL_BENCH_PRESS','BENCH_PRESS',29,13), S('INCLINE_BARBELL_BENCH_PRESS','BENCH_PRESS',29,13), S('INCLINE_BARBELL_BENCH_PRESS','BENCH_PRESS',29,10), S('INCLINE_BARBELL_BENCH_PRESS','BENCH_PRESS',29,8),
           S('SEATED_CABLE_ROW','ROW',27.5,33), S('SEATED_CABLE_ROW','ROW',42.5,21), S('SEATED_CABLE_ROW','ROW',50,10), S('SEATED_CABLE_ROW','ROW',50,10), S('SEATED_CABLE_ROW','ROW',50,11), S('SEATED_CABLE_ROW','ROW',50,13)] },
];
// Reproduce the phone: 11/14 got 健身房 A 4 輪 via template backfill, 11/10 had 健身房 A too; migV 2.
function gymA4() {
  const names = ['腿推或高腳杯深蹲','胸推或啞鈴臥推','臀橋或髖推','坐姿啞鈴肩推','坐姿划船','死蟲'];
  return Object.fromEntries(names.map((n) => [n, Array.from({ length: 4 }, () => ({ weight: null, reps: 10, done: true }))]));
}
test.beforeEach(async ({ page }) => {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json();
    d.garmin.activities = ACTS; await route.fulfill({ response: r, json: d }); });
  await page.addInitScript((seed) => { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); if (seed) localStorage.setItem('fatcat-v2', JSON.stringify(seed)); } }, {
    migV: 2, trainDays: [2, 4, 6, 0], other: 'keep-me',
    logs: { '2026-11-14': { workoutId: 'gymA', moves: gymA4(), backfill: true, finishedAt: 1 }, '2026-11-10': { workoutId: 'gymA', moves: gymA4(), backfill: true, finishedAt: 2 }, '2026-11-03': { workoutId: 'homeQ', moves: { '臀橋': [{ done: true, reps: 12 }] }, finishedAt: 3 } },
  });
});
test('Garmin sets replace template; 11/10 and 11/14 stay separate; migration keeps data', async ({ page }) => {
  await page.goto('http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T23:58:00%2B08:00#log');
  const st = await page.evaluate(() => load());
  expect(st.migV).toBe(3);
  expect(st.other).toBe('keep-me');
  expect(st.logs['2026-11-03']).toBeTruthy();
  expect(st.logs['2026-11-14']).toBeFalsy();
  expect(st.logs['2026-11-10'].workoutId).toBe('homeQ');
  expect(Object.values(st.logs['2026-11-10'].moves).every((x) => x.length === 2)).toBe(true);
  expect(st.logsBackup['2026-11-14@m3'].workoutId).toBe('gymA');
  expect(st.logsBackup['2026-11-10@m3'].workoutId).toBe('gymA');
  await expect(page.getByTestId('log-row-2026-11-14')).toContainText('15 組');
  await expect(page.getByTestId('log-row-2026-11-14')).not.toContainText('健身房 A');
  await expect(page.getByTestId('log-row-2026-11-10')).toContainText('8 組');
  await page.getByTestId('log-row-2026-11-14').click();
  const det = page.getByTestId('log-detail-2026-11-14');
  await expect(det).toContainText('槓鈴臥推');
  await expect(det).toContainText('上斜槓鈴臥推');
  await expect(det).toContainText('坐姿划船');
  await expect(det).toContainText('29 kg×26 · 38 kg×14 · 38 kg×11 · 38 kg×13');
  await expect(det).not.toContainText('做了幾輪');
  await expect(det).not.toContainText('腿推');
  await expect(det.locator('[data-backfill]')).toHaveCount(0);
  await expect(page.getByTestId('log-parts-2026-11-14')).toContainText('胸 9 組');
  await expect(page.getByTestId('log-parts-2026-11-14')).toContainText('背闊 6 組');
  await page.screenshot({ path: '/workspace/fatmi-garmin-sets/log-1114.png', fullPage: true });
  await page.getByTestId('log-row-2026-11-10').click();
  const d10 = page.getByTestId('log-detail-2026-11-10');
  await expect(d10).toContainText('高腳杯深蹲');
  await expect(d10).toContainText('13.5 kg×10 · 13.5 kg×12');
  await expect(d10).not.toContainText('臥推');
  await page.screenshot({ path: '/workspace/fatmi-garmin-sets/log-1110.png', fullPage: true });
  await page.goto('http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T23:58:00%2B08:00');
  await expect(page.getByTestId('garmin-sets-today')).toContainText('15 組');
  await expect(page.getByTestId('backfill')).toHaveCount(0);
  // week = 11/10 (伏地挺身 2 → 胸) + 11/14 (臥推 9) = 胸 11
  await expect(page.getByTestId('week-chip-chest')).toContainText('胸 11 組');
  await expect(page.getByTestId('week-chip-lats')).toContainText('背闊 6 組');
  await page.screenshot({ path: '/workspace/fatmi-garmin-sets/home.png', fullPage: true });
});
