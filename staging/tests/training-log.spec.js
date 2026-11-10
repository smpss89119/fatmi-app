const { test, expect } = require('@playwright/test');
const ACTS = [
  { type: 'multi_sport', date: '2026-10-18', durationMin: 42.7, avgHR: null, kcal: 478, name: '複合式運動' },
  { type: 'strength_training', date: '2026-11-10', durationMin: 16.4, avgHR: 98, kcal: 102, name: '肌力訓練' },
];
test.beforeEach(async ({ page }) => {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json();
    d.garmin.activities = ACTS; await route.fulfill({ response: r, json: d }); });
});
test('training log lists every Garmin workout, backfill shows moves + muscles, persists', async ({ page }) => {
  await page.goto('http://localhost:43123/staging/?debug=1&sleep=8&now=2026-11-11T00:10:00%2B08:00');
  await page.getByTestId('go-log').click();
  await expect(page.getByTestId('log-row-2026-11-10')).toContainText('未記動作');
  await expect(page.getByTestId('log-row-2026-10-18')).toBeVisible();
  await page.getByTestId('log-row-2026-11-10').click();
  await expect(page.getByTestId('log-garmin-2026-11-10')).toContainText('16.4 分');
  await expect(page.getByTestId('log-backfill-homeQ')).toHaveClass(/primary/);
  await page.getByTestId('log-backfill-homeQ').click();
  await expect(page.getByTestId('log-row-2026-11-10')).toContainText('12 組');
  const det = page.getByTestId('log-detail-2026-11-10');
  await expect(det).toContainText('高腳杯深蹲');
  await expect(det).toContainText('死蟲');
  await expect(page.getByTestId('log-muscles-2026-11-10')).toContainText('臀');
  await expect(det.locator('.body-svg, svg').first()).toBeVisible();
  await page.screenshot({ path: '/workspace/fatmi-audit/log-detail.png', fullPage: true });
  await page.reload();
  await expect(page.getByTestId('log-row-2026-11-10')).toContainText('12 組');
  await page.getByTestId('log-row-2026-10-18').click();
  await expect(page.getByTestId('log-detail-2026-10-18')).toContainText('沒在 App 勾動作');
  await page.getByTestId('log-backfill-gymA').click();
  await expect(page.getByTestId('log-row-2026-10-18')).not.toContainText('未記動作');
  const ids = await page.evaluate(() => [load().logs['2026-10-18'].workoutId, load().logs['2026-11-10'].workoutId]);
  expect(ids).toEqual(['gymA', 'homeQ']);
});
