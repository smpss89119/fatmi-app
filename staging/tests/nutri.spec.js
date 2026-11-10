const { test, expect } = require("@playwright/test");
const P = `${process.env.FATMI_PREFIX || ""}${process.env.FATMI_PATH || "/staging/"}`;
const TUE_15 = "2026-11-14T15:00:00+07:00";
const url = (hash = "today") => `${P}?debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#${hash}`;
const shot = (n) => (process.env.SHOT_DIR ? { path: `${process.env.SHOT_DIR}/${n}` } : {});
test.use({ viewport: { width: 390, height: 844 } });
async function fresh(page, seed) {
  if (seed) await page.addInitScript((d) => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.setItem("fatcat-v2", JSON.stringify(d)); } }, seed);
  await page.goto(url()); await page.waitForSelector(".ttl");
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-v2") || "{}"));

test.describe("NUTRI r6 (UI clicks)", () => {
  test("1) 蛋白粉 2 份 then 吃了 logs 366/52 and pantry 14 -> 12", async ({ page }) => {
    await fresh(page);
    const row = page.locator("[data-testid=meal-dinner]");
    await page.locator("[data-testid=meal-more-dinner]").click();
    await page.locator("[data-testid=whey2-dinner]").click();
    await expect(row.locator(".nums")).toHaveText("366 · 蛋白 52g");
    await page.locator("[data-eat=dinner]").click();
    await expect(row).toHaveClass(/eaten/);
    await expect(row.locator(".nums")).toHaveText("366 · 蛋白 52g");
    await expect(page.locator("[data-testid=remain]")).toContainText("1784");
    await page.screenshot(shot("fatmi_r6_whey_eaten.png"));
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=whey-total]")).toHaveText("12 份");
  });
  test("2) 吃了別的: pantry first with 份, then 外食, then ＋ 其他; logs and decrements", async ({ page }) => {
    await fresh(page, { wheyHave: ["sesame", "plantAlmond"] });
    await page.locator("[data-eat-else=dinner]").click();
    const list = page.locator("[data-testid=else-list]");
    await expect(list).toBeVisible();
    await expect(page.locator("[data-else-pick]")).toHaveCount(0);
    await expect(page.locator("[data-testid=else-chicken]")).toContainText("剩 7 份");
    const secs = await page.locator("main .sec").allInnerTexts();
    expect(secs[0]).toBe("家裡有的");
    expect(secs).toContain("外食");
    expect(secs).toContain("其他");
    await page.locator("[data-testid=else-inc-chicken]").click();
    await page.locator("[data-testid=else-inc-chicken]").click();
    await page.locator('[data-testid="else-inc-whey:sesame"]').click();
    await page.locator("[data-testid=else-out-bento]").click();
    await page.locator("[data-testid=else-free-open]").click();
    await page.locator("[data-else-free-name]").fill("香蕉");
    await page.locator("[data-else-free-kcal]").fill("90");
    await page.locator("[data-else-free-protein]").fill("1");
    await page.locator("[data-testid=else-free-add]").click();
    await expect(page.locator("[data-testid=else-total]")).toHaveText("1178 kcal · 蛋白 116 g");
    await page.screenshot(shot("fatmi_r6_else.png"));
    await page.locator("[data-testid=else-save]").click();
    await expect(page.locator("[data-testid=meal-dinner] .nums")).toHaveText("1178 · 蛋白 116g");
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-qty-chicken]")).toHaveText("5 份");
    await expect(page.locator("[data-testid=whey-total]")).toHaveText("13 份");
    // untick restores stock
    await page.locator("[data-tab=today]").click();
    await page.locator("[data-eat=dinner]").click();
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-qty-chicken]")).toHaveText("7 份");
    await expect(page.locator("[data-testid=whey-total]")).toHaveText("14 份");
  });
  test("3) ⋯ rename fixes typo and merges duplicate", async ({ page }) => {
    await fresh(page, { shopExtra: [{ id: "x-typo", group: "protein", name: "雞凶 600g", custom: true, amount: "600g", palms: 0 }] });
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-x-typo]")).toContainText("雞凶");
    await page.locator("[data-testid=shop-edit-x-typo]").click();
    await page.locator("[data-testid=edit-name]").fill("雞胸");
    let msg = "";
    page.once("dialog", (d) => { msg = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await page.screenshot(shot("fatmi_r6_edit.png"));
    expect(msg).toBe("合併成 12 份（1440g，以 120g/份計）？");
    await expect(page.locator("[data-testid=shop-x-typo]")).toHaveCount(0);
    await expect(page.locator("[data-testid=shop-qty-chicken]")).toHaveText("12 份");
  });
  test("4) every row shows N 份; old ambiguous data 待確認 kept; 份數 field filled", async ({ page }) => {
    await fresh(page, {
      grocery: { chicken: true },
      shopExtra: [
        { id: "x-old", group: "protein", name: "雞柳 一包", custom: true, amount: "一包", palms: 2, fists: 0 },
        { id: "x-w", group: "starch", name: "燕麥 500g", custom: true, amount: "500g", palms: 0, fists: 0 },
        { id: "x-q", group: "protein", name: "豆腐 2", custom: true, amount: "2", palms: 2, fists: 0 },
      ],
    });
    await page.locator("[data-tab=shop]").click();
    const qtys = await page.locator(".shop-qty:not(.whey-stock)").allInnerTexts();
    expect(qtys.length).toBeGreaterThan(10);
    for (const q of qtys) expect(q.trim()).toMatch(/^(約 )?(\d+(\.\d)?|\?) 份$/);
    await expect(page.locator("[data-testid=shop-pending-x-old]")).toHaveText("待確認");
    await expect(page.locator("[data-testid=shop-qty-x-old]")).toHaveText("2 份");
    await expect(page.locator("[data-testid=shop-pending-x-w]")).toHaveCount(0);
    await expect(page.locator("[data-testid=shop-qty-x-w]")).toHaveText("約 3.3 份");
    const s = await store(page);
    expect(s.shopExtra.find((x) => x.id === "x-old").amount).toBe("一包");
    expect(s.shopExtra.find((x) => x.id === "x-old").palms).toBe(2);
    await page.screenshot(shot("fatmi_r6_pantry.png"), { fullPage: true });
    await page.locator("[data-testid=shop-edit-chicken]").click();
    await expect(page.locator("[data-testid=edit-n]")).toHaveValue("7");
    await page.locator("[data-edit-close]").click();
    await page.locator("[data-testid=shop-edit-x-old]").click();
    await page.locator("[data-testid=edit-n]").fill("3");
    await page.locator("[data-testid=edit-save]").click();
    await expect(page.locator("[data-testid=shop-qty-x-old]")).toHaveText("3 份");
    await expect(page.locator("[data-testid=shop-pending-x-old]")).toHaveCount(0);
  });
  test("r7-1) rename to existing name auto-merges after confirm 合併成 3 份？", async ({ page }) => {
    await fresh(page, { shopExtra: [
      { id: "x-a", group: "protein", name: "雞柳 1 份", custom: true, amount: "1 份", palms: 0 },
      { id: "x-b", group: "protein", name: "雞六 2 份", custom: true, amount: "2 份", palms: 0 },
    ], shopPortions: { "x-a": "150 g", "x-b": "150 g" } });
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-b]").click();
    await page.locator("[data-testid=edit-name]").fill("　雞柳 ");
    let msg = "";
    page.once("dialog", (d) => { msg = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await expect(page.locator("[data-testid=shop-x-b]")).toHaveCount(0);
    expect(msg).toBe("合併成 3 份（450g，以 150g/份計）？");
    await expect(page.locator(".shop-row", { hasText: "雞柳" })).toHaveCount(1);
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("3 份");
    await page.screenshot(shot("fatmi_r7_merge.png"));
    await page.locator("[data-testid=shop-edit-x-a]").click();
    await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("150 g");
  });
  test("r7-2) ?demo=legacy shows 待確認 in throwaway storage, real data untouched", async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.setItem("fatcat-v2", JSON.stringify({ mine: 1 })); } });
    await page.goto(`${P}?demo=legacy&debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#shop`);
    await page.waitForSelector(".ttl");
    await expect(page.locator("[data-testid=demo-tag]")).toBeVisible();
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-pending-x-old]")).toHaveText("待確認");
    await expect(page.locator("[data-testid=shop-qty-x-w]")).toHaveText("約 3.3 份");
    await expect(page.locator("[data-testid=shop-pending-x-w]")).toHaveCount(0);
    await expect(page.locator("[data-testid=shop-qty-x-veg]")).toHaveText("3 份");
    await page.locator("[data-testid=shop-x-q]").scrollIntoViewIfNeeded();
    await page.screenshot(shot("fatmi_r7_legacy.png"));
    const real = await page.evaluate(() => localStorage.getItem("fatcat-v2"));
    expect(JSON.parse(real)).toEqual({ mine: 1 });
  });
  test("r8-1) after merge, edit sheet + chip show current count; persists after reload", async ({ page }) => {
    await fresh(page, { shopExtra: [
      { id: "x-a", group: "protein", name: "雞柳 1 份", custom: true, amount: "1 份", palms: 0 },
      { id: "x-b", group: "protein", name: "雞六 2 份", custom: true, amount: "2 份", palms: 0 },
    ], shopPortions: { "x-a": "150 g", "x-b": "150 g" } });
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-b]").click();
    await page.locator("[data-testid=edit-name]").fill("雞柳");
    page.once("dialog", (d) => d.accept());
    await page.locator("[data-testid=edit-save]").click();
    const check = async () => {
      await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("3 份");
      await expect(page.locator("[data-testid=shop-chip-x-a]")).toHaveText("雞柳 3 份");
      await expect(page.locator("[data-testid=shop-chip-x-b]")).toHaveCount(0);
      await page.locator("[data-testid=shop-edit-x-a]").click();
      await expect(page.locator("[data-testid=edit-n]")).toHaveValue("3");
      await expect(page.locator("[data-testid=edit-qty]")).toHaveValue("450 g");
      await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("150 g");
    };
    await check();
    await page.screenshot(shot("fatmi_r8_merged_sheet.png"));
    await page.reload(); await page.waitForSelector(".ttl");
    await page.locator("[data-tab=shop]").click();
    await check();
  });
  test("r8-2) legacy auto-converted items prefill 一份是多少 with basis and show 原 500g", async ({ page }) => {
    await page.goto(`${P}?demo=legacy&debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#shop`);
    await page.waitForSelector(".ttl");
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-w]").click();
    await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("150 g");
    await expect(page.locator("[data-testid=edit-orig]")).toHaveText("原 500g");
    await expect(page.locator("[data-testid=edit-n]")).toHaveValue("3.3");
    await page.screenshot(shot("fatmi_r8_legacy_basis.png"));
    await page.locator("[data-edit-close]").click();
    await page.locator("[data-testid=shop-edit-x-veg]").click();
    await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("100 g");
    await expect(page.locator("[data-testid=edit-orig]")).toHaveText("原 300g");
  });
  test("r8-3) merge with different portion sizes converts via grams; pending blocks", async ({ page }) => {
    await fresh(page, { shopExtra: [
      { id: "x-a", group: "starch", name: "燕麥 3 份", custom: true, amount: "3 份", palms: 0 },
      { id: "x-b", group: "starch", name: "燕麥片 100 g", custom: true, amount: "100 g", palms: 0 },
      { id: "x-p", group: "starch", name: "麥片 一包", custom: true, amount: "一包", fists: 2 },
    ], shopPortions: { "x-a": "150 g", "x-b": "100 g" } });
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-b]").click();
    await page.locator("[data-testid=edit-name]").fill("燕麥");
    let msg = "";
    page.once("dialog", (d) => { msg = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await expect(page.locator("[data-testid=shop-x-b]")).toHaveCount(0);
    expect(msg).toBe("合併成約 3.7 份（550g，以 150g/份計）？");
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("約 3.7 份");
    await page.screenshot(shot("fatmi_r8_diff_merge.png"));
    await page.locator("[data-testid=shop-edit-x-p]").click();
    await page.locator("[data-testid=edit-name]").fill("燕麥");
    let blocked = "";
    page.once("dialog", (d) => { blocked = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await expect.poll(() => blocked).toBe("請先設定「一份是多少」再合併");
    await expect(page.locator("[data-testid=shop-edit-sheet]")).toBeVisible();
    await page.locator("[data-edit-close]").click();
    await expect(page.locator("[data-testid=shop-x-p]")).toBeVisible();
    await page.reload(); await page.waitForSelector(".ttl");
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("約 3.7 份");
    await expect(page.locator("[data-testid=shop-x-b]")).toHaveCount(0);
  });
  test("r9) no size + no weight blocks merge; built-in shows default 一份是多少", async ({ page }) => {
    await fresh(page, { shopExtra: [
      { id: "x-a", group: "protein", name: "雞柳 1 份", custom: true, amount: "1 份", palms: 0 },
      { id: "x-b", group: "protein", name: "雞六 2 份", custom: true, amount: "2 份", palms: 0 },
    ] });
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-b]").click();
    await page.locator("[data-testid=edit-name]").fill("雞柳");
    let blocked = "";
    page.once("dialog", (d) => { blocked = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await expect.poll(() => blocked).toBe("請先設定「一份是多少」再合併");
    await expect(page.locator("[data-testid=shop-edit-sheet]")).toBeVisible();
    await page.screenshot(shot("fatmi_r9_block.png"));
    await page.locator("[data-edit-close]").click();
    await expect(page.locator("[data-testid=shop-qty-x-b]")).toHaveText("2 份");
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("1 份");
    await page.locator("[data-testid=shop-edit-chicken]").click();
    await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("120 g");
    await page.screenshot(shot("fatmi_r9_builtin.png"));
  });
  test("r10) 150g×1 + 100g×2 = 350g → 約 2.3 份, exact after reload; legacy eat decrements grams", async ({ page }) => {
    await fresh(page, { shopExtra: [
      { id: "x-a", group: "starch", name: "燕麥 1 份", custom: true, amount: "1 份", fists: 0 },
      { id: "x-b", group: "starch", name: "燕麥片 2 份", custom: true, amount: "2 份", fists: 0 },
    ], shopPortions: { "x-a": "150 g", "x-b": "100 g" } });
    await page.locator("[data-tab=shop]").click();
    await page.locator("[data-testid=shop-edit-x-b]").click();
    await page.locator("[data-testid=edit-name]").fill("燕麥");
    let msg = "";
    page.once("dialog", (d) => { msg = d.message(); d.accept(); });
    await page.locator("[data-testid=edit-save]").click();
    await expect(page.locator("[data-testid=shop-x-b]")).toHaveCount(0);
    expect(msg).toBe("合併成約 2.3 份（350g，以 150g/份計）？");
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("約 2.3 份");
    await page.screenshot(shot("fatmi_r10_merge_350g.png"));
    await page.reload(); await page.waitForSelector(".ttl");
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-qty-x-a]")).toHaveText("約 2.3 份");
    await page.locator("[data-testid=shop-edit-x-a]").click();
    await expect(page.locator("[data-testid=edit-qty]")).toHaveValue("350 g");
    await expect(page.locator("[data-testid=edit-portion]")).toHaveValue("150 g");
  });
  test("r10b) legacy 燕麥 500g stays 500g, 約 3.3 份; eating 1 份 leaves 350g (約 2.3 份)", async ({ page }) => {
    await page.goto(`${P}?demo=legacy&debug=1&sleep=8&now=${encodeURIComponent(TUE_15)}#today`);
    await page.waitForSelector(".ttl");
    await page.locator("[data-eat-else=dinner]").click();
    await page.locator('[data-testid="else-inc-x-w"]').click();
    await page.locator("[data-testid=else-save]").click();
    await page.locator("[data-tab=shop]").click();
    await expect(page.locator("[data-testid=shop-qty-x-w]")).toHaveText("約 2.3 份");
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("fatcat-demo")));
    expect(s.shopExtra.find((x) => x.id === "x-w").amount).toBe("500g");
    await page.screenshot(shot("fatmi_r10_legacy_eat.png"));
  });
});
