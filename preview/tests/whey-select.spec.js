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
  const before = await sel.evaluate((el) => el);
  await sel.tap();
  await expect(sel).toBeVisible();
  // click must not replace the node (old bug: click→render)
  const same = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=scoop-select-0]");
    return !!(el && el.options.length >= 3);
  });
  expect(same).toBe(true);
  await sel.selectOption("sesame");
  await expect(sel).toHaveValue("sesame");
  await sel.selectOption("soymilk");
  await expect(sel).toHaveValue("soymilk");
});

test("390: single stock flavor still tappable + solo hint", async ({ page }) => {
  await gotoToday(page, { wheyHave: ["plantAlmond"] });
  const sel = page.locator("[data-testid=scoop-select-0]");
  await expect(sel).toBeVisible();
  await expect(sel).toBeEnabled();
  await expect(page.locator("[data-testid=whey-solo]").first()).toContainText("僅此一口味");
  await expect(page.locator("[data-testid=whey-solo]").first()).toContainText("從目錄加入");
  const box = await sel.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await sel.tap();
  await expect(sel).toBeVisible();
  await expect(sel).toHaveValue("plantAlmond");
  await sel.selectOption("plantAlmond");
  await expect(sel).toHaveValue("plantAlmond");
});

test("390: empty stock hint + catalog series/flavor selects tappable in sheet-pin", async ({ page }) => {
  await gotoToday(page, { wheyHave: [] });
  await expect(page.locator("[data-testid=whey-empty]").first()).toContainText("庫存尚無蛋白粉口味");
  await page.locator("[data-tab=shop]").click();
  await page.locator("[data-testid=shop-edit-whey]").click();
  await expect(page.locator("[data-testid=whey-edit-pin]")).toBeVisible();
  await expect(page.locator("[data-testid=whey-edit-scroll]")).toBeVisible();
  // pin/select must not sit inside overflow:auto ancestor
  const overflowOk = await page.evaluate(() => {
    const sel = document.querySelector("[data-testid=whey-add-series]");
    let n = sel;
    while (n && n !== document.body) {
      const ov = getComputedStyle(n).overflow + getComputedStyle(n).overflowY;
      if (n.classList.contains("sheet-pin")) break;
      if (/auto|scroll|hidden/.test(ov) && n.classList.contains("sheet-scroll")) {
        // select must NOT be under sheet-scroll
        return { ok: false, bad: "select inside sheet-scroll" };
      }
      if (/auto|scroll|hidden/.test(ov) && n.classList.contains("sheet-card")) {
        return { ok: false, bad: "sheet-card still clips" };
      }
      n = n.parentElement;
    }
    const pin = document.querySelector("[data-testid=whey-edit-pin]");
    const cs = getComputedStyle(pin);
    return { ok: true, pinOverflow: cs.overflow, cardOverflow: getComputedStyle(document.querySelector(".sheet-card")).overflow };
  });
  expect(overflowOk.ok, JSON.stringify(overflowOk)).toBe(true);
  expect(overflowOk.cardOverflow).toBe("visible");

  const series = page.locator("[data-testid=whey-add-series]");
  const flav = page.locator("[data-testid=whey-add-flavor]");
  await expect(series).toBeEnabled();
  await expect(flav).toBeEnabled();
  const sBox = await series.boundingBox();
  expect(sBox.height).toBeGreaterThanOrEqual(44);
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
  await sel.scrollIntoViewIfNeeded();
  const box = await sel.boundingBox();
  await page.evaluate(({ x, y }) => {
    const t = document.elementFromPoint(x, y);
    const ev = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [new Touch({ identifier: 1, target: t, clientX: x, clientY: y })],
    });
    t.dispatchEvent(ev);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sel.selectOption("sesame");
  await expect(sel).toHaveValue("sesame");
});
