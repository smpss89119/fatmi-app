const { test, expect } = require('@playwright/test');
test('group-photo meals from data.json show on home and count toward rings', async ({ page }) => {
  await page.route('**/data.json*', async (route) => { const r = await route.fetch(); const d = await r.json();
    d.chatMeals = { '2026-11-12': [{ id: 'c1', time: '12:30', name: '雞腿便當（去皮）', kcal: 650, protein: 38 }] };
    await route.fulfill({ response: r, json: d }); });
  await page.goto('http://localhost:43123/staging/?debug=1&sleep=8&now=2026-11-12T13:00:00%2B08:00');
  await expect(page.getByTestId('chat-meal-c1')).toContainText('雞腿便當');
  await expect(page.getByTestId('chat-meal-c1')).toContainText('650');
  const t = await page.evaluate(() => mealTotals(load()));
  expect(t.kcal).toBeGreaterThanOrEqual(650);
  expect(t.protein).toBeGreaterThanOrEqual(38);
  await expect(page.getByTestId('remain')).toContainText(String(1950 - t.kcal));
  await page.getByTestId('eat-card').screenshot({ path: '/workspace/fatmi-audit/chat-meals.png' });
});

test('debug demoMeal param injects a test photo meal', async ({ page }) => {
  await page.goto('http://localhost:43123/staging/?debug=1&demoMeal=1&sleep=8&now=2026-11-12T13:00:00%2B08:00');
  await expect(page.getByTestId('chat-meal-demo')).toContainText('650');
  const t = await page.evaluate(() => mealTotals(load()));
  expect(t.kcal).toBeGreaterThanOrEqual(650);
});
