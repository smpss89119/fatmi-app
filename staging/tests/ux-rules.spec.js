const { test, expect } = require("@playwright/test");
const { fixData } = require("./_fixed-data");
test.beforeEach(async ({ page }) => { await fixData(page); });
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const SUN = "2026-11-15T18:00:00+08:00";
const u = (h = "today") => `${P}?debug=1&rest=5&sleep=8&now=${encodeURIComponent(SUN)}#${h}`;

test("rest timer: primary = 休息好了 (skip rest), undo is a separate clearly-labelled action", async ({ page }) => {
  await page.goto(u()); await page.waitForSelector(".ttl");
  await page.locator("[data-start]").first().click();
  await page.locator("[data-complete]").click();
  const primary = page.locator(".rest-box .btn.primary");
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAttribute("data-skip-rest", "");
  await expect(primary).not.toContainText("完成");
  const undo = page.locator("[data-undo-set]");
  await expect(undo).toContainText("撤銷這一組");
  await expect(undo).not.toHaveClass(/primary/);
  await primary.click();
  await expect(page.locator(".wo-prog")).toContainText("第 2 / 3 組");
  // undo really undoes (back to set 2 → set 1 after completing set 2 then undoing)
  await page.locator("[data-complete]").click();
  await page.locator("[data-undo-set]").click();
  await expect(page.locator(".wo-prog")).toContainText("第 2 / 3 組");
});

for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`workout: weight + 完成 above the fold, map collapsed (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto(u()); await page.waitForSelector(".ttl");
    await page.locator("[data-start]").first().click();
    await page.locator("[data-complete]").waitFor();
    const c = await page.locator("[data-complete]").boundingBox();
    const w = await page.locator("[data-testid=wo-weight]").boundingBox();
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height);
    expect(w.y + w.height).toBeLessThanOrEqual(vp.height);
    await expect(page.locator("[data-testid=wo-figure]")).toBeHidden();
  });
}

test("meal times are 24h text (16:00, never 04:00 PM)", async ({ page }) => {
  await page.goto(u()); await page.waitForSelector(".ttl");
  const shown = await page.locator(".meal-time .mt-24").allInnerTexts();
  expect(shown.length).toBeGreaterThan(0);
  for (const t of shown) expect(t).toMatch(/^\d{2}:\d{2}$/);
  expect(shown).toContain("16:00");
  const txt = await page.locator("main").innerText();
  expect(txt).not.toMatch(/\b(AM|PM)\b|上午|下午/);
  // native picker still works, label updates in 24h
  await page.locator("[data-testid=meal-time-dinner]").fill("19:05");
  await page.locator("[data-testid=meal-time-dinner]").dispatchEvent("change");
  await expect(page.locator("[data-testid=meal-time-label-dinner] .mt-24")).toHaveText("19:05");
});

test("dark mode follows prefers-color-scheme; light stays light", async ({ page }) => {
  for (const [scheme, dark] of [["dark", true], ["light", false]]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(u() + "&s=" + scheme); await page.waitForSelector(".ttl");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect((r + g + b) / 3 < 60).toBe(dark);
  }
});

test("orange 不足/偏低 tag contrast >= 4.5:1 (light + dark)", async ({ page }) => {
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(u() + "&c=" + scheme); await page.waitForSelector(".ttl");
    const pairs = await page.$$eval(".chip.low", (els) => els.map((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor]; }));
    expect(pairs.length).toBeGreaterThan(0);
    for (const [fg, bg] of pairs) {
      const a = lum(fg.match(/\d+/g).slice(0, 3).map(Number)), b = lum(bg.match(/\d+/g).slice(0, 3).map(Number));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio, `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("quick version shows its trigger reason in plain words", async ({ page }) => {
  await page.goto(`${P}?debug=1&sleep=5&now=${encodeURIComponent(SUN)}#today`); await page.waitForSelector(".ttl");
  await expect(page.locator("[data-testid=quick-reason]")).toHaveText("改快版：昨晚睡 5 小時，未滿 6 小時");
  await page.goto(`${P}?debug=1&sleep=8&now=${encodeURIComponent(SUN)}#today`); await page.waitForSelector(".ttl");
  await expect(page.locator("[data-testid=quick-reason]")).toHaveCount(0);
});

test("吃了別的: 儲存 stays on screen (sticky above the tab bar)", async ({ page }) => {
  await page.goto(u()); await page.waitForSelector(".ttl");
  await page.locator("[data-eat-else]").first().click();
  await page.locator("[data-else-inc]").first().click();
  const b = await page.locator("[data-else-save]").boundingBox();
  const nav = await page.locator("nav#tabs").boundingBox();
  expect(b.y + b.height).toBeLessThanOrEqual(nav.y);
});

test("sleep page: dark tab bar, 「← 回到今天」 back", async ({ page }) => {
  await page.goto(u("sleep")); await page.waitForSelector(".sleep-page");
  await expect(page.locator(".sl-back")).toHaveText("← 回到今天");
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector("nav#tabs")).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
});

test("toast sits at the top, never over the restore input", async ({ page }) => {
  await page.goto(u("rules")); await page.waitForSelector(".ttl");
  await page.locator("[data-backup-toggle]").click();
  await page.locator("[data-restore-in]").fill("bad");
  await page.locator("[data-backup-restore]").click();
  const t = await page.locator(".toast").boundingBox(), i = await page.locator("[data-restore-in]").boundingBox();
  expect(t.y).toBeLessThan(200);
  expect(t.y + t.height <= i.y || t.y >= i.y + i.height).toBe(true);
});
