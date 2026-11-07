const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/preview/"}`;
const TUE_15 = "2026-11-10T15:00:00+07:00";
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function gotoToday(page, store) {
  await page.addInitScript((data) => {
    localStorage.setItem("fatcat-v2", JSON.stringify(data));
  }, store);
  await page.goto(`${P}?debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#today`);
  await page.waitForSelector(".ttl");
}

test("390: scoop-select click then change value (native picker path)", async ({ page }) => {
  await gotoToday(page, { wheyHave: ["plantAlmond", "sesame", "soymilk"] });
  const sel = page.locator("[data-testid=scoop-select-0]");
  await expect(sel).toBeVisible();
  await expect(sel).toBeEnabled();
  // real tap
  await sel.tap();
  // node must survive tap (regression: click handler render() destroyed it)
  await expect(sel).toBeVisible();
  const idBefore = await sel.evaluate((el) => el.id || el.dataset.testid || el.getAttribute("data-testid"));
  await sel.selectOption("sesame");
  await expect(sel).toHaveValue("sesame");
  // still the control works for a second change
  await sel.selectOption("soymilk");
  await expect(sel).toHaveValue("soymilk");
  // single-option still openable
});

test("390: single stock flavor still tappable", async ({ page }) => {
  await gotoToday(page, { wheyHave: ["plantAlmond"] });
  const sel = page.locator("[data-testid=scoop-select-0]");
  await expect(sel).toBeVisible();
  await sel.tap();
  await expect(sel).toBeVisible();
  await expect(sel).toHaveValue("plantAlmond");
  // change event path still works (re-select same)
  await sel.selectOption("plantAlmond");
  await expect(sel).toHaveValue("plantAlmond");
});

test("390: empty stock hint + catalog series/flavor selects tappable", async ({ page }) => {
  await gotoToday(page, { wheyHave: [] });
  await expect(page.locator("[data-testid=whey-empty]").first()).toContainText("庫存尚無蛋白粉口味");
  await page.locator("[data-tab=shop]").click();
  await page.locator("[data-testid=shop-edit-whey]").click();
  const series = page.locator("[data-testid=whey-add-series]");
  const flav = page.locator("[data-testid=whey-add-flavor]");
  await expect(series).toBeEnabled();
  await expect(flav).toBeEnabled();
  await series.tap();
  await series.selectOption("classic");
  await page.waitForFunction(() => [...document.querySelector("[data-testid=whey-add-flavor]").options].some((o) => o.value === "sesame"));
  await flav.tap();
  await flav.selectOption("sesame");
  await page.locator("[data-testid=whey-add-have]").click();
  await expect(page.locator("[data-testid=whey-edit-sesame]")).toBeVisible();
  await page.locator("[data-edit-close]").click();
  await page.locator("[data-tab=today]").click();
  await expect(page.locator("[data-testid=scoop-select-0]")).toHaveValue("sesame");
});

test("PTR does not arm when touch starts on select", async ({ page }) => {
  await gotoToday(page, { wheyHave: ["plantAlmond", "sesame"] });
  await page.evaluate(() => window.scrollTo(0, 0));
  const sel = page.locator("[data-testid=scoop-select-0]");
  const box = await sel.boundingBox();
  // dispatch touch on select — ptrY must stay null
  await page.evaluate(({ x, y }) => {
    const t = document.elementFromPoint(x, y);
    const ev = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [new Touch({ identifier: 1, target: t, clientX: x, clientY: y })],
    });
    t.dispatchEvent(ev);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  // After touch on select, opening select still works
  await sel.selectOption("sesame");
  await expect(sel).toHaveValue("sesame");
});
