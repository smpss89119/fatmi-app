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
  await expect(page.getByTestId('log-cardio-sum-2026-11-14')).toContainText('🚶 健走 30 分鐘・3.08 公里・平均心率 162・大多在 Z4（很喘）82%');
  await expect(page.getByTestId('log-row-2026-11-12')).toContainText('🫀');
  await expect(page.getByTestId('log-row-2026-11-12')).not.toContainText('未記動作');
  await page.getByTestId('log-row-2026-11-14').click();
  const card = page.getByTestId('cardio-2026-11-14-0');
  await expect(card).toContainText('距離3.08 公里');
  await expect(card).toContainText('配速每公里 9分37秒');
  await expect(card).toContainText('速度時速 6.2 公里');
  await expect(card).toContainText('步頻每分鐘 111 步');
  await expect(card).toContainText('消耗463 大卡');
  await expect(card).toContainText('心率平均 162／最高 173');
  await expect(card).toContainText('步數3386 步');
  await expect(card).toContainText('有氧效果 4.3 大幅提升／無氧效果 1.7 輕微');
  await expect(card).toContainText('心率區間');
  await expect(card).toContainText('每公里配速與心率');
  await expect(card.getByTestId('cardio-laps')).toContainText('心率 153');
  await expect(card.getByTestId('cardio-laps')).toContainText('配速 11分5秒');
  await expect(card).toContainText('第 1 公里');
  await expect(page.getByTestId('zone-2026-11-14-0-4')).toContainText('Z4 乳酸閾心率 152–17025 分鐘82%很喘，講話斷斷續續');
  await expect(page.getByTestId('zone-2026-11-14-0-4')).toHaveClass(/big/);
  await expect(page.getByTestId('zone-2026-11-14-0-2')).toContainText('Z2 燃脂心率 114–132');
  await expect(page.getByTestId('zone-2026-11-14-0-5')).toContainText('171+');
  await expect(page.getByTestId('zone-2026-11-14-0-2')).toContainText('輕鬆可聊天，燃脂最佳');
  const labels = await card.getByTestId('cd-tile').locator('em').allInnerTexts();
  for (const l of labels) expect(l).toMatch(/[\u4e00-\u9fff]{2}/);
  await expect(page.getByTestId('cardio-tip-2026-11-14-0')).toContainText('太高了');
  await expect(card.getByTestId('cardio-laps').locator('.cd-lap')).toHaveCount(3);
  await expect(card).not.toContainText('⛰');
  // nothing in the card may be cut off (no ellipsis, no clipped overflow)
  const cut = await card.evaluate((root) => [...root.querySelectorAll('*')].filter((e) => {
    const cs = getComputedStyle(e);
    if (!e.textContent.trim() || e.children.length > 2) return false;
    return cs.textOverflow === 'ellipsis' || e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' || e.getBoundingClientRect().right > root.getBoundingClientRect().right + 1;
  }).map((e) => e.textContent.trim().slice(0, 30)));
  expect(cut).toEqual([]);
  await page.getByTestId('log-row-2026-11-12').click();
  await expect(page.getByTestId('cardio-tip-2026-11-12-0')).toContainText('Z2–Z3（燃脂、有氧）');
  await expect(page.getByTestId('log-detail-2026-11-12')).not.toContainText('練了哪一套');
  await page.goto('http://127.0.0.1:43123/staging/?debug=1&sleep=8&now=2026-11-14T23:58:00%2B08:00&r=2#today');
  await expect(page.getByTestId('week-cardio')).toContainText('本週有氧 50 分鐘，其中燃脂區（Z2）16 分鐘、偏喘（Z4 以上）27 分鐘');
  expect(errs).toEqual([]);
});
