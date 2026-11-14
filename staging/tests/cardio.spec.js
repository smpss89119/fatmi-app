const { test, expect } = require('@playwright/test');
const WALK = { type: 'walking', durationMin: 30.2, distanceKm: 3.08, paceSec: 577, speedKmh: 6.2, avgHR: 162, maxHR: 173, steps: 3386, cadence: 111, aerobicTE: 4.3, anaerobicTE: 1.7, kcal: 463,
  zones: [{ z: 1, min: 0.1, low: 95 }, { z: 2, min: 1, low: 114 }, { z: 3, min: 2.3, low: 133 }, { z: 4, min: 24.9, low: 152 }, { z: 5, min: 1.9, low: 171 }],
  laps: [{ km: 1, sec: 665, hr: 153 }, { km: 1, sec: 551, hr: 165 }, { km: 1, sec: 549, hr: 168 }, { km: 0.08, sec: 46, hr: 168 }] };
const ACTS = [
  { type: 'multi_sport', date: '2026-11-14', startTime: '2026-11-14 21:33:07', durationMin: 95.4, avgHR: null, kcal: 954, name: '複合式運動',
    children: [{ type: 'strength_training', durationMin: 65.2, avgHR: 114, kcal: 491 }, { type: 'walking', durationMin: 30.2, avgHR: 162, kcal: 463, cardio: WALK }],
    sets: [{ name: 'BARBELL_BENCH_PRESS', cat: 'BENCH_PRESS', kg: 29, reps: 26 }] },
  { type: 'running', date: '2026-11-12', startTime: '2026-11-12 07:00:00', durationMin: 20, avgHR: 140, kcal: 200, name: '跑步',
    cardio: { type: 'running', durationMin: 20, distanceKm: 3, avgHR: 125, zones: [{ z: 1, min: 2, low: 95 }, { z: 2, min: 15, low: 114 }, { z: 3, min: 3, low: 133 }, { z: 4, min: 0, low: 152 }, { z: 5, min: 0, low: 171 }] } },
];
test.beforeEach(async ({ page }) => {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json(); d.garmin.activities = ACTS; await route.fulfill({ response: r, json: d }); });
});
test('cardio card: zones prominent, stats, laps; header summary; weekly cardio on home', async ({ page }) => {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T23:58:00%2B08:00#log');
  await expect(page.getByTestId('log-cardio-sum-2026-11-14')).toContainText('🚶 健走 30 分 · 3.08 km · ❤️ 162 · 多在 Z4 乳酸閾 82%');
  await expect(page.getByTestId('log-row-2026-11-12')).toContainText('🫀');
  await expect(page.getByTestId('log-row-2026-11-12')).not.toContainText('未記動作');
  await page.getByTestId('log-row-2026-11-14').click();
  const card = page.getByTestId('cardio-2026-11-14-0');
  await expect(card).toContainText('3.08');
  await expect(card).toContainText(`9'37"`);
  await expect(card).toContainText('162/173');
  await expect(card).toContainText('3386');
  await expect(card).toContainText('4.3/1.7');
  await expect(page.getByTestId('zone-2026-11-14-0-4')).toContainText('Z4 乳酸閾152–17025 分82%');
  await expect(page.getByTestId('zone-2026-11-14-0-4')).toHaveClass(/big/);
  await expect(page.getByTestId('zone-2026-11-14-0-2')).toContainText('Z2 燃脂114–132');
  await expect(page.getByTestId('zone-2026-11-14-0-5')).toContainText('171+');
  await expect(page.getByTestId('cardio-tip-2026-11-14-0')).toContainText('偏高');
  await expect(card.getByTestId('cardio-laps').locator('.cd-lap')).toHaveCount(3);
  await expect(card).not.toContainText('⛰');
  await page.getByTestId('log-row-2026-11-12').click();
  await expect(page.getByTestId('cardio-tip-2026-11-12-0')).toContainText('Z2–Z3');
  await expect(page.getByTestId('log-detail-2026-11-12')).not.toContainText('練了哪一套');
  await page.goto('http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T23:58:00%2B08:00&r=2#today');
  await expect(page.getByTestId('week-cardio')).toContainText('本週有氧 50 分 · Z2 以上 48 分 · 燃脂 Z2 16 分');
  expect(errs).toEqual([]);
});
