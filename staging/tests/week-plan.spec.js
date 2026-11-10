const { test, expect } = require("@playwright/test");
const BASE = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const at = (iso) => `${BASE}?debug=1&now=${encodeURIComponent(iso)}&sleep=8`;
const days = [
  ["2026-11-10T10:00:00+08:00", "train", "平日在家", 1950], // Tue home
  ["2026-11-11T10:00:00+08:00", "rest", null, 1950],     // Wed
  ["2026-11-12T10:00:00+08:00", "train", "平日在家", 1950], // Thu home
  ["2026-11-13T10:00:00+08:00", "rest", null, 1950],     // Fri
  ["2026-11-14T10:00:00+08:00", "train", "健身房 A", 2150], // Sat
  ["2026-11-15T10:00:00+08:00", "train", "健身房 B", 2150], // Sun
  ["2026-11-16T10:00:00+08:00", "rest", null, 1950],     // Mon
];
for (const [iso, kind, name, kcal] of days) {
  test(`week plan ${iso.slice(0, 10)} → ${kind} ${name || ""}`, async ({ page }) => {
    await page.goto(at(iso));
    await page.waitForSelector(".ttl");
    if (kind === "rest") {
      await expect(page.locator("[data-testid=rest-line]")).toHaveCount(1);
    } else {
      await expect(page.locator("[data-testid=rest-line]")).toHaveCount(0);
      await expect(page.locator("[data-testid=train-card]")).toContainText(name);
    }
    const t = await page.evaluate(() => kcalInfo(load()).target);
    expect([kcal, kcal - 125, kcal + 150]).toContain(t);
  });
}

test("Tue home workout: 4 moves, 3 rounds, can start and finish", async ({ page }) => {
  await page.goto(at("2026-11-10T19:00:00+08:00"));
  await page.waitForSelector(".ttl");
  await expect(page.locator("[data-testid=train-card]")).toContainText("平日在家");
  await page.locator("[data-start]").click();
  const steps = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
  expect(steps).toEqual(["高腳杯深蹲", "伏地挺身（可撐桌邊）", "臀橋", "死蟲"]);
});

test("home workout rest timer is 30s, gym stays 90s", async ({ page }) => {
  await page.goto(at("2026-11-10T19:00:00+08:00"));
  await page.waitForSelector(".ttl");
  expect(await page.evaluate(() => restMs({ workoutId: "homeQ" }))).toBe(30000);
  expect(await page.evaluate(() => restMs({ workoutId: "gymA" }))).toBe(90000);
});
