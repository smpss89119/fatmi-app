const { test, expect } = require('@playwright/test');
test('Garmin workout today marks trained', async ({ page }) => {
  await page.route('**/data.json*', async (route) => {
    const r = await route.fetch(); const d = await r.json();
    d.garmin.activities = [{ type: 'strength_training', date: '2026-11-10', startTime: '2026-11-10 23:26:25', durationMin: 16.4, avgHR: 98, kcal: 102, name: '肌力訓練' }];
    await route.fulfill({ response: r, json: d });
  });
  await page.goto('http://localhost:43123/staging/?debug=1&sleep=8&now=2026-11-10T23:50:00%2B08:00');
  await expect(page.getByTestId('trained-today')).toBeVisible();
  await expect(page.getByTestId('garmin-done')).toContainText('16.4 分');
  await page.screenshot({ path: '/workspace/fatmi-audit/garmin-done.png' });
});

test('Garmin-only day: one tap backfills planned workout into muscle sets', async ({ page }) => {
  await page.route('**/data.json*', async (route) => {
    const r = await route.fetch(); const d = await r.json();
    d.garmin.activities = [{ type: 'strength_training', date: '2026-11-10', durationMin: 16.4, avgHR: 98, kcal: 102, name: '肌力訓練' }];
    await route.fulfill({ response: r, json: d });
  });
  await page.goto('http://localhost:43123/staging/?debug=1&sleep=8&now=2026-11-10T23:50:00%2B08:00');
  const before = await page.evaluate(() => weekSetCounts(load()));
  await expect(page.getByTestId('backfill')).toContainText('平日在家');
  await page.getByTestId('backfill').click();
  await expect(page.getByTestId('backfill')).toHaveCount(0);
  await expect(page.getByTestId('trained-today')).toBeVisible();
  const log = await page.evaluate(() => load().logs['2026-11-10']);
  expect(log.workoutId).toBe('homeQ');
  expect(Object.keys(log.moves).length).toBe(4);
  expect(log.garmin.durationMin).toBe(16.4);
  const after = await page.evaluate(() => weekSetCounts(load()));
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  expect(sum(after)).toBeGreaterThan(sum(before));
  console.log('AFTER', JSON.stringify(after));
  await page.reload();
  await expect(page.getByTestId('trained-today')).toBeVisible();
  await expect(page.getByTestId('backfill')).toHaveCount(0);
  await page.screenshot({ path: '/workspace/fatmi-audit/backfill-done.png', fullPage: true });
});
