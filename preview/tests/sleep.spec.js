const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/preview/"}`;
const NOW = "2026-11-07T10:00:00+07:00";
const url = (hash = "sleep") => `${P}?debug=1&sleep=8&now=${encodeURIComponent(NOW)}#${hash}`;
test.use({ viewport: { width: 390, height: 844 } });

function staged(date, deep, core, rem, awake) {
  return { date, sleepHours: (deep + core + rem) / 60, sleep: { start: `${date}T00:30`, end: `${date}T07:30`, deepMin: deep, coreMin: core, remMin: rem, awakeMin: awake, segments: [[0, 60, "core"], [60, 120, "deep"], [120, 180, "rem"], [180, 190, "awake"]] } };
}
const DAILY = [
  staged("2026-11-01", 60, 240, 90, 10),
  staged("2026-11-02", 70, 250, 80, 15),
  { date: "2026-11-03", sleepHours: 6.5 },               // total only, no stages
  // 2026-11-04 missing night entirely
  staged("2026-11-05", 65, 230, 85, 20),
  staged("2026-11-06", 80, 260, 95, 5),
  { date: "2026-11-07", sleepHours: 7.2 },               // latest night: total only
];
async function withData(page, daily) {
  await page.route("**/data.json*", (r) => r.fulfill({ json: { exportedAt: "2026-11-07T09:00:00+07:00", garmin: { daily, activities: [] }, inbody: [], ok: { garmin: true } } }));
}
async function noOverflow(page) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
}

test.describe("SLEEP r5", () => {
  test("night without stages shows total + 無階段資料, never estimated stages", async ({ page }) => {
    await withData(page, DAILY);
    await page.goto(url()); await page.waitForSelector("[data-testid=sleep-page]");
    await expect(page.locator("[data-testid=sleep-total]")).toContainText("7小時 12分");
    await expect(page.locator("[data-testid=sleep-nostage]")).toHaveText("無階段資料");
    await expect(page.locator("[data-testid^=sleep-stage-]")).toHaveCount(0);
    await expect(page.locator("[data-testid=sleep-hypnogram]")).toHaveCount(0);
    await expect(page.locator("[data-testid=sleep-schedule]")).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/fatmi_r5_sleep_nostage.png` : undefined });
    // previous night has Garmin stages
    await page.locator("[data-sleep-step='-1']").click();
    await expect(page.locator("[data-testid=sleep-stage-deep]")).toContainText("1小時 20分");
    await expect(page.locator("[data-testid=sleep-hypnogram]")).toBeVisible();
  });
  test("week chart: 0/2/4/6/8h ticks, missing night is a gap, no-stage night is gray", async ({ page }) => {
    await withData(page, DAILY);
    await page.goto(url()); await page.waitForSelector("[data-testid=sleep-page]");
    await page.locator("[data-testid=sleep-range-W]").click();
    for (const h of [0, 2, 4, 6, 8]) await expect(page.locator(`[data-testid=sleep-tick-${h}]`)).toHaveText(`${h}h`);
    await expect(page.locator("[data-testid=sleep-bars] .sl-avg, .sl-avg .d").first()).toContainText("晚無資料");
    await expect(page.locator("[data-nostage]")).toHaveCount(2);
    await expect(page.locator("[data-testid=sleep-nostage-note]")).toHaveText("灰色＝無階段資料");
    const stagedRects = await page.locator("[data-testid=sleep-bars] svg rect:not(.nostage)").count();
    expect(stagedRects).toBe(4 * 3);
    await noOverflow(page);
    await page.locator("[data-testid=sleep-range-M]").click();
    await expect(page.locator("[data-testid=sleep-tick-8]")).toHaveText("8h");
    await noOverflow(page);
  });
  test("empty state: no sleep data at all", async ({ page }) => {
    await withData(page, []);
    await page.goto(url()); await page.waitForSelector("[data-testid=sleep-page]");
    await expect(page.locator("[data-testid=sleep-empty]")).toHaveText("還沒有睡眠資料");
    await page.locator("[data-testid=sleep-range-W]").click();
    await expect(page.locator("[data-testid=sleep-empty]")).toBeVisible();
    await noOverflow(page);
    await page.goto(url("today")); await page.waitForSelector(".ttl");
    await expect(page.locator("[data-testid=sleep-home]")).toHaveCount(0);
  });
  test("code has no stage estimation fallback", async ({ request }) => {
    const js = await (await request.get(`${P}app.js?t=${Date.now()}`)).text();
    const start = js.indexOf("const SLEEP_COLORS");
    const end = js.indexOf("function renderBody(st)");
    const src = js.slice(start, end);
    expect(src).not.toMatch(/sleepHours\s*\*\s*0\.\d/);         // no ratio-based fake stages
    expect(src).not.toMatch(/deepMin\s*[:=]\s*[^r]/);           // stage minutes are only read, never assigned
  });
});
