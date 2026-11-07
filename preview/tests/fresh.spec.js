const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/preview/"}`;
const u = (now) => `${P}?debug=1&rest=0&sleep=8&now=${encodeURIComponent(now)}`;
const TUE = "2026-11-10T10:00:00+07:00";
const FRI = "2026-11-13T10:00:00+07:00";
async function jump(page, i) {
  await page.evaluate((n) => {
    const s = JSON.parse(localStorage.getItem("fatcat-v2"));
    s.session.i = n; s.session.setI = 0; s.session.editWeight = null; s.session.phase = "set";
    localStorage.setItem("fatcat-v2", JSON.stringify(s));
    location.hash = "today"; location.hash = "workout";
  }, i);
  await page.waitForTimeout(80);
}
async function fullWorkout(page, scores = {}) {
  for (let i = 0; i < 200; i++) {
    const any = page.locator("[data-finish-home], [data-exback], [data-skip-rest], [data-complete]").first();
    await any.waitFor({ state: "visible", timeout: 5000 });
    if (await page.locator("[data-finish-home]").isVisible()) break;
    if (await page.locator("[data-exback='0']").isVisible()) {
      const name = (await page.locator("[data-testid=exback] .k").innerText()).trim();
      await page.locator(`[data-exback='${scores[name] ?? 0}']`).click();
      continue;
    }
    const skip = page.locator("[data-skip-rest]");
    if (await skip.isVisible()) { await skip.click({ timeout: 2000 }).catch(() => {}); continue; }
    await page.locator("[data-complete]").click({ timeout: 2000 }).catch(() => {});
  }
  await page.locator("[data-finish-home]").click();
}
test.describe("FRESH (empty storage)", () => {
  test("a) 胸推 and 臀橋 show a starting weight with no history", async ({ page }) => {
    await page.goto(u(TUE)); await page.waitForSelector(".ttl");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2") || "{}").logs)).toBeFalsy();
    await page.locator("[data-start]").click();
    const steps = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    for (const want of ["胸推", "臀橋"]) {
      const i = steps.findIndex((n) => n.includes(want));
      expect(i).toBeGreaterThanOrEqual(0);
      await jump(page, i);
      const w = (await page.locator("[data-testid=wo-weight]").innerText()).trim();
      expect(w).toMatch(/^\d+(\.\d)? kg$/);
    }
  });
  test("b) last-used weight carries to next session", async ({ page }) => {
    await page.goto(u(TUE)); await page.waitForSelector(".ttl");
    await page.locator("[data-start]").click();
    await page.locator("[data-testid=w-plus]").click();
    await page.locator("[data-testid=w-plus]").click();
    const used = (await page.locator("[data-testid=wo-weight]").innerText()).trim();
    await fullWorkout(page);
    await page.goto(u(FRI)); await page.waitForSelector(".ttl");
    await page.locator("[data-start]").click();
    const steps = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    await jump(page, steps.findIndex((n) => n.includes("腿推")) >= 0 ? steps.findIndex((n) => n.includes("腿推")) : 0);
    if (steps.some((n) => n.includes("腿推"))) {
      await expect(page.locator("[data-testid=wo-weight]")).toHaveText(used);
    }
    const lastLoads = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).lastLoads);
    expect(Object.keys(lastLoads).length).toBeGreaterThanOrEqual(5);
    expect(Object.values(lastLoads).some((v) => `${v.weight} kg` === used)).toBe(true);
  });
  test("c) back swap only for the scored exercise, fresh storage", async ({ page }) => {
    await page.goto(u(TUE)); await page.waitForSelector(".ttl");
    await page.locator("[data-start]").click();
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    const chest = first.find((n) => n.includes("胸推"));
    await fullWorkout(page, { [chest]: 4 });
    const sw = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).backSwap);
    expect(Object.keys(sw)).toHaveLength(1);
    // next gymA (Tue next week)
    await page.goto(u("2026-11-17T10:00:00+07:00")); await page.waitForSelector(".ttl");
    await page.locator("[data-start]").click();
    const next = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")).session.steps.map((s) => s.name));
    expect(next.filter((n, i) => n !== first[i])).toEqual(["地板臥推"]);
  });
  test("d) long-press a session -> 刪除這筆 removes only that workout", async ({ page }) => {
    await page.goto(u(TUE)); await page.waitForSelector(".ttl");
    await page.evaluate(() => {
      localStorage.setItem("fatcat-v2", JSON.stringify({
        logs: { "2026-11-10": { workoutId: "gymA", finishedAt: 1, moves: { 腿推: [{ done: true, weight: 60, reps: 10 }] } } },
        lastLoads: { 腿推: { weight: 60, reps: 10, date: "2026-11-10" } },
        backSwap: { 胸推: { to: "地板臥推", date: "2026-11-10" } },
        mealLogs: { "2026-11-10": { snack: { eaten: true } } },
        shopChecked: { chicken: true },
      }));
    });
    await page.goto(u(TUE) + "#body"); await page.waitForSelector("[data-testid=log-row-2026-11-10]");
    page.on("dialog", (d) => d.accept());
    const row = page.locator("[data-testid=log-row-2026-11-10]");
    await page.evaluate(() => document.querySelector("[data-testid=log-row-2026-11-10]").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await page.waitForTimeout(900);
    await expect(row).toHaveCount(0);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2")));
    expect(s.logs["2026-11-10"]).toBeUndefined();
    expect(Object.keys(s.lastLoads || {})).toHaveLength(0);
    expect(Object.keys(s.backSwap || {})).toHaveLength(0);
    expect(s.mealLogs["2026-11-10"].snack.eaten).toBe(true);
    expect(s.shopChecked.chicken).toBe(true);
  });
});
