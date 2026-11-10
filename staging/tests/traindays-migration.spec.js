const { test, expect } = require("@playwright/test");
const BASE = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const TUE_10 = "2026-11-10T10:00:00+08:00";

test("stale stored trainDays [1,4] → Tuesday is a training day after load (one-time)", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("fatcat-v2", JSON.stringify({ trainDays: [1, 4], grocery: { chicken: true } }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto(`${BASE}?debug=1&now=${encodeURIComponent(TUE_10)}&sleep=8`);
  await page.waitForSelector(".ttl");
  await expect(page.locator("[data-testid=rest-line]")).toHaveCount(0);
  await expect(page.locator("[data-testid=train-card]")).toContainText("A");
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")));
  expect(s.trainDays).toEqual([2, 5]);
  expect(s.migV).toBe(1);
  expect(s.grocery).toEqual({ chicken: true });
  // runs once: a later change is not overwritten
  await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("fatcat-v2"));
    o.trainDays = [3]; localStorage.setItem("fatcat-v2", JSON.stringify(o));
  });
  await page.reload();
  await page.waitForSelector(".ttl");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).trainDays)).toEqual([3]);
});

test("restored backup with stale trainDays gets migrated", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}?debug=1&now=${encodeURIComponent(TUE_10)}&sleep=8#rules`);
  await p.waitForSelector("[data-testid=backup-card]");
  await p.locator("[data-backup-toggle]").click();
  const data = { "fatcat-v2": JSON.stringify({ trainDays: [1, 4], migV: 1, grocery: { eggs: true } }) };
  const code = "FATMI1:" + Buffer.from(JSON.stringify(data)).toString("base64");
  await p.getByTestId("restore-input").fill(code);
  p.once("dialog", (d) => d.accept());
  const nav = p.waitForEvent("load");
  await p.getByRole("button", { name: "貼上還原" }).click();
  await nav;
  await p.waitForSelector(".ttl");
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")));
  expect(s.trainDays).toEqual([2, 5]);
  expect(s.grocery).toEqual({ eggs: true });
  await p.goto(`${BASE}?debug=1&now=${encodeURIComponent(TUE_10)}&sleep=8#today`);
  await p.waitForSelector(".ttl");
  await expect(p.locator("[data-testid=rest-line]")).toHaveCount(0);
  await ctx.close();
});
